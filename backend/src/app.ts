import express, { Express } from 'express';
import cors, { CorsOptions } from 'cors';
import { healthRouter } from './routes/health.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { config } from './utils/config.js';

export function getCorsOptions(): CorsOptions {
  const allowedOrigins = new Set<string>([
    'https://taste-aduit-ai.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]);

  if (config.frontendOrigin) {
    config.frontendOrigin
      .split(',')
      .map(o => o.trim())
      .filter(Boolean)
      .forEach(o => allowedOrigins.add(o));
  }

  const isOriginAllowed = (origin: string): boolean => {
    if (allowedOrigins.has(origin)) {
      return true;
    }
    // Allow any localhost / 127.0.0.1 development origin
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  };

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, health probes, curl)
      if (!origin || isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
  };
}

export function createApp(): Express {
  const app = express();

  // CORS configuration (must precede body parsers and routes for proper preflight handling)
  const corsMiddleware = cors(getCorsOptions());
  app.use(corsMiddleware);
  app.options('*', corsMiddleware);

  // Bounded request size and standard parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
