import { z } from 'zod';
import type { ScriptPlan } from './plan.js';
import type { Review } from './review.js';

export const TOPIC_HINT = "Add a bit more detail, e.g. 'Climate change effects on Indian farmers'";
const wordCount = (s: string) => s.split(/s+/).filter(Boolean).length;

/** A topic needs at least 3 words OR 12 characters, so the Script Engine has something to work with. */
export const CreateJobSchema = z.object({
  topic: z
    .string({ error: 'topic is required' })
    .trim()
    .max(200, 'topic must be at most 200 characters')
    .refine((t) => wordCount(t) >= 3 || t.length >= 12, TOPIC_HINT),
});
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

/**
 * Pipeline stages. Phase 1 runs 'script' and 'quality_gate'.
 * Phase 2 appends 'assets' | 'compose' | 'publish' — the queue/runner are stage-agnostic.
 */
export type StageName = 'script' | 'quality_gate';

export type JobStatus = 'queued' | 'running' | 'passed' | 'rejected' | 'failed';
export const TERMINAL_STATUSES: JobStatus[] = ['passed', 'rejected', 'failed'];

export type StageRunOutcome = 'ok' | 'retrying' | 'error';

export type StageTiming = {
  stage: StageName;
  attempt: number; // plan attempt this run belongs to (1..3)
  run: number; // queue retry number for this stage run (1 = first try)
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: StageRunOutcome;
  error?: string;
};

/** Which model actually produced a stage's output (fallback = primary was rate-limited/overloaded). */
export type ServedBy = { model: string; fallback: boolean };

export type AttemptOutcome = 'pending' | 'passed' | 'failed_quality' | 'failed_safety';

export type Attempt = {
  n: number; // 1-based
  rewrittenFrom: number | null; // attempt this was rewritten from (with that attempt's critic feedback)
  plan: ScriptPlan;
  script: { startedAt: string; finishedAt: string; durationMs: number; repairs: number; servedBy?: ServedBy };
  review:
    | (Review & { startedAt: string; finishedAt: string; durationMs: number; repairs: number; servedBy?: ServedBy })
    | null;
  outcome: AttemptOutcome;
};

export type JobError = { code: string; message: string };

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: CreateJobInput;
  llm: { provider: string; model: string; fallbackModel?: string | null };
  status: JobStatus;
  currentStage: StageName | 'done';
  attempts: Attempt[];
  finalPlan: ScriptPlan | null;
  passedAttempt: number | null;
  timings: StageTiming[];
  error: JobError | null;
  /** Pre-generated real run loaded from /examples (shown as "Sample run"). */
  sample?: boolean;
};

export type JobSummary = Pick<Job, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'currentStage' | 'error'> & {
  topic: string;
  attempts: number;
  lastOverall: number | null;
  hook: string | null;
  sample: boolean;
};

export function toSummary(job: Job): JobSummary {
  const last = job.attempts.at(-1);
  return {
    id: job.id,
    topic: job.input.topic,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    currentStage: job.currentStage,
    error: job.error,
    attempts: job.attempts.length,
    lastOverall: last?.review?.overall ?? null,
    hook: job.finalPlan?.hook ?? null,
    sample: job.sample ?? false,
  };
}
