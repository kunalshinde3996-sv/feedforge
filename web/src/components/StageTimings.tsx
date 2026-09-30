import { cn, fmtSec } from '../lib';
import { TERMINAL, type Job } from '../types';

const LABEL = { script: 'Script Engine', quality_gate: 'Quality Gate' } as const;

export function StageTimings({ job }: { job: Job }) {
  const sum = (stage: 'script' | 'quality_gate') =>
    job.timings.filter((t) => t.stage === stage).reduce((s, t) => s + t.durationMs, 0);
  const endToEnd = TERMINAL.includes(job.status)
    ? new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()
    : null;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Stage timings</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Script', fmtSec(sum('script'))],
          ['Quality Gate', fmtSec(sum('quality_gate'))],
          ['End to end', endToEnd !== null ? fmtSec(endToEnd) : '…'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-bg/60 px-2 py-2">
            <dt className="text-[11px] text-white/50">{k}</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {job.timings.length > 0 && (
        <ol className="mt-3 space-y-1.5 text-xs">
          {job.timings.map((t, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span
                className={cn(
                  'w-16 shrink-0 font-medium',
                  t.outcome === 'ok' ? 'text-lime' : t.outcome === 'retrying' ? 'text-amber-200' : 'text-red-300',
                )}
              >
                {t.outcome === 'ok' ? '✓ ok' : t.outcome === 'retrying' ? '↻ retry' : '✕ error'}
              </span>
              <span className="text-white/80">
                {LABEL[t.stage]} · attempt {t.attempt}
                {t.run > 1 && ` · run ${t.run}`}
              </span>
              <span className="ml-auto tabular-nums text-white/50">{fmtSec(t.durationMs)}</span>
              {t.error && <span className="w-full truncate pl-[4.5rem] text-white/40" title={t.error}>{t.error}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
