import express from 'express';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy — needed for per-IP rate limiting
  app.use(express.json({ limit: '32kb' }));

  app.use('/api/health', healthRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
