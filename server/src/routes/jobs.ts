import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import type { JobEvents } from '../lib/events.js';
import { rateLimit } from '../lib/rateLimit.js';
import type { Pipeline } from '../pipeline/runner.js';
import { CreateJobSchema, TERMINAL_STATUSES, toSummary, type Job } from '../schemas/job.js';
import type { JobStore } from '../store/types.js';

type Deps = {
  store: JobStore;
  events: JobEvents;
  /** null when the LLM is not configured — the API still serves reads. */
  pipeline: Pipeline | null;
  rateLimit: { max: number; windowMs: number };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jobsRouter({ store, events, pipeline, rateLimit: rl }: Deps) {
  const router = Router();

  async function loadJob(id: string): Promise<Job> {
    if (!UUID.test(id)) throw new AppError(400, 'INVALID_JOB_ID', 'Job id must be a UUID');
    const job = await store.get(id);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', `No job with id ${id}`);
    return job;
  }

  router.post('/', rateLimit(rl), async (req, res) => {
    const { topic } = CreateJobSchema.parse(req.body ?? {});
    if (!pipeline) {
      throw new AppError(503, 'LLM_NOT_CONFIGURED', 'LLM provider is not configured on the server (check LLM_MODEL and API key)');
    }
    const job = await pipeline.submit(topic);
    res.status(202).location(`/api/jobs/${job.id}`).json({ jobId: job.id });
  });

  router.get('/', async (_req, res) => {
    const jobs = await store.list();
    res.json({ jobs: jobs.map(toSummary) });
  });

  router.get('/:id', async (req, res) => {
    res.json(await loadJob(req.params.id));
  });

  /**
   * SSE: sends `event: job` with the full job on connect and on every stage update,
   * then `event: end` once the job reaches a terminal status.
   */
  router.get('/:id/events', async (req, res) => {
    const job = await loadJob(req.params.id);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(heartbeat);
      res.end();
    };

    const onJob = (j: Job) => {
      send('job', j);
      if (TERMINAL_STATUSES.includes(j.status)) {
        send('end', { status: j.status });
        close();
      }
    };

    const unsubscribe = events.subscribe(job.id, onJob);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', close);

    onJob(job);
  });

  return router;
}
