import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

export function createApp(): Express {
  const app = express();

  // Bounded request size and standard parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // CORS configuration
  app.use(cors());

  // Root health probe for cloud platform monitoring (Render, load balancers, etc.)
  app.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'tasteaudit-api'
    });
  });

  // Mount API & health routes
  app.use('/health', healthRouter);
  app.use('/api', healthRouter);
  app.use('/api', auditRouter);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
