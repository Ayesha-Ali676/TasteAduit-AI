import { z } from 'zod';

/**
 * Strict schema for AI Agent Orchestration decisions.
 * Only the approved 4 decisions (ACCEPT, REPAIR, MORE_EVIDENCE, STOP) are permitted.
 */
export const AgentDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REPAIR', 'MORE_EVIDENCE', 'STOP']),
  targetItemId: z.string().optional(),
  suggestedCandidateId: z.string().optional(),
  reasoning: z.string().min(1, 'Reasoning explanation cannot be empty'),
  stopReason: z.string().optional()
});

export type AgentDecisionPayload = z.infer<typeof AgentDecisionSchema>;
