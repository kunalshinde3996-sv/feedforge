import type { StageName } from '../schemas/job.js';
import {
  isRetryable,
  type FailureHandler,
  type JobQueue,
  type RetryPolicy,
  type StageHandler,
  type StageTask,
} from './types.js';

type Pending = { task: StageTask; run: number };

/**
 * Simple in-memory queue: bounded concurrency, per-stage handlers, retries with exponential backoff.
 * Tasks are lost on restart (see JobStore recovery on boot).
 */
export class InProcessQueue implements JobQueue {
  private handlers = new Map<StageName, StageHandler>();
  private failureHandlers: FailureHandler[] = [];
  private waiting: Pending[] = [];
  private active = 0;
  private delayed = 0;
  private idleResolvers: Array<() => void> = [];

  constructor(
    private readonly policy: RetryPolicy = { maxRuns: 3, baseDelayMs: 1000 },
    private readonly concurrency = 4,
  ) {}

  process(stage: StageName, handler: StageHandler) {
    this.handlers.set(stage, handler);
  }

  onFailed(handler: FailureHandler) {
    this.failureHandlers.push(handler);
  }

  async enqueue(task: StageTask) {
    this.push({ task, run: 1 });
  }

  drain(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  private push(p: Pending) {
    this.waiting.push(p);
    this.pump();
  }

  private isIdle() {
    return this.waiting.length === 0 && this.active === 0 && this.delayed === 0;
  }

  private pump() {
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      this.active++;
      void this.execute(next).finally(() => {
        this.active--;
        this.pump();
        if (this.isIdle()) this.idleResolvers.splice(0).forEach((r) => r());
      });
    }
  }

  private async execute({ task, run }: Pending) {
    const handler = this.handlers.get(task.stage);
    const ctx = { run, maxRuns: this.policy.maxRuns };
    try {
      if (!handler) throw Object.assign(new Error(`No handler for stage "${task.stage}"`), { retryable: false });
      const next = await handler(task, ctx);
      if (next) this.push({ task: next, run: 1 });
    } catch (err) {
      if (isRetryable(err) && run < this.policy.maxRuns) {
        const delay = this.policy.baseDelayMs * 2 ** (run - 1);
        this.delayed++;
        setTimeout(() => {
          this.delayed--;
          this.push({ task, run: run + 1 });
        }, delay);
        return;
      }
      for (const h of this.failureHandlers) {
        await h(task, err, ctx).catch(() => undefined);
      }
    }
  }
}
