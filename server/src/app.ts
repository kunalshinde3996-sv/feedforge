import express from 'express';
import type { JobEvents } from './lib/events.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import type { Pipeline } from './pipeline/runner.js';
import { healthRouter } from './routes/health.js';
import { jobsRouter } from './routes/jobs.js';
import type { JobStore } from './store/types.js';

export type AppDeps = {
  store: JobStore;
  events: JobEvents;
  pipeline: Pipeline | null;
  rateLimit: { max: number; windowMs: number };
};

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy — needed for per-IP rate limiting
  app.use(express.json({ limit: '32kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/jobs', jobsRouter(deps));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
