import { z } from 'zod';

export const AuditRequestSchema = z.object({
  recommendations: z
    .string({
      required_error: 'Recommendations text is required.',
      invalid_type_error: 'Recommendations must be a text string.'
    })
    .trim()
    .min(3, { message: 'Recommendations must be at least 3 characters long.' })
    .max(5000, { message: 'Recommendations text must not exceed 5000 characters.' }),

  audienceContext: z
    .string()
    .trim()
    .max(1000, { message: 'Audience context must not exceed 1000 characters.' })
    .optional(),

  location: z
    .string()
    .trim()
    .max(500, { message: 'Location must not exceed 500 characters.' })
    .optional(),

  constraints: z
    .array(z.string().trim().max(200, { message: 'Constraint item cannot exceed 200 characters.' }))
    .max(20, { message: 'A maximum of 20 constraints may be specified.' })
    .optional()
    .default([]),

  enableRepair: z.boolean().optional().default(false)
});

export type AuditRequestInput = z.infer<typeof AuditRequestSchema>;
