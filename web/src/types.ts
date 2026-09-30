// Mirrors server/src/schemas — the API contract the dashboard consumes.

export type StageName = 'script' | 'quality_gate';
export type JobStatus = 'queued' | 'running' | 'passed' | 'rejected' | 'failed';
export const TERMINAL: JobStatus[] = ['passed', 'rejected', 'failed'];
export const MAX_ATTEMPTS = 3;
export const PASS_OVERALL = 7;
export const MIN_SAFETY = 8;

export type Scene = {
  id: number;
  durationSec: number;
  visualQuery: string;
  onScreenText: string;
  voiceover: string;
};

export type ScriptPlan = {
  topic: string;
  hookOptions: string[];
  hook: string;
  title: string;
  description: string;
  hashtags: string[];
  scenes: Scene[];
  totalDurationSec: number;
};

export type Scores = { hook: number; clarity: number; pacing: number; safety: number };

export type ServedBy = { model: string; fallback: boolean };

export type Review = {
  scores: Scores;
  overall: number;
  pass: boolean;
  feedback: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  repairs: number;
  servedBy?: ServedBy;
};

export type AttemptOutcome = 'pending' | 'passed' | 'failed_quality' | 'failed_safety';

export type Attempt = {
  n: number;
  rewrittenFrom: number | null;
  plan: ScriptPlan;
  script: { startedAt: string; finishedAt: string; durationMs: number; repairs: number; servedBy?: ServedBy };
  review: Review | null;
  outcome: AttemptOutcome;
};

export type StageTiming = {
  stage: StageName;
  attempt: number;
  run: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: 'ok' | 'retrying' | 'error';
  error?: string;
};

export type JobError = { code: string; message: string };

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: { topic: string };
  llm: { provider: string; model: string; fallbackModel?: string | null };
  status: JobStatus;
  currentStage: StageName | 'done';
  attempts: Attempt[];
  finalPlan: ScriptPlan | null;
  passedAttempt: number | null;
  timings: StageTiming[];
  error: JobError | null;
  sample?: boolean;
};

export type JobSummary = {
  id: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  currentStage: StageName | 'done';
  error: JobError | null;
  attempts: number;
  lastOverall: number | null;
  hook: string | null;
  sample: boolean;
};
