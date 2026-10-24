import { ItemResolutionEnvelope } from '../orchestrator/stages.types.js';
import { AuditEvaluationContext } from '../audit/audit.service.js';
import { ItemAuditResult } from '../audit/audit.types.js';
import {
  RepairItemResult,
  OverallRepairReport,
  RepairedCandidateSelection
} from './repair.types.js';
import { AIRepairCandidate, AIRepairPromptContext, ChatMessage } from '../ai/ai.types.js';
import { AIRepairOutputSchema, AIRepairOutput } from '../ai/ai.schemas.js';
import { AIOrchestratorProvider, aiProvider } from '../ai/ai.provider.js';
import { ServerQlooClient, qlooClient } from '../qloo/qloo.client.js';
import { EvidenceRetrievalService, evidenceService } from '../evidence/evidence.service.js';
import { CulturalGroundingAuditEngine, auditEngine } from '../audit/audit.service.js';
import { logger } from '../../utils/logger.js';

export interface RepairServiceDependencies {
  ai?: AIOrchestratorProvider;
  qloo?: ServerQlooClient;
  evidence?: EvidenceRetrievalService;
  audit?: CulturalGroundingAuditEngine;
}

export class RepairService {
  private readonly ai: AIOrchestratorProvider;
  private readonly qloo: ServerQlooClient;
  private readonly evidenceSvc: EvidenceRetrievalService;
  private readonly auditEngine: CulturalGroundingAuditEngine;

  constructor(deps?: RepairServiceDependencies) {
    this.ai = deps?.ai ?? aiProvider;
    this.qloo = deps?.qloo ?? qlooClient;
    this.evidenceSvc = deps?.evidence ?? evidenceService;
    this.auditEngine = deps?.audit ?? auditEngine;
  }

  /**
   * Evaluates whether an audited item requires repair.
   * If recommendation is already supported (score >= 80 and no failed constraints),
   * skip AI repair to prevent unnecessary latency, tokens, and cost.
   */
  public shouldRepair(envelope: ItemResolutionEnvelope): boolean {
    const audit = envelope.audit;
    if (!audit) {
      return true;
    }

    const isStronglySupported =
      audit.overallScore >= 80 &&
      audit.decision.status === 'supported' &&
      audit.dimensions.constraintCompliance.classification === 'Supported';

    return !isStronglySupported;
  }

  /**
   * Retrieves verified alternative candidates from Qloo.
   * Strict Evidence Firewall: Candidates MUST originate from real Qloo signals or candidate searches.
   */
  public async getVerifiedCandidates(
    envelope: ItemResolutionEnvelope,
    context?: AuditEvaluationContext
  ): Promise<AIRepairCandidate[]> {
    const candidatesMap = new Map<string, AIRepairCandidate>();
    const originalNameLower = envelope.item.name.toLowerCase().trim();
    const originalId = envelope.resolution.resolvedEntity?.id;

    // 1. Extract high-affinity related entities from Stage 3 Qloo evidence
    if (envelope.evidence && envelope.evidence.signals.length > 0) {
      envelope.evidence.signals
        .filter(
          (s) =>
            s.signalType === 'taste_affinity' &&
            s.relatedEntityId &&
            s.relatedEntityName &&
            s.relatedEntityId !== originalId &&
            s.relatedEntityName.toLowerCase().trim() !== originalNameLower
        )
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 6)
        .forEach((s) => {
          if (s.relatedEntityId && !candidatesMap.has(s.relatedEntityId)) {
            candidatesMap.set(s.relatedEntityId, {
              name: s.relatedEntityName || 'Related Entity',
              entityId: s.relatedEntityId,
              type: 'urn:entity:movie',
              category: 'entity',
              affinityValue: s.value,
              tags: s.tags || [],
              relationship: s.relationship || 'high_taste_affinity'
            });
          }
        });
    }

    // 2. If fewer than 3 candidates found, search Qloo using audience or constraints
    if (candidatesMap.size < 3) {
      const searchTerms: string[] = [];
      if (context?.constraints && context.constraints.length > 0) {
        // Use positive constraints as search terms
        const positiveConstraints = context.constraints.filter(
          (c: string) => !c.toLowerCase().startsWith('no ') && !c.toLowerCase().startsWith('without ')
        );
        searchTerms.push(...positiveConstraints);
      }
      if (context?.audience) {
        searchTerms.push(context.audience);
      }

      const searchQuery = searchTerms.join(' ').trim() || envelope.item.name;

      try {
        const qlooResults = await this.qloo.searchCandidates(searchQuery, { take: 6 });
        for (const cand of qlooResults) {
          if (
            cand.id &&
            cand.id !== originalId &&
            cand.name.toLowerCase().trim() !== originalNameLower &&
            !candidatesMap.has(cand.id)
          ) {
            candidatesMap.set(cand.id, {
              name: cand.name,
              entityId: cand.id,
              type: cand.type,
              category: cand.category,
              tags: cand.tags || [],
              imageUrl: cand.imageUrl,
              relationship: 'qloo_cultural_search'
            });
          }
          if (candidatesMap.size >= 6) break;
        }
      } catch (err) {
        logger.warn(`[Repair] Secondary Qloo candidate search failed: ${err}`);
      }
    }

    return Array.from(candidatesMap.values());
  }

  /**
   * Constructs strict prompt for AI repair reasoning layer.
   * Enforces the Evidence Firewall and explicit No-Hallucination rule.
   */
  public buildPrompt(
    envelope: ItemResolutionEnvelope,
    candidates: AIRepairCandidate[],
    context?: AuditEvaluationContext
  ): ChatMessage[] {
    const audit = envelope.audit!;

    // Identify failed or weak dimensions
    const failedDimensions: string[] = [];
    const dimensionSummaries: Record<string, { score: number; classification: string; reason: string }> = {};

    Object.entries(audit.dimensions || {}).forEach(([key, dim]) => {
      const dimAny = dim as unknown as Record<string, unknown>;
      const reason =
        (Array.isArray(dim?.reasons) && dim.reasons[0]) ||
        (typeof dimAny?.reasoning === 'string' && dimAny.reasoning) ||
        'No reason specified';

      dimensionSummaries[key] = {
        score: dim?.score ?? 0,
        classification: dim?.classification || 'Unverified',
        reason
      };
      if ((dim?.score ?? 0) < 70 || dim?.classification === 'Unverified') {
        failedDimensions.push(key);
      }
    });

    const promptContext: AIRepairPromptContext = {
      originalItem: envelope.item.name,
      auditContext: {
        overallScore: audit.overallScore,
        decisionStatus: audit.decision?.status || 'unverified',
        decisionLabel: audit.decision?.label || 'Unverified',
        decisionExplanation: audit.decision?.explanation || 'Pending audit assessment',
        failedDimensions,
        dimensionSummaries
      },
      userContext: {
        audience: context?.audience,
        location: context?.location,
        constraints: context?.constraints || []
      },
      verifiedCandidates: candidates
    };

    const systemPrompt = `You are the TasteAudit AI Repair Reasoning Layer.
Your task is to analyze an audited recommendation that had grounding issues and select the best replacement from the VERIFIED QLOO CANDIDATES provided by the backend.

CRITICAL RULES (EVIDENCE FIREWALL):
1. You must ONLY select a candidate from the provided VERIFIED QLOO CANDIDATES list. You are strictly forbidden from inventing new candidates, entities, IDs, or cultural facts.
2. If none of the provided candidates adequately address the user's constraints and cultural context, you must return "insufficient_evidence".
3. You must not fabricate scores, sources, or affinity percentages.
4. You are NOT the final scoring authority. The deterministic audit engine will independently audit the selected candidate.
5. You must respond ONLY with a valid JSON object matching the requested schema.

SCHEMA SPECIFICATION:
{
  "repairStatus": "repaired" | "no_repair" | "insufficient_evidence",
  "strategy": "concise description of repair approach (e.g. genre_alignment, negative_constraint_remedy)",
  "selectedCandidate": {
    "name": "exact name from verified candidates",
    "entityId": "exact entityId from verified candidates"
  },
  "reasoning": "clear explanation of why this replacement satisfies cultural grounding and user constraints",
  "evidenceRefs": ["array of Qloo evidence references supporting this choice"],
  "constraintHandling": ["brief notes on how user constraints were respected"],
  "confidence": 0.0 to 1.0 (number representing confidence in repair strategy)
}`;

    const userPrompt = `AUDIT CONTEXT & VERIFIED QLOO EVIDENCE:
${JSON.stringify(promptContext, null, 2)}

Analyze the grounding deficiencies and select the best verified candidate from the provided list. Return JSON only.`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Executes AI-powered repair for a single item envelope.
   */
  public async repairItem(
    envelope: ItemResolutionEnvelope,
    context?: AuditEvaluationContext
  ): Promise<RepairItemResult> {
    const originalItem = envelope.item.name;
    const beforeAudit = envelope.audit!;

    // 1. Check if repair is needed
    if (!this.shouldRepair(envelope)) {
      logger.info(`[Repair] "${originalItem}" is already strongly supported. Skipping AI repair.`);
      return {
        originalItem,
        status: 'no_repair',
        repairStrategy: 'no_repair_required',
        reasoning: `Original recommendation "${originalItem}" is already strongly grounded (${beforeAudit.overallScore}/100) with verified Qloo evidence.`,
        beforeAudit,
        afterAudit: beforeAudit,
        scoreDelta: 0,
        verifiedImprovement: false,
        providerUsed: 'none',
        evidenceRefs: beforeAudit.evidenceRefs,
        constraintHandling: ['All constraints already verified or neutral.']
      };
    }

    // 2. Retrieve verified alternative candidates from Qloo
    logger.info(`[Repair] Sourcing verified Qloo candidates for "${originalItem}"...`);
    const verifiedCandidates = await this.getVerifiedCandidates(envelope, context);

    if (verifiedCandidates.length === 0) {
      logger.warn(`[Repair] Zero verified candidates available from Qloo for "${originalItem}".`);
      return {
        originalItem,
        status: 'insufficient_evidence',
        repairStrategy: 'insufficient_qloo_candidates',
        reasoning: `Qloo taste graph yielded zero verified alternative candidates for "${originalItem}". In accordance with the Evidence Firewall, no replacement can be fabricated.`,
        beforeAudit,
        evidenceRefs: [],
        constraintHandling: []
      };
    }

    // 3. Dispatch to AI Provider (Groq with OpenRouter fallback)
    const messages = this.buildPrompt(envelope, verifiedCandidates, context);
    const aiResult = await this.ai.executeCompletion(messages, { jsonMode: true, temperature: 0.1 });

    if (!aiResult.success || !aiResult.content) {
      logger.warn(`[Repair] AI reasoning layer unavailable for "${originalItem}": ${aiResult.error}`);
      return {
        originalItem,
        status: 'repair_failed',
        repairStrategy: 'ai_provider_unavailable',
        reasoning: `AI repair layer unavailable: ${aiResult.error || 'Provider returned empty response'}. Original audit result preserved.`,
        beforeAudit,
        providerUsed: aiResult.provider,
        evidenceRefs: [],
        constraintHandling: []
      };
    }

    // 4. Validate AI Output against Strict Schema
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(aiResult.content);
    } catch {
      logger.warn(`[Repair] AI returned malformed JSON for "${originalItem}".`);
      return {
        originalItem,
        status: 'repair_failed',
        repairStrategy: 'malformed_json_response',
        reasoning: 'AI reasoning layer returned invalid JSON. Response rejected by Evidence Firewall.',
        beforeAudit,
        providerUsed: aiResult.provider,
        evidenceRefs: [],
        constraintHandling: []
      };
    }

    const validation = AIRepairOutputSchema.safeParse(parsedJson);
    if (!validation.success) {
      logger.warn(`[Repair] AI repair output schema validation failed: ${validation.error.message}`);
      return {
        originalItem,
        status: 'repair_failed',
        repairStrategy: 'invalid_schema_output',
        reasoning: `AI repair output failed schema validation: ${validation.error.issues[0]?.message || 'Schema mismatch'}. Rejected.`,
        beforeAudit,
        providerUsed: aiResult.provider,
        evidenceRefs: [],
        constraintHandling: []
      };
    }

    const aiOutput: AIRepairOutput = validation.data;

    if (aiOutput.repairStatus === 'no_repair' || aiOutput.repairStatus === 'insufficient_evidence') {
      return {
        originalItem,
        status: aiOutput.repairStatus,
        repairStrategy: aiOutput.strategy,
        reasoning: aiOutput.reasoning,
        beforeAudit,
        providerUsed: aiResult.provider,
        evidenceRefs: aiOutput.evidenceRefs,
        constraintHandling: aiOutput.constraintHandling
      };
    }

    // 5. Strict Candidate Validation against Evidence Firewall
    const selected = aiOutput.selectedCandidate;
    if (!selected || !selected.entityId) {
      return {
        originalItem,
        status: 'repair_failed',
        repairStrategy: 'missing_candidate_selection',
        reasoning: 'AI indicated repaired status but failed to specify a selected candidate.',
        beforeAudit,
        providerUsed: aiResult.provider,
        evidenceRefs: [],
        constraintHandling: []
      };
    }

    const matchedVerifiedCandidate = verifiedCandidates.find(
      (c) => c.entityId.toLowerCase() === selected.entityId.toLowerCase()
    );

    if (!matchedVerifiedCandidate) {
      logger.warn(
        `[Evidence Firewall Violation] AI selected unknown candidate "${selected.name}" (ID: ${selected.entityId}) not in verified set.`
      );
      return {
        originalItem,
        status: 'repair_failed',
        repairStrategy: 'unverified_candidate_hallucination_rejected',
        reasoning: `Evidence Firewall rejected candidate "${selected.name}" (ID: ${selected.entityId}): Entity was not in the backend-supplied verified Qloo candidates list.`,
        beforeAudit,
        providerUsed: aiResult.provider,
        evidenceRefs: [],
        constraintHandling: []
      };
    }

    // 6. Deterministic Re-Audit of the Selected Candidate
    logger.info(
      `[Repair] Re-auditing selected candidate "${matchedVerifiedCandidate.name}" (${matchedVerifiedCandidate.entityId})...`
    );

    // Retrieve fresh evidence for the repaired entity
    const repairedEvidence = await this.evidenceSvc.retrieveEvidence({
      entityId: matchedVerifiedCandidate.entityId,
      entityName: matchedVerifiedCandidate.name,
      entityType: matchedVerifiedCandidate.type,
      category: matchedVerifiedCandidate.category,
      audience: context?.audience,
      location: context?.location,
      constraints: context?.constraints
    });

    const repairedEnvelope: ItemResolutionEnvelope = {
      item: { id: `rep_${Date.now()}`, name: matchedVerifiedCandidate.name },
      resolution: {
        query: matchedVerifiedCandidate.name,
        status: 'resolved',
        resolvedEntity: {
          id: matchedVerifiedCandidate.entityId,
          name: matchedVerifiedCandidate.name,
          type: matchedVerifiedCandidate.type,
          category: matchedVerifiedCandidate.category,
          source: 'qloo',
          tags: matchedVerifiedCandidate.tags,
          imageUrl: matchedVerifiedCandidate.imageUrl,
          retrievedAt: new Date().toISOString()
        },
        candidates: [],
        provenance: {
          qlooType: matchedVerifiedCandidate.type || 'entity',
          source: 'qloo-hackathon-api',
          operation: 'resolve_repaired_entity',
          classification: 'Supported',
          retrievedAt: new Date().toISOString(),
          correlationId: `rep_prov_${Date.now()}`,
          resolutionStatus: 'resolved'
        }
      },
      evidence: repairedEvidence
    };

    // Calculate deterministic audit independently
    const afterAudit: ItemAuditResult = this.auditEngine.auditItem(repairedEnvelope, context);
    repairedEnvelope.audit = afterAudit;

    const scoreDelta = afterAudit.overallScore - beforeAudit.overallScore;
    const verifiedImprovement = afterAudit.overallScore > beforeAudit.overallScore;

    const candidateSelection: RepairedCandidateSelection = {
      name: matchedVerifiedCandidate.name,
      entityId: matchedVerifiedCandidate.entityId,
      type: matchedVerifiedCandidate.type,
      imageUrl: matchedVerifiedCandidate.imageUrl
    };

    logger.info(
      `[Repair] Repaired "${originalItem}" -> "${matchedVerifiedCandidate.name}". Before: ${beforeAudit.overallScore}, After: ${afterAudit.overallScore} (Delta: ${scoreDelta > 0 ? '+' : ''}${scoreDelta})`
    );

    return {
      originalItem,
      status: 'repaired',
      repairStrategy: aiOutput.strategy,
      selectedCandidate: candidateSelection,
      reasoning: aiOutput.reasoning,
      beforeAudit,
      afterAudit,
      scoreDelta,
      verifiedImprovement,
      providerUsed: aiResult.provider,
      evidenceRefs: [
        ...aiOutput.evidenceRefs,
        ...afterAudit.evidenceRefs,
        `qloo:repaired_entity:${matchedVerifiedCandidate.entityId}`
      ],
      constraintHandling: aiOutput.constraintHandling,
      repairedEnvelope
    };
  }

  /**
   * Aggregates multiple repair results into an overall report.
   */
  public aggregateRepairReport(results: RepairItemResult[]): OverallRepairReport {
    const totalItemsAudited = results.length;
    const itemsRepairedCount = results.filter((r) => r.status === 'repaired').length;
    const itemsSkippedCount = results.filter((r) => r.status === 'no_repair').length;
    const itemsFailedCount = results.filter(
      (r) => r.status === 'repair_failed' || r.status === 'insufficient_evidence'
    ).length;

    const beforeScores = results.map((r) => r.beforeAudit.overallScore);
    const avgBefore =
      beforeScores.length > 0 ? Math.round(beforeScores.reduce((a, b) => a + b, 0) / beforeScores.length) : 0;

    const afterScores = results.map((r) => (r.afterAudit ? r.afterAudit.overallScore : r.beforeAudit.overallScore));
    const avgAfter =
      afterScores.length > 0 ? Math.round(afterScores.reduce((a, b) => a + b, 0) / afterScores.length) : 0;

    const netImprovement = avgAfter - avgBefore;

    return {
      totalItemsAudited,
      itemsRepairedCount,
      itemsSkippedCount,
      itemsFailedCount,
      averageScoreBefore: avgBefore,
      averageScoreAfter: avgAfter,
      netImprovement,
      repairedItems: results
    };
  }
}

export const repairService = new RepairService();
