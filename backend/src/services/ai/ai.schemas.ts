import { z } from 'zod';

/**
 * Strict schema for AI Repair response.
 * The AI reasoning layer must strictly conform to this structure.
 */
export const AIRepairOutputSchema = z.object({
  repairStatus: z.enum(['repaired', 'no_repair', 'insufficient_evidence']),
  strategy: z.string().min(1, 'Strategy cannot be empty'),
  selectedCandidate: z
    .object({
      name: z.string().min(1, 'Candidate name cannot be empty'),
      entityId: z.string().min(1, 'Candidate entityId cannot be empty')
    })
    .nullable()
    .optional(),
  reasoning: z.string().min(1, 'Reasoning explanation cannot be empty'),
  evidenceRefs: z.array(z.string()).default([]),
  constraintHandling: z.array(z.string()).default([]),
  confidence: z
    .number()
    .min(0, 'Confidence must be at least 0.0')
    .max(1, 'Confidence cannot exceed 1.0')
});

export type AIRepairOutput = z.infer<typeof AIRepairOutputSchema>;
