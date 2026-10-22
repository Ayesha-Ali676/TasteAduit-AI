import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { QlooConfigurationError } from '../services/qloo/qloo.client.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data provided.',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
    return;
  }

  // Handle Qloo configuration errors safely
  if (err instanceof QlooConfigurationError) {
    logger.warn(`Configuration error encountered: ${err.message}`);
    res.status(503).json({
      error: 'ServiceUnavailable',
      message: err.message
    });
    return;
  }

  // Generic internal server error: scrub and do not leak internals
  logger.error('Unhandled request exception:', err instanceof Error ? err.message : String(err));
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected internal error occurred. Please try again later.'
  });
}
