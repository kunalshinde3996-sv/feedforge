import type { Job, JobSummary } from './types';

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

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
  };
}

export function downloadJson(job: Job) {
  const slug = job.input.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const blob = new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedforge-${slug}-${job.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
