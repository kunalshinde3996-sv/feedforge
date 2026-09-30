import type { ApiError } from '../api';
import { cn, fmtScore, timeAgo } from '../lib';
import { MAX_ATTEMPTS, type JobSummary } from '../types';
import { SampleBadge, StatusBadge } from './StatusBadge';

type Props = {
  jobs: JobSummary[] | null;
  error: ApiError | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
};

const STAGE_LABEL = { script: 'Script', quality_gate: 'Quality Gate', done: 'Done' } as const;

export function JobList({ jobs, error, selectedId, onSelect, onRetry }: Props) {
  return (
    <section className="rounded-2xl border border-line bg-card">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Jobs</h2>
        {jobs && <span className="text-xs text-white/45">{jobs.length}</span>}
      </header>

      {error && !jobs && (
        <div className="p-4 text-sm">
          <p className="text-red-200">{error.message}</p>
          <button onClick={onRetry} className="mt-2 text-violet underline-offset-2 hover:underline">
            Try again
          </button>
        </div>
      )}

      {!jobs && !error && (
        <ul aria-label="Loading jobs" className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
          ))}
        </ul>
      )}

      {jobs && jobs.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-white/50">
          No jobs yet. Type a topic or tap an example to start one.
        </p>
      )}

      {jobs && jobs.length > 0 && (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
          {jobs.map((j) => {
            const active = j.status === 'queued' || j.status === 'running';
            return (
              <li key={j.id}>
                <button
                  onClick={() => onSelect(j.id)}
                  aria-current={j.id === selectedId ? 'true' : undefined}
                  className={cn(
                    'w-full px-4 py-3 text-left transition hover:bg-white/[0.03]',
                    j.id === selectedId && 'bg-violet/10 hover:bg-violet/10',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 text-sm font-medium text-white/90">{j.topic}</span>
                    <StatusBadge status={j.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
                    {j.sample && <SampleBadge />}
                    <span>{timeAgo(j.createdAt)}</span>
                    {active && <span>{STAGE_LABEL[j.currentStage]}</span>}
                    {j.attempts > 0 && (
                      <span>
                        attempt {j.attempts}/{MAX_ATTEMPTS}
                      </span>
                    )}
                    {j.lastOverall !== null && <span>overall {fmtScore(j.lastOverall)}</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
