import type { StageName } from '../schemas/job.js';

export type StageTask = { jobId: string; stage: StageName };

export type TaskContext = { run: number; maxRuns: number };

/** Returns the next task to enqueue (stage chaining), or null when the job is finished. */
export type StageHandler = (task: StageTask, ctx: TaskContext) => Promise<StageTask | null>;

export type FailureHandler = (task: StageTask, err: unknown, ctx: TaskContext) => Promise<void>;

export type RetryPolicy = { maxRuns: number; baseDelayMs: number };

/**
 * Job queue abstraction. Phase 1: in-process. Phase 2: BullMQ + Redis (one queue per stage,
 * same handler signature, retry policy maps to BullMQ `attempts` + exponential `backoff`).
 */
export interface JobQueue {
  /** Register the single handler for a stage. */
  process(stage: StageName, handler: StageHandler): void;
  /** Called once a task has exhausted its retries or thrown a non-retryable error. */
  onFailed(handler: FailureHandler): void;
  enqueue(task: StageTask): Promise<void>;
  /** Resolves when no tasks are queued, running, or waiting on backoff. */
  drain(): Promise<void>;
}

/** Errors may opt out of retry by exposing `retryable === false`. */
export function isRetryable(err: unknown): boolean {
  if (err && typeof err === 'object' && 'retryable' in err) return (err as { retryable: unknown }).retryable !== false;
  return true;
}
