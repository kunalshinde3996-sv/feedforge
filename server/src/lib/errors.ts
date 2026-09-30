import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', `No route for ${req.method} ${req.originalUrl.split('?')[0]}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    res.status(400).json(errorBody('VALIDATION_ERROR', message));
    return;
  }
  // express.json() parse failures
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('INVALID_JSON', 'Request body is not valid JSON'));
    return;
  }
  logger.error('unhandled error', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Something went wrong'));
};
