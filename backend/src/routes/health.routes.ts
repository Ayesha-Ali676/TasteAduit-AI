import { Router, Request, Response } from 'express';

export const healthRouter = Router();

const sendHealthStatus = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'tasteaudit-api'
  });
};

healthRouter.get('/health', sendHealthStatus);
healthRouter.get('/', sendHealthStatus);
