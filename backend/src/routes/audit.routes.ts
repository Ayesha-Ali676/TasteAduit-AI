import { Router, Request, Response, NextFunction } from 'express';
import { AuditRequestSchema } from '../schemas/audit.schema.js';
import { orchestrator } from '../services/orchestrator/orchestrator.service.js';

export const auditRouter = Router();

auditRouter.post('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request payload with Zod
    const validated = AuditRequestSchema.parse(req.body);

    // Call orchestrator pipeline (Stages 1-4, optional Stage 5 Repair, optional Stage 6 Agent Loop)
    const result = await orchestrator.executePipeline(
      {
        rawRecommendation: validated.recommendations,
        audienceContext: validated.audienceContext,
        location: validated.location,
        constraints: validated.constraints
      },
      {
        enableRepair: validated.enableRepair,
        enableAgent: validated.enableAgent,
        maxIterations: validated.maxIterations
      }
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
