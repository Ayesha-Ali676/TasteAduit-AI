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
2. EVIDENCE FIREWALL: You MUST NOT invent entities, entity IDs, affinity values, or provenance.
   If proposing REPAIR with a candidate, the suggestedCandidateId MUST match one of the verified candidates provided.
3. ALLOWED DECISIONS ONLY:
   - "ACCEPT": When overallScore >= 80 and all recommendations are culturally grounded and satisfy constraints.
   - "REPAIR": When an item has score < 80 or violates constraints, and verified alternative candidates are available.
   - "MORE_EVIDENCE": When an item has ambiguous resolution or insufficient evidence, and additional Qloo signals could resolve it.
   - "STOP": When no further improvement is possible, maximum iterations are reached, or zero candidate alternatives exist.

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
      type: c.type,
      affinityValue: c.affinityValue
    }));

    return {
      itemId: env.item.id,
      itemName: env.item.name,
      overallScore: audit ? audit.overallScore : 'Unaudited',
      decisionStatus: audit?.decision.status || 'unknown',
      decisionLabel: audit?.decision.label || 'unknown',
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
