import { Router, Request, Response, NextFunction } from 'express';
import { AuditRequestSchema } from '../schemas/audit.schema.js';
import { orchestrator } from '../services/orchestrator/orchestrator.service.js';

export const auditRouter = Router();

auditRouter.post('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request payload with Zod
    const validated = AuditRequestSchema.parse(req.body);

    // Call orchestrator pipeline (Stage 1: PARSE -> Stage 2: RESOLVE -> Stage 3: RETRIEVE -> Stage 4: AUDIT -> Stage 5: REPAIR)
    const result = await orchestrator.executePipeline(
      {
        rawRecommendation: validated.recommendations,
        audienceContext: validated.audienceContext,
        location: validated.location,
        constraints: validated.constraints
      },
      { enableRepair: validated.enableRepair }
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
