import path from 'node:path';
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
  /** Built dashboard (web/dist). When set, Express serves it with an SPA fallback. */
  webDist?: string | null;
};

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy — needed for per-IP rate limiting
  app.use(express.json({ limit: '32kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/jobs', jobsRouter(deps));
  app.use('/api', notFoundHandler);

  if (deps.webDist) serveDashboard(app, deps.webDist);

  app.use(errorHandler);
  return app;
}

function serveDashboard(app: express.Express, dir: string) {
  const indexHtml = path.join(dir, 'index.html');

  // Vite emits content-hashed files under /assets → cache forever; everything else revalidates.
  app.use(
    express.static(dir, {
      index: false,
      setHeaders(res, file) {
        res.setHeader(
          'Cache-Control',
          file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );

  // SPA fallback for any other GET (the dashboard keeps state in the URL hash).
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
