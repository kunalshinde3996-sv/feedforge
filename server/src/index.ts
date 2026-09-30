import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createApp } from './app.js';
import { JobEvents } from './lib/events.js';
import { logger } from './lib/logger.js';
import { Pipeline } from './pipeline/runner.js';
import { createLLMProvider, type LLMProvider } from './providers/index.js';
import { InProcessQueue } from './queue/inProcessQueue.js';
import { FileJobStore } from './store/fileStore.js';
import { seedSampleRuns } from './store/seed.js';

const store = new FileJobStore(config.DATA_DIR);
await store.init();

const events = new JobEvents();
// Per-stage retry: 4 runs, exponential backoff 2s → 4s → 8s (rides out provider 503/429 spikes)
const queue = new InProcessQueue({ maxRuns: 4, baseDelayMs: 2000 });

let llm: LLMProvider | null = null;
try {
  llm = createLLMProvider(config);
} catch (err) {
  logger.warn('LLM not configured — job creation disabled', { error: (err as Error).message });
}

const pipeline = llm ? new Pipeline({ store, queue, llm, events }) : null;
if (pipeline) {
  const recovered = await pipeline.recoverInterrupted();
  if (recovered) logger.warn('marked interrupted jobs as failed', { count: recovered });
}

// <repo> root — same relative location from src/ and dist/.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Never show an empty/failed-only dashboard: seed real passed runs from /examples if needed.
await seedSampleRuns(store, path.join(repoRoot, 'examples'));

// Built dashboard: <repo>/web/dist
const webDist = path.join(repoRoot, 'web/dist');
const hasDashboard = existsSync(path.join(webDist, 'index.html'));

const app = createApp({
  store,
  events,
  pipeline,
  rateLimit: { max: config.RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS },
  webDist: hasDashboard ? webDist : null,
});

const server = app.listen(config.PORT, () => {
  logger.info('server started', {
    port: config.PORT,
    env: config.NODE_ENV,
    llmProvider: config.LLM_PROVIDER,
    llmModel: config.LLM_MODEL ?? '(not set)',
    llmFallbackModel: config.LLM_FALLBACK_MODEL ?? '(none)',
    dashboard: hasDashboard ? webDist : '(not built — API only)',
    dataDir: config.DATA_DIR,
  });
});

// Render sends SIGTERM on deploy/restart. Stop accepting connections; open SSE streams are cut.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
