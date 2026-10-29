import { OverallAuditReport } from '../audit/audit.types.js';
import { ItemResolutionEnvelope } from '../orchestrator/stages.types.js';
import { AIRepairCandidate } from '../ai/ai.types.js';

export interface AgentPromptContext {
  overallReport: OverallAuditReport;
  envelopes: ItemResolutionEnvelope[];
  iteration: number;
  maxIterations: number;
  candidatesMap: Map<string, AIRepairCandidate[]>;
  actionHistory: string[];
  context?: {
    audience?: string;
    location?: string;
    constraints: string[];
  };
}

export function buildAgentSystemPrompt(): string {
  return `You are the TasteAudit AI Orchestration Agent.
Your responsibility is to oversee cultural QA evaluation for AI recommendations and decide the next bounded action.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. SCORE AUTHORITY: The deterministic CulturalGroundingAuditEngine is the ONLY authority for scores.
   You MUST NOT calculate, invent, or override scores.
2. EVIDENCE FIREWALL & CANDIDATE COMPATIBILITY: You MUST NOT invent entities, entity IDs, affinity values, or provenance.
   If proposing REPAIR with a candidate, the suggestedCandidateId MUST match one of the verified candidates provided.
   You may ONLY consider and select repair candidates that are semantically compatible with the recommendation domain (e.g. restaurant/place for dining, movie for movie, music artist for music).
   Never suggest an incompatible candidate (e.g. music artist for dining, or movie for restaurant).
   If verifiedCandidatesAvailable is empty or no compatible candidates exist, you must NOT force a repair; choose STOP or MORE_EVIDENCE.
3. ALLOWED DECISIONS ONLY:
   - "ACCEPT": When overallScore >= 80 and all recommendations are culturally grounded and satisfy constraints.
   - "REPAIR": When an item has score < 80 or violates constraints, and verified compatible alternative candidates are available.
   - "MORE_EVIDENCE": When an item has ambiguous resolution or insufficient evidence, and additional Qloo signals could resolve it.
   - "STOP": When no further improvement is possible, maximum iterations are reached, or zero compatible candidate alternatives exist.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "decision": "ACCEPT" | "REPAIR" | "MORE_EVIDENCE" | "STOP",
  "targetItemId": "item id to repair or gather evidence for (optional for ACCEPT/STOP)",
  "suggestedCandidateId": "entityId from verified candidates list if REPAIR",
  "reasoning": "Clear justification for this decision based on audit metrics and constraints",
  "stopReason": "Specific stop reason if decision is STOP"
}`;
}

export function buildAgentUserPrompt(params: AgentPromptContext): string {
  const { overallReport, envelopes, iteration, maxIterations, candidatesMap, actionHistory, context } = params;

  const itemsSummary = envelopes.map((env) => {
    const audit = env.audit;
    const candidates = candidatesMap.get(env.item.id) || [];
    const verifiedCandidatesSummary = candidates.slice(0, 5).map((c) => ({
      entityId: c.entityId,
      name: c.name,
      type: c.normalizedType || c.type,
      affinityValue: c.affinityValue
    }));

      const isAbstained = !audit || audit.decision.status === 'insufficient_evidence' || env.resolution.status !== 'resolved';
      return {
        itemId: env.item.id,
        itemName: env.item.name,
        description: env.item.description || undefined,
        overallScore: isAbstained ? 'N/A' : audit.overallScore,
        decisionStatus: env.resolution.status === 'ambiguous' ? 'ambiguous' : (audit?.decision.status || 'unknown'),
        decisionLabel: env.resolution.status === 'ambiguous' ? 'Ambiguous Qloo Entity' : (audit?.decision.label || 'unknown'),
      constraintStatus: audit?.dimensions.constraintCompliance.classification || 'unknown',
      constraintReasons: audit?.dimensions.constraintCompliance.reasons || [],
      resolutionStatus: env.resolution.status,
      evidenceStatus: env.evidence?.status || 'unverified',
      verifiedCandidatesAvailable: verifiedCandidatesSummary
    };
  });

  return JSON.stringify(
    {
      currentIteration: iteration,
      maxIterations,
      overallScore: overallReport.overallScore,
      decisionStatus: overallReport.decision.status,
      userContext: {
        audience: context?.audience || null,
        location: context?.location || null,
        constraints: context?.constraints || []
      },
      actionHistory,
      items: itemsSummary
    },
    null,
    2
  );
}
