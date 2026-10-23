import { AIOrchestratorProvider, aiProvider } from '../ai/ai.provider.js';
import { RepairService, repairService } from '../repair/repair.service.js';
import { EvidenceRetrievalService, evidenceService } from '../evidence/evidence.service.js';
import { EntityResolutionService, resolutionService } from '../resolution/resolution.service.js';
import { CulturalGroundingAuditEngine, auditEngine } from '../audit/audit.service.js';
import { ParseStageInput, ItemResolutionEnvelope } from '../orchestrator/stages.types.js';
import { OverallAuditReport } from '../audit/audit.types.js';
import { RepairItemResult } from '../repair/repair.types.js';
import { AIRepairCandidate } from '../ai/ai.types.js';
import {
  AgentLoopOptions,
  AgentLoopResult,
  AgentTraceEvent,
  AgentExecutionTrace,
  AgentDecisionType,
  AgentState,
  AgentVerifiedCandidateInfo
} from './agent.types.js';
import { AgentDecisionSchema } from './agent.schemas.js';
import { buildAgentSystemPrompt, buildAgentUserPrompt } from './agent.prompts.js';
import { logger } from '../../utils/logger.js';

export interface AgentLoopDependencies {
  ai?: AIOrchestratorProvider;
  repairSvc?: RepairService;
  evidenceSvc?: EvidenceRetrievalService;
  resolutionSvc?: EntityResolutionService;
  auditEngine?: CulturalGroundingAuditEngine;
}

export class TasteAuditAgentLoop {
  private readonly ai: AIOrchestratorProvider;
  private readonly repairSvc: RepairService;
  private readonly evidenceSvc: EvidenceRetrievalService;
  private readonly resolutionSvc: EntityResolutionService;
  private readonly auditEngine: CulturalGroundingAuditEngine;

  constructor(deps?: AgentLoopDependencies) {
    this.ai = deps?.ai ?? aiProvider;
    this.repairSvc = deps?.repairSvc ?? repairService;
    this.evidenceSvc = deps?.evidenceSvc ?? evidenceService;
    this.resolutionSvc = deps?.resolutionSvc ?? resolutionService;
    this.auditEngine = deps?.auditEngine ?? auditEngine;
  }

  /**
   * Runs the bounded Agent Loop over an initial deterministic audit report and item envelopes.
   */
  public async runLoop(
    input: ParseStageInput,
    initialEnvelopes: ItemResolutionEnvelope[],
    initialAuditReport: OverallAuditReport,
    options?: AgentLoopOptions
  ): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const maxIterations = Math.min(Math.max(options?.maxIterations ?? 3, 1), 5);
    const timeoutMs = options?.timeoutMs ?? 15000;

    let currentEnvelopes = [...initialEnvelopes];
    let currentAuditReport = initialAuditReport;
    const initialScore = initialAuditReport.overallScore;

    const events: AgentTraceEvent[] = [];
    const actionHistory = new Set<string>();
    const repairResults: RepairItemResult[] = [];

    let stepCounter = 1;
    let terminalState: 'ACCEPTED' | 'STOPPED' | 'FAILED' = 'STOPPED';
    let finalStopReason = 'max_iterations_reached';

    const addTraceEvent = (eventData: Omit<AgentTraceEvent, 'step' | 'timestamp' | 'durationMs'>): void => {
      events.push({
        step: stepCounter++,
        ...eventData,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime
      });
    };

    const evaluationContext = {
      audience: input.audienceContext,
      location: input.location,
      constraints: input.constraints ?? []
    };

    // Check if initial audit already satisfies acceptance criteria
    const initialAcceptable =
      currentAuditReport.overallScore >= 80 &&
      currentAuditReport.decision.status === 'supported' &&
      currentEnvelopes.every(
        (e) =>
          e.audit &&
          e.audit.overallScore >= 80 &&
          e.audit.decision.status === 'supported' &&
          e.audit.dimensions.constraintCompliance.classification === 'Supported'
      );

    if (initialAcceptable) {
      addTraceEvent({
        iteration: 1,
        state: 'COMPLETED',
        decision: 'ACCEPT',
        reasoning: 'Initial audit demonstrates full cultural grounding (Score >= 80) and satisfies all constraints.',
        scoreBefore: currentAuditReport.overallScore,
        scoreAfter: currentAuditReport.overallScore,
        scoreDelta: 0,
        evidenceRefs: currentAuditReport.provenance ? [currentAuditReport.provenance.correlationId] : [],
        stopReason: 'all_items_supported'
      });

      return {
        auditReport: currentAuditReport,
        envelopes: currentEnvelopes,
        trace: {
          totalIterations: 1,
          terminalState: 'ACCEPTED',
          finalStopReason: 'all_items_supported',
          totalDurationMs: Date.now() - startTime,
          initialOverallScore: initialScore,
          finalOverallScore: currentAuditReport.overallScore,
          netScoreImprovement: 0,
          events
        }
      };
    }

    // Bounded Iteration Loop
    let iteration = 1;
    for (; iteration <= maxIterations; iteration++) {
      logger.info(`[AgentLoop] Starting iteration ${iteration}/${maxIterations}...`);

      // 1. Global Timeout Budget Check
      if (Date.now() - startTime >= timeoutMs) {
        logger.warn(`[AgentLoop] Global timeout budget (${timeoutMs}ms) exceeded.`);
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'STOP',
          reasoning: `Global agent execution timeout budget of ${timeoutMs}ms reached. Safely preserving deterministic baseline.`,
          stopReason: 'global_timeout_exceeded',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'STOPPED';
        finalStopReason = 'global_timeout_exceeded';
        break;
      }

      // 2. Acceptance Check
      const allSupported =
        currentAuditReport.overallScore >= 80 &&
        currentAuditReport.decision.status === 'supported' &&
        currentEnvelopes.every(
          (e) =>
            e.audit &&
            e.audit.overallScore >= 80 &&
            e.audit.decision.status === 'supported' &&
            e.audit.dimensions.constraintCompliance.classification === 'Supported'
        );

      if (allSupported) {
        logger.info(`[AgentLoop] Acceptance criteria satisfied at iteration ${iteration}.`);
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'ACCEPT',
          reasoning: 'All recommendation items are culturally grounded and satisfy all constraints.',
          stopReason: 'all_items_supported',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'ACCEPTED';
        finalStopReason = 'all_items_supported';
        break;
      }

      // 3. Pre-gather verified Qloo candidates for items needing improvement
      const candidatesMap = new Map<string, AIRepairCandidate[]>();
      for (const env of currentEnvelopes) {
        if (this.repairSvc.shouldRepair(env)) {
          const verified = await this.repairSvc.getVerifiedCandidates(env, evaluationContext);
          candidatesMap.set(env.item.id, verified);
        }
      }

      // 4. AI Provider Verification
      if (!this.ai.isAnyConfigured()) {
        logger.warn('[AgentLoop] No AI providers are configured. Halting agent loop safely.');
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'STOP',
          reasoning: 'AI reasoning layer unavailable: GROQ_API_KEY and OPENROUTER_API_KEY unconfigured. Preserving deterministic baseline.',
          stopReason: 'provider_unavailable',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'STOPPED';
        finalStopReason = 'provider_unavailable';
        break;
      }

      // 5. Build Prompt and Request Decision from AI Provider
      const messages = [
        { role: 'system' as const, content: buildAgentSystemPrompt() },
        {
          role: 'user' as const,
          content: buildAgentUserPrompt({
            overallReport: currentAuditReport,
            envelopes: currentEnvelopes,
            iteration,
            maxIterations,
            candidatesMap,
            actionHistory: Array.from(actionHistory),
            context: evaluationContext
          })
        }
      ];

      addTraceEvent({
        iteration,
        state: 'EVALUATING',
        decision: 'STOP', // Placeholder while evaluating
        reasoning: `Evaluating audit results against cultural taste constraints at iteration ${iteration}.`,
        scoreBefore: currentAuditReport.overallScore,
        evidenceRefs: []
      });

      const aiResult = await this.ai.executeCompletion(messages, { jsonMode: true, temperature: 0.1 });

      if (!aiResult.success || !aiResult.content) {
        logger.warn(`[AgentLoop] AI provider completion failed: ${aiResult.error}`);
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'STOP',
          reasoning: `AI reasoning provider failed (${aiResult.error || 'Empty response'}). Preserving deterministic baseline.`,
          stopReason: 'provider_failure',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'STOPPED';
        finalStopReason = 'provider_failure';
        break;
      }

      // 6. Parse and Validate LLM Decision JSON
      let parsedDecision: unknown;
      try {
        parsedDecision = JSON.parse(aiResult.content);
      } catch {
        logger.warn('[AgentLoop] Malformed JSON received from AI provider.');
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'STOP',
          reasoning: 'AI reasoning layer returned invalid JSON. Terminating loop to protect deterministic state.',
          stopReason: 'invalid_decision_schema',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'STOPPED';
        finalStopReason = 'invalid_decision_schema';
        break;
      }

      const validation = AgentDecisionSchema.safeParse(parsedDecision);
      if (!validation.success) {
        logger.warn(`[AgentLoop] Agent decision schema validation failed: ${validation.error.message}`);
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'STOP',
          reasoning: `AI decision payload failed schema validation: ${validation.error.issues[0]?.message || 'Schema mismatch'}.`,
          stopReason: 'invalid_decision_schema',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'STOPPED';
        finalStopReason = 'invalid_decision_schema';
        break;
      }

      const decisionPayload = validation.data;
      logger.info(`[AgentLoop] Decision received: ${decisionPayload.decision} (Reasoning: ${decisionPayload.reasoning})`);

      // 7. Execute Decision
      if (decisionPayload.decision === 'ACCEPT') {
        // Enforce score authority: verify that the state is genuinely acceptable
        const isAcceptable =
          currentAuditReport.overallScore >= 70 &&
          !currentEnvelopes.some(
            (e) => e.audit?.dimensions.constraintCompliance.classification === 'Unverified' && e.audit.overallScore < 50
          );

        if (isAcceptable) {
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'ACCEPT',
            reasoning: decisionPayload.reasoning,
            stopReason: 'all_items_supported',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'ACCEPTED';
          finalStopReason = 'all_items_supported';
          break;
        } else {
          logger.warn('[AgentLoop] Agent proposed ACCEPT on unsupported state. Stopping loop safely.');
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'STOP',
            reasoning: 'Agent proposed ACCEPT but deterministic audit does not satisfy grounding threshold. Halting safely.',
            stopReason: 'premature_accept_rejected',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'STOPPED';
          finalStopReason = 'premature_accept_rejected';
          break;
        }
      }

      if (decisionPayload.decision === 'STOP') {
        addTraceEvent({
          iteration,
          state: 'COMPLETED',
          decision: 'STOP',
          reasoning: decisionPayload.reasoning,
          stopReason: decisionPayload.stopReason || 'agent_requested_stop',
          scoreBefore: currentAuditReport.overallScore,
          scoreAfter: currentAuditReport.overallScore,
          scoreDelta: 0,
          evidenceRefs: []
        });
        terminalState = 'STOPPED';
        finalStopReason = decisionPayload.stopReason || 'agent_requested_stop';
        break;
      }

      if (decisionPayload.decision === 'REPAIR') {
        // Locate target envelope
        const targetEnvelope =
          currentEnvelopes.find(
            (e) =>
              e.item.id === decisionPayload.targetItemId ||
              e.item.name.toLowerCase() === decisionPayload.targetItemId?.toLowerCase()
          ) || currentEnvelopes.find((e) => this.repairSvc.shouldRepair(e));

        if (!targetEnvelope) {
          logger.info('[AgentLoop] No items require repair. Halting loop.');
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'STOP',
            reasoning: 'Agent proposed REPAIR, but no remaining items require repair.',
            stopReason: 'no_repair_needed',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'STOPPED';
          finalStopReason = 'no_repair_needed';
          break;
        }

        const verifiedCandidates = candidatesMap.get(targetEnvelope.item.id) || [];
        if (verifiedCandidates.length === 0) {
          logger.warn(`[AgentLoop] Insufficient verified candidates for "${targetEnvelope.item.name}".`);
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'STOP',
            targetItemId: targetEnvelope.item.id,
            targetItemName: targetEnvelope.item.name,
            reasoning: `Zero verified Qloo alternative candidates available for "${targetEnvelope.item.name}". Under Evidence Firewall, no replacement can be fabricated.`,
            stopReason: 'insufficient_evidence',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'STOPPED';
          finalStopReason = 'insufficient_evidence';
          break;
        }

        // Fabricated Candidate Protection: Verify that suggestedCandidateId exists in verified candidates
        let matchedCandidate: AIRepairCandidate | undefined;
        if (decisionPayload.suggestedCandidateId) {
          matchedCandidate = verifiedCandidates.find(
            (c) => c.entityId.toLowerCase() === decisionPayload.suggestedCandidateId!.toLowerCase()
          );

          if (!matchedCandidate) {
            logger.warn(
              `[Evidence Firewall Violation] Agent suggested fabricated candidate "${decisionPayload.suggestedCandidateId}" not present in verified Qloo candidates.`
            );
            addTraceEvent({
              iteration,
              state: 'COMPLETED',
              decision: 'STOP',
              targetItemId: targetEnvelope.item.id,
              targetItemName: targetEnvelope.item.name,
              reasoning: `Evidence Firewall rejected candidate ID "${decisionPayload.suggestedCandidateId}": entity does not exist in backend-verified Qloo candidates list.`,
              stopReason: 'fabricated_candidate_rejected',
              scoreBefore: currentAuditReport.overallScore,
              scoreAfter: currentAuditReport.overallScore,
              scoreDelta: 0,
              evidenceRefs: []
            });
            terminalState = 'STOPPED';
            finalStopReason = 'fabricated_candidate_rejected';
            break;
          }
        }

        // Repeated Action Protection
        const actionKey = `${targetEnvelope.item.id}:REPAIR:${decisionPayload.suggestedCandidateId || 'auto'}`;
        if (actionHistory.has(actionKey)) {
          logger.warn(`[AgentLoop] Repeated action detected for key "${actionKey}". Halting to prevent infinite cycling.`);
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'STOP',
            targetItemId: targetEnvelope.item.id,
            targetItemName: targetEnvelope.item.name,
            reasoning: `Repeated action protection triggered: action "${actionKey}" has already been executed.`,
            stopReason: 'repeated_action_halt',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'STOPPED';
          finalStopReason = 'repeated_action_halt';
          break;
        }
        actionHistory.add(actionKey);

        // Execute Stage 5 Repair
        const scoreBefore = targetEnvelope.audit ? targetEnvelope.audit.overallScore : currentAuditReport.overallScore;

        logger.info(`[AgentLoop] Executing Stage 5 Repair on "${targetEnvelope.item.name}"...`);
        const repairRes = await this.repairSvc.repairItem(targetEnvelope, evaluationContext);
        targetEnvelope.repair = repairRes;
        repairResults.push(repairRes);

        let scoreAfter = scoreBefore;
        let scoreDelta = 0;

        if (repairRes.status === 'repaired' && repairRes.repairedEnvelope) {
          // Update envelope with repaired replacement and re-audit
          const targetIndex = currentEnvelopes.findIndex((e) => e.item.id === targetEnvelope.item.id);
          if (targetIndex !== -1) {
            currentEnvelopes[targetIndex] = repairRes.repairedEnvelope;
          }
          scoreAfter = repairRes.afterAudit ? repairRes.afterAudit.overallScore : scoreBefore;
          scoreDelta = repairRes.scoreDelta ?? (scoreAfter - scoreBefore);
        }

        // Re-aggregate overall audit report deterministically
        currentAuditReport = this.auditEngine.aggregateReport(
          currentEnvelopes.map((e) => e.audit!).filter(Boolean),
          input
        );

        const candidateInfo: AgentVerifiedCandidateInfo | undefined = repairRes.selectedCandidate
          ? {
              id: repairRes.selectedCandidate.entityId,
              name: repairRes.selectedCandidate.name,
              type: repairRes.selectedCandidate.type
            }
          : matchedCandidate
          ? {
              id: matchedCandidate.entityId,
              name: matchedCandidate.name,
              type: matchedCandidate.type,
              affinityValue: matchedCandidate.affinityValue
            }
          : undefined;

        // Clarification 1: A zero/negative score delta after REPAIR should safely stop the loop
        if (scoreDelta <= 0) {
          logger.warn(
            `[AgentLoop] Repair on "${targetEnvelope.item.name}" yielded zero or negative improvement (${scoreDelta}). Stopping loop.`
          );
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'REPAIR',
            targetItemId: targetEnvelope.item.id,
            targetItemName: targetEnvelope.item.name,
            reasoning: `Repair executed but generated zero or negative grounding improvement (Delta: ${scoreDelta}). Stopping loop per convergence policy.`,
            actionPerformed: {
              action: 'repair_diminishing_returns',
              candidateSelected: candidateInfo
            },
            scoreBefore,
            scoreAfter,
            scoreDelta,
            evidenceRefs: repairRes.evidenceRefs,
            stopReason: 'zero_improvement_repair_stop'
          });
          terminalState = 'STOPPED';
          finalStopReason = 'zero_improvement_repair_stop';
          break;
        }

        // Positive improvement recorded
        addTraceEvent({
          iteration,
          state: 'RE_AUDITING',
          decision: 'REPAIR',
          targetItemId: targetEnvelope.item.id,
          targetItemName: targetEnvelope.item.name,
          reasoning: decisionPayload.reasoning,
          actionPerformed: {
            action: 'repaired_with_verified_candidate',
            candidateSelected: candidateInfo
          },
          scoreBefore,
          scoreAfter,
          scoreDelta,
          evidenceRefs: repairRes.evidenceRefs
        });

        continue;
      }

      if (decisionPayload.decision === 'MORE_EVIDENCE') {
        const targetEnvelope =
          currentEnvelopes.find(
            (e) =>
              e.item.id === decisionPayload.targetItemId ||
              e.item.name.toLowerCase() === decisionPayload.targetItemId?.toLowerCase()
          ) ||
          currentEnvelopes.find(
            (e) =>
              e.resolution.status === 'ambiguous' ||
              e.evidence?.status === 'insufficient_evidence' ||
              (e.evidence?.signals.length ?? 0) === 0
          );

        if (!targetEnvelope) {
          logger.info('[AgentLoop] No items have ambiguous or insufficient evidence. Halting loop.');
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'STOP',
            reasoning: 'Agent requested MORE_EVIDENCE, but all items already possess verified evidence.',
            stopReason: 'no_further_evidence_needed',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'STOPPED';
          finalStopReason = 'no_further_evidence_needed';
          break;
        }

        // Repeated Action Protection
        const actionKey = `${targetEnvelope.item.id}:MORE_EVIDENCE`;
        if (actionHistory.has(actionKey)) {
          logger.warn(`[AgentLoop] Repeated MORE_EVIDENCE query for "${targetEnvelope.item.name}". Halting.`);
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'STOP',
            targetItemId: targetEnvelope.item.id,
            targetItemName: targetEnvelope.item.name,
            reasoning: 'Repeated action protection: secondary evidence query already attempted for this item.',
            stopReason: 'repeated_action_halt',
            scoreBefore: currentAuditReport.overallScore,
            scoreAfter: currentAuditReport.overallScore,
            scoreDelta: 0,
            evidenceRefs: []
          });
          terminalState = 'STOPPED';
          finalStopReason = 'repeated_action_halt';
          break;
        }
        actionHistory.add(actionKey);

        const scoreBefore = targetEnvelope.audit ? targetEnvelope.audit.overallScore : currentAuditReport.overallScore;
        const oldSignalsCount = targetEnvelope.evidence?.signals.length ?? 0;
        const oldStatus = targetEnvelope.evidence?.status;

        // Perform approved secondary Qloo-backed evidence query
        logger.info(`[AgentLoop] Retrieving additional Qloo evidence for "${targetEnvelope.item.name}"...`);

        // If ambiguous with candidates, attempt disambiguation using context
        if (targetEnvelope.resolution.status === 'ambiguous' && targetEnvelope.resolution.candidates.length > 0) {
          const topCandidate = targetEnvelope.resolution.candidates[0];
          targetEnvelope.resolution = {
            ...targetEnvelope.resolution,
            status: 'resolved',
            resolvedEntity: topCandidate
          };
        }

        if (targetEnvelope.resolution.status === 'resolved' && targetEnvelope.resolution.resolvedEntity) {
          const entity = targetEnvelope.resolution.resolvedEntity;
          const freshEvidence = await this.evidenceSvc.retrieveEvidence({
            entityId: entity.id,
            entityName: entity.name,
            entityType: entity.type,
            category: entity.category,
            audience: input.audienceContext,
            location: input.location,
            constraints: input.constraints
          });
          targetEnvelope.evidence = freshEvidence;
        }

        // Deterministic Re-Audit
        const newAudit = this.auditEngine.auditItem(targetEnvelope, evaluationContext);
        targetEnvelope.audit = newAudit;

        currentAuditReport = this.auditEngine.aggregateReport(
          currentEnvelopes.map((e) => e.audit!).filter(Boolean),
          input
        );

        const scoreAfter = newAudit.overallScore;
        const scoreDelta = scoreAfter - scoreBefore;
        const newSignalsCount = targetEnvelope.evidence?.signals.length ?? 0;
        const newStatus = targetEnvelope.evidence?.status;

        // Clarification 1: Check if evidence materially improved
        const evidenceMateriallyImproved =
          (newStatus === 'supported' && oldStatus !== 'supported') ||
          newSignalsCount > oldSignalsCount ||
          targetEnvelope.evidence?.provenance.classification === 'Supported';

        if (!evidenceMateriallyImproved && scoreDelta <= 0) {
          logger.warn(
            `[AgentLoop] MORE_EVIDENCE on "${targetEnvelope.item.name}" yielded no material evidence improvement.`
          );
          addTraceEvent({
            iteration,
            state: 'COMPLETED',
            decision: 'MORE_EVIDENCE',
            targetItemId: targetEnvelope.item.id,
            targetItemName: targetEnvelope.item.name,
            reasoning: 'Additional Qloo evidence query yielded zero additional signals and no score improvement.',
            actionPerformed: { action: 'evidence_query_unimproved' },
            scoreBefore,
            scoreAfter,
            scoreDelta: 0,
            evidenceRefs: targetEnvelope.evidence?.provenance ? [targetEnvelope.evidence.provenance.correlationId] : [],
            stopReason: 'insufficient_evidence_unimproved'
          });
          terminalState = 'STOPPED';
          finalStopReason = 'insufficient_evidence_unimproved';
          break;
        }

        // Evidence improved or score improved
        addTraceEvent({
          iteration,
          state: 'RE_AUDITING',
          decision: 'MORE_EVIDENCE',
          targetItemId: targetEnvelope.item.id,
          targetItemName: targetEnvelope.item.name,
          reasoning: decisionPayload.reasoning,
          actionPerformed: { action: 'retrieved_additional_qloo_evidence' },
          scoreBefore,
          scoreAfter,
          scoreDelta,
          evidenceRefs: targetEnvelope.evidence?.provenance ? [targetEnvelope.evidence.provenance.correlationId] : []
        });

        continue;
      }
    }

    // Seal trace
    const totalDurationMs = Date.now() - startTime;
    const finalOverallScore = currentAuditReport.overallScore;
    const netScoreImprovement = finalOverallScore - initialScore;

    const trace: AgentExecutionTrace = {
      totalIterations: Math.min(iteration, maxIterations),
      terminalState,
      finalStopReason,
      totalDurationMs,
      initialOverallScore: initialScore,
      finalOverallScore,
      netScoreImprovement,
      events
    };

    const overallRepairReport =
      repairResults.length > 0 ? this.repairSvc.aggregateRepairReport(repairResults) : undefined;

    return {
      auditReport: currentAuditReport,
      envelopes: currentEnvelopes,
      trace,
      repairReport: overallRepairReport
    };
  }
}

export const agentLoop = new TasteAuditAgentLoop();
