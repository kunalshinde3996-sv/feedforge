import { randomUUID } from 'node:crypto';
import type { JobEvents } from '../lib/events.js';
import { logger } from '../lib/logger.js';
import { LLMBlockedError, type LLMProvider } from '../providers/index.js';
import { TERMINAL_STATUSES, type Job, type StageName, type StageTiming } from '../schemas/job.js';
import { isRetryable, type JobQueue, type StageTask, type TaskContext } from '../queue/types.js';
import type { JobStore } from '../store/types.js';
import { GATE, decide } from './gate.js';
import { runQualityGate } from './stages/qualityGate.js';
import { runScriptEngine } from './stages/scriptEngine.js';

type Deps = { store: JobStore; queue: JobQueue; llm: LLMProvider; events: JobEvents };

const now = () => new Date().toISOString();

/**
 * Orchestrates Phase 1: script → quality_gate → (rewrite → quality_gate)* → passed | rejected | failed.
 * Each stage is a separate queue task, so the queue owns retries/backoff and Phase 2 stages
 * ('assets', 'compose', 'publish') chain on after a pass without touching this flow.
 */
export class Pipeline {
  constructor(private readonly deps: Deps) {
    deps.queue.process('script', (t, c) => this.scriptStage(t, c));
    deps.queue.process('quality_gate', (t, c) => this.qualityGateStage(t, c));
    deps.queue.onFailed((t, err, c) => this.onStageFailed(t, err, c));
  }

  async submit(topic: string): Promise<Job> {
    const ts = now();
    const job: Job = {
      id: randomUUID(),
      createdAt: ts,
      updatedAt: ts,
      input: { topic },
      llm: { provider: this.deps.llm.name, model: this.deps.llm.model, fallbackModel: this.deps.llm.fallbackModel ?? null },
      status: 'queued',
      currentStage: 'script',
      attempts: [],
      finalPlan: null,
      passedAttempt: null,
      timings: [],
      error: null,
    };
    await this.deps.store.create(job);
    this.deps.events.publish(job);
    logger.info('job created', { jobId: job.id, topic });
    await this.deps.queue.enqueue({ jobId: job.id, stage: 'script' });
    return job;
  }

  /** In-process queue loses tasks on restart: fail anything that was mid-flight. */
  async recoverInterrupted(): Promise<number> {
    let n = 0;
    for (const job of await this.deps.store.list()) {
      if (TERMINAL_STATUSES.includes(job.status)) continue;
      await this.deps.store.update(job.id, (j) => {
        j.status = 'failed';
        j.error = { code: 'INTERRUPTED', message: 'Server restarted while this job was running' };
      });
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- stages

  private async scriptStage(task: StageTask, ctx: TaskContext): Promise<StageTask | null> {
    const job = await this.deps.store.get(task.jobId);
    if (!job || TERMINAL_STATUSES.includes(job.status)) return null;

    const attemptN = job.attempts.length + 1;
    const prev = job.attempts.at(-1);
    const previous =
      prev?.review && prev.outcome === 'failed_quality'
        ? { plan: prev.plan, review: prev.review, attempt: prev.n }
        : undefined;

    await this.save(job.id, (j) => {
      j.status = 'running';
      j.currentStage = 'script';
    });

    const startedAt = now();
    const t0 = performance.now();
    try {
      const { plan, repairs, servedBy } = await runScriptEngine(this.deps.llm, { topic: job.input.topic, previous });
      const durationMs = Math.round(performance.now() - t0);
      const finishedAt = now();
      await this.save(job.id, (j) => {
        j.attempts.push({
          n: attemptN,
          rewrittenFrom: previous?.attempt ?? null,
          plan,
          script: { startedAt, finishedAt, durationMs, repairs, servedBy },
          review: null,
          outcome: 'pending',
        });
        j.timings.push(timing('script', attemptN, ctx.run, startedAt, finishedAt, durationMs, 'ok'));
        j.currentStage = 'quality_gate';
      });
      this.log('script', job.id, attemptN, ctx, durationMs, 'ok', {
        repairs,
        rewrittenFrom: previous?.attempt ?? null,
        model: servedBy.model,
        fallback: servedBy.fallback,
      });
      return { jobId: job.id, stage: 'quality_gate' };
    } catch (err) {
      await this.recordStageError(job.id, 'script', attemptN, ctx, startedAt, t0, err);
      throw err;
    }
  }

  private async qualityGateStage(task: StageTask, ctx: TaskContext): Promise<StageTask | null> {
    const job = await this.deps.store.get(task.jobId);
    if (!job || TERMINAL_STATUSES.includes(job.status)) return null;
    const attempt = job.attempts.at(-1);
    if (!attempt || attempt.review) throw Object.assign(new Error('No pending attempt to review'), { retryable: false });

    const startedAt = now();
    const t0 = performance.now();
    try {
      const { review, repairs, servedBy } = await runQualityGate(this.deps.llm, attempt.plan);
      const durationMs = Math.round(performance.now() - t0);
      const finishedAt = now();
      const decision = decide(review, attempt.n);

      await this.save(job.id, (j) => {
        const a = j.attempts.at(-1)!;
        a.review = { ...review, startedAt, finishedAt, durationMs, repairs, servedBy };
        j.timings.push(timing('quality_gate', a.n, ctx.run, startedAt, finishedAt, durationMs, 'ok'));

        switch (decision.kind) {
          case 'pass':
            a.outcome = 'passed';
            j.status = 'passed';
            j.currentStage = 'done';
            j.finalPlan = a.plan;
            j.passedAttempt = a.n;
            break;
          case 'reject_safety':
            a.outcome = 'failed_safety';
            j.status = 'rejected';
            j.error = {
              code: 'SAFETY_REJECTED',
              message: `Safety score ${review.scores.safety} is below ${GATE.MIN_SAFETY} on attempt ${a.n}. Job rejected and will not proceed.`,
            };
            break;
          case 'rewrite':
            a.outcome = 'failed_quality';
            j.currentStage = 'script';
            break;
          case 'exhausted':
            a.outcome = 'failed_quality';
            j.status = 'failed';
            j.error = {
              code: 'QUALITY_GATE_EXHAUSTED',
              message: `Plan did not pass the Quality Gate after ${GATE.MAX_ATTEMPTS} attempts (last overall ${review.overall}).`,
            };
            break;
        }
      });
      this.log('quality_gate', job.id, attempt.n, ctx, durationMs, decision.kind, {
        overall: review.overall,
        safety: review.scores.safety,
        repairs,
        model: servedBy.model,
        fallback: servedBy.fallback,
      });
      return decision.kind === 'rewrite' ? { jobId: job.id, stage: 'script' } : null;
    } catch (err) {
      await this.recordStageError(job.id, 'quality_gate', attempt.n, ctx, startedAt, t0, err);
      throw err;
    }
  }

  // ---------------------------------------------------------------- failures

  private async onStageFailed(task: StageTask, err: unknown, _ctx: TaskContext) {
    const message = err instanceof Error ? err.message : String(err);
    const blocked = err instanceof LLMBlockedError;
    const code = blocked
      ? 'SAFETY_BLOCKED'
      : ((err as { code?: string } | null)?.code ?? 'STAGE_FAILED');
    await this.save(task.jobId, (j) => {
      if (TERMINAL_STATUSES.includes(j.status)) return;
      j.status = blocked ? 'rejected' : 'failed';
      j.currentStage = task.stage;
      j.error = { code, message: `${stageLabel(task.stage)} failed: ${message}` };
    }).catch(() => undefined);
    logger.error('job ended by stage failure', { jobId: task.jobId, stage: task.stage, code, error: message });
  }

  private async recordStageError(
    jobId: string,
    stage: StageName,
    attempt: number,
    ctx: TaskContext,
    startedAt: string,
    t0: number,
    err: unknown,
  ) {
    const durationMs = Math.round(performance.now() - t0);
    const willRetry = isRetryable(err) && ctx.run < ctx.maxRuns;
    const outcome = willRetry ? 'retrying' : 'error';
    const message = err instanceof Error ? err.message : String(err);
    await this.save(jobId, (j) => {
      j.timings.push(timing(stage, attempt, ctx.run, startedAt, now(), durationMs, outcome, message));
    }).catch(() => undefined);
    this.log(stage, jobId, attempt, ctx, durationMs, outcome, { error: message });
  }

  // ---------------------------------------------------------------- helpers

  private async save(id: string, mutate: (j: Job) => void) {
    const job = await this.deps.store.update(id, mutate);
    this.deps.events.publish(job);
    return job;
  }

  private log(
    stage: StageName,
    jobId: string,
    attempt: number,
    ctx: TaskContext,
    durationMs: number,
    outcome: string,
    extra: Record<string, unknown> = {},
  ) {
    const fn = outcome === 'error' ? logger.error : outcome === 'retrying' ? logger.warn : logger.info;
    fn('stage', { jobId, stage, attempt, run: ctx.run, durationMs, outcome, ...extra });
  }
}

function timing(
  stage: StageName,
  attempt: number,
  run: number,
  startedAt: string,
  finishedAt: string,
  durationMs: number,
  outcome: StageTiming['outcome'],
  error?: string,
): StageTiming {
  return { stage, attempt, run, startedAt, finishedAt, durationMs, outcome, ...(error ? { error } : {}) };
}

const stageLabel = (s: StageName) => (s === 'script' ? 'Script Engine' : 'Quality Gate');
