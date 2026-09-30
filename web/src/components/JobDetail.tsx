import { useState } from 'react';
import { ApiError } from '../api';
import { friendlyError } from '../errors';
import type { Connection } from '../hooks';
import { cn, downloadJson, servedModelsLabel, timeAgo } from '../lib';
import { TERMINAL, type Job, type JobError } from '../types';
import { LiveActivity, PipelineStepper } from './PipelineStepper';
import { HookSection, PostMeta, SceneTable } from './PlanView';
import { QualityGatePanel } from './QualityGatePanel';
import { StageTimings } from './StageTimings';
import { SampleBadge, StatusBadge } from './StatusBadge';

type Props = {
  job: Job | null;
  error: ApiError | null;
  connection: Connection;
  /** Re-submit the same topic as a new job. */
  onRetry: (topic: string) => Promise<void>;
  /** Jump to the most recent sample run; null when none exists. */
  onShowSample: (() => void) | null;
};

export function JobDetail({ job, error, connection, onRetry, onShowSample }: Props) {
  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 p-6 text-center">
        <p className="font-heading font-semibold text-red-200">
          {error.code === 'JOB_NOT_FOUND' ? 'Job not found' : 'Could not load this job'}
        </p>
        <p className="mt-1 text-sm text-red-200/80">{error.message}</p>
      </div>
    );
  }
  if (!job) return <DetailSkeleton />;

  const terminal = TERMINAL.includes(job.status);
  const latest = job.attempts.at(-1);
  const plan = job.finalPlan ?? latest?.plan ?? null;
  const planIsDraft = !job.finalPlan && !!latest;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/45">Topic</p>
            <h2 className="mt-1 break-words text-xl font-bold sm:text-2xl">{job.input.topic}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
              {job.sample && <SampleBadge />}
              <span>{timeAgo(job.createdAt)}</span>
              <span>
                {job.llm.provider} · {servedModelsLabel(job)}
              </span>
              <ConnectionDot connection={connection} terminal={terminal} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} className="px-3 py-1 text-sm" />
            <button
              onClick={() => downloadJson(job)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-white/85 transition hover:border-violet hover:text-white"
            >
              ↓ Download JSON
            </button>
          </div>
        </div>

        <div className="mt-4">
          <PipelineStepper job={job} />
        </div>
        <div className="mt-3 min-h-5">
          <LiveActivity job={job} />
        </div>

        {job.error && (
          <ErrorBanner
            error={job.error}
            rejected={job.status === 'rejected'}
            canRetry={job.status === 'failed'}
            onRetry={() => onRetry(job.input.topic)}
            onShowSample={onShowSample}
          />
        )}
      </section>

      <QualityGatePanel job={job} />

      {plan ? (
        <>
          {planIsDraft && (
            <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-white/60">
              {terminal
                ? `Showing the last draft (attempt ${latest!.n}). It did not pass the Quality Gate, so it is not publish-ready.`
                : `Showing draft attempt ${latest!.n}. Not approved yet.`}
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <HookSection plan={plan} />
            <PostMeta plan={plan} />
          </div>
          <SceneTable plan={plan} />
        </>
      ) : (
        !terminal && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-white/50">
            The scene plan appears here as soon as the Script Engine finishes.
          </div>
        )
      )}

      <StageTimings job={job} />
    </div>
  );
}

function ErrorBanner({
  error,
  rejected,
  canRetry,
  onRetry,
  onShowSample,
}: {
  error: JobError;
  rejected: boolean;
  canRetry: boolean;
  onRetry: () => Promise<void>;
  onShowSample: (() => void) | null;
}) {
  const f = friendlyError(error);
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const retry = async () => {
    setBusy(true);
    setRetryError(null);
    try {
      await onRetry();
    } catch (err) {
      setRetryError(err instanceof ApiError ? err.message : 'Could not start a new job');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">
      <p>
        <strong className="font-semibold">{rejected ? 'Rejected.' : 'Failed.'}</strong> {f.message}
      </p>

      {((canRetry && f.retryable) || (f.suggestSample && onShowSample)) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {canRetry && f.retryable && (
            <button
              onClick={retry}
              disabled={busy}
              className="rounded-lg bg-violet px-3 py-1.5 font-heading text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'Starting…' : '↻ Retry'}
            </button>
          )}
          {f.suggestSample && onShowSample && (
            <button
              onClick={onShowSample}
              className="rounded-lg border border-white/25 px-3 py-1.5 text-sm text-white/90 transition hover:border-white/50"
            >
              ◆ View a sample run
            </button>
          )}
        </div>
      )}
      {retryError && <p className="mt-2 text-xs text-red-200">{retryError}</p>}

      <details className="mt-2 text-xs text-red-200/70">
        <summary className="cursor-pointer select-none hover:text-red-100">Technical details</summary>
        <p className="mt-1 break-words font-mono">
          {error.code}: {error.message}
        </p>
      </details>
    </div>
  );
}

function ConnectionDot({ connection, terminal }: { connection: Connection; terminal: boolean }) {
  if (terminal) return null;
  const map = {
    connecting: ['bg-white/40', 'Connecting…'],
    live: ['bg-lime animate-pulse', 'Live'],
    reconnecting: ['bg-amber-300', 'Reconnecting…'],
    closed: ['bg-white/40', 'Offline'],
  } as const;
  const [dot, label] = map[connection];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading job">
      {[40, 64, 48].map((h, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-line bg-card" style={{ height: `${h * 4}px` }} />
      ))}
    </div>
  );
}
