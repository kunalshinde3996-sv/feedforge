import { cn, fmtScore, fmtSec } from '../lib';
import { MAX_ATTEMPTS, MIN_SAFETY, PASS_OVERALL, TERMINAL, type Attempt, type Job, type Scores } from '../types';

const DIMENSIONS: { key: keyof Scores; label: string }[] = [
  { key: 'hook', label: 'Hook' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'safety', label: 'Safety' },
];

export function QualityGatePanel({ job }: { job: Job }) {
  const n = job.attempts.length;
  const running = !TERMINAL.includes(job.status);
  const rewriting = running && job.currentStage === 'script' && n > 0;

  return (
    <section aria-labelledby="qg-title" className="rounded-2xl border-2 border-violet/35 bg-card p-4 sm:p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="qg-title" className="text-xl font-bold">
            Quality <span className="text-violet">Gate</span>
          </h2>
          <p className="mt-1 text-xs text-white/55">
            An independent LLM critic scores every plan. Pass = overall ≥ {PASS_OVERALL} <strong>and</strong> safety ≥{' '}
            {MIN_SAFETY}. A failing plan is rewritten with the critic's feedback (max {MAX_ATTEMPTS - 1} rewrites). Safety
            below {MIN_SAFETY} means the job is rejected.
          </p>
        </div>
        <AttemptCounter used={n} passedAt={job.passedAttempt} />
      </header>

      {n === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-white/50">
          {running ? 'Waiting for the Script Engine to finish the first plan…' : 'No plan reached the Quality Gate.'}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
            {job.attempts.map((a) => (
              <AttemptCard key={a.n} attempt={a} reviewing={running && job.currentStage === 'quality_gate' && a.n === n} />
            ))}
            {rewriting && <RewritingCard n={n + 1} from={n} />}
          </div>
          <GateVerdict job={job} />
        </div>
      )}
    </section>
  );
}

/** The gate's decision spelled out: the two rules checked against the latest review, rewrites used, trend. */
function GateVerdict({ job }: { job: Job }) {
  const reviewed = job.attempts.filter((a) => a.review);
  const last = reviewed.at(-1)?.review ?? null;
  const rewrites = job.attempts.filter((a) => a.rewrittenFrom !== null).length;

  const headline =
    job.status === 'passed'
      ? { text: `Passed on attempt ${job.passedAttempt}`, icon: '✓', cls: 'text-lime' }
      : job.status === 'rejected'
        ? { text: 'Rejected', icon: '⛔', cls: 'text-red-300' }
        : job.status === 'failed'
          ? { text: 'Did not pass', icon: '✕', cls: 'text-red-300' }
          : { text: 'In progress', icon: '◌', cls: 'text-violet' };

  const checks = last
    ? [
        { label: `Overall ≥ ${PASS_OVERALL}`, value: last.overall, ok: last.overall >= PASS_OVERALL },
        { label: `Safety ≥ ${MIN_SAFETY}`, value: last.scores.safety, ok: last.scores.safety >= MIN_SAFETY },
      ]
    : [];

  return (
    <aside aria-label="Gate verdict" className="order-first self-start rounded-xl xl:order-none border border-line bg-bg/50 p-4 text-sm">
      <p className={cn('flex items-center gap-2 font-heading text-lg font-bold', headline.cls)}>
        <span aria-hidden>{headline.icon}</span>
        {headline.text}
      </p>

      {checks.length > 0 && (
        <>
          <h3 className="mt-3 text-[11px] uppercase tracking-widest text-white/45">
            Rules · attempt {reviewed.at(-1)!.n}
          </h3>
          <ul className="mt-1.5 space-y-1">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-2">
                <span className="text-white/75">{c.label}</span>
                <span className={cn('tabular-nums font-medium', c.ok ? 'text-lime' : 'text-red-300')}>
                  {fmtScore(c.value)} {c.ok ? '✓ met' : '✕ not met'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <dl className="mt-3 space-y-1 border-t border-line pt-3">
        <div className="flex justify-between">
          <dt className="text-white/55">Rewrites used</dt>
          <dd className="tabular-nums">
            {rewrites} / {MAX_ATTEMPTS - 1}
          </dd>
        </div>
        {reviewed.length > 1 && (
          <div className="flex justify-between gap-2">
            <dt className="text-white/55">Overall trend</dt>
            <dd className="tabular-nums">{reviewed.map((a) => fmtScore(a.review!.overall)).join(' → ')}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

function AttemptCounter({ used, passedAt }: { used: number; passedAt: number | null }) {
  return (
    <div className="text-right">
      <div className="font-heading text-2xl font-bold tabular-nums">
        {used}
        <span className="text-base text-white/45">/{MAX_ATTEMPTS}</span>
      </div>
      <div className="text-xs text-white/55">attempts used</div>
      <div className="mt-1 flex justify-end gap-1" aria-hidden>
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-6 rounded-full',
              i + 1 === passedAt ? 'bg-lime' : i < used ? 'bg-violet' : 'bg-white/10',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function verdict(a: Attempt, reviewing: boolean) {
  if (!a.review) return reviewing ? { text: 'Reviewing…', icon: '◌', cls: 'text-violet' } : { text: 'Awaiting review', icon: '○', cls: 'text-white/55' };
  switch (a.outcome) {
    case 'passed':
      return { text: 'PASSED', icon: '✓', cls: 'text-lime' };
    case 'failed_safety':
      return { text: `REJECTED: safety below ${MIN_SAFETY}`, icon: '⛔', cls: 'text-red-300' };
    default:
      return { text: `FAILED: overall below ${PASS_OVERALL}`, icon: '✕', cls: 'text-red-300' };
  }
}

function AttemptCard({ attempt: a, reviewing }: { attempt: Attempt; reviewing: boolean }) {
  const v = verdict(a, reviewing);
  const r = a.review;
  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-bg/50 p-4',
        a.outcome === 'passed' ? 'border-lime/50' : a.outcome === 'pending' ? 'border-violet/40' : 'border-line',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading font-semibold">Attempt {a.n}</h3>
          <p className="text-xs text-white/50">
            {a.rewrittenFrom ? `Rewritten from attempt ${a.rewrittenFrom}` : 'Original plan'}
          </p>
        </div>
        <p className={cn('flex items-center gap-1 text-right text-xs font-bold tracking-wide', v.cls)}>
          <span aria-hidden className={cn(reviewing && !r && 'animate-spin inline-block')}>
            {v.icon}
          </span>
          {v.text}
        </p>
      </header>

      <div className="mt-3 flex items-baseline gap-2">
        {r ? (
          <>
            <span className="font-heading text-3xl font-bold tabular-nums">{fmtScore(r.overall)}</span>
            <span className="text-sm text-white/45">/ 10 overall</span>
            <span className="ml-auto text-xs text-white/45">needs ≥ {PASS_OVERALL}</span>
          </>
        ) : (
          <span className="h-9 w-24 animate-pulse rounded-md bg-white/5" />
        )}
      </div>

      <dl className="mt-3 space-y-2.5">
        {DIMENSIONS.map((d) => (
          <ScoreBar key={d.key} label={d.label} value={r?.scores[d.key]} threshold={d.key === 'safety' ? MIN_SAFETY : undefined} />
        ))}
      </dl>

      {r && (
        <blockquote className="mt-4 whitespace-pre-line border-l-2 border-violet/50 pl-3 text-sm leading-relaxed text-white/80">
          {r.feedback}
        </blockquote>
      )}

      <footer className="mt-auto pt-3 text-[11px] text-white/40">
        Script {fmtSec(a.script.durationMs)}
        {r && ` · critic ${fmtSec(r.durationMs)}`}
        {(a.script.repairs > 0 || (r?.repairs ?? 0) > 0) && ` · JSON repairs ${a.script.repairs + (r?.repairs ?? 0)}`}
      </footer>
    </article>
  );
}

/** 0–10 meter; safety shows its pass threshold as a tick. Value is always printed, never color-only. */
function ScoreBar({ label, value, threshold }: { label: string; value: number | undefined; threshold?: number }) {
  const below = threshold !== undefined && value !== undefined && value < threshold;
  return (
    <div className="grid grid-cols-[4.5rem_1fr_3.25rem] items-center gap-2">
      <dt className="text-xs text-white/65">{label}</dt>
      <dd className="relative h-2 rounded-full bg-white/10" title={value !== undefined ? `${label}: ${value} / 10` : undefined}>
        {value !== undefined ? (
          <div
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={value}
            className={cn('h-full rounded-full transition-[width] duration-700', below ? 'bg-red-400' : 'bg-violet')}
            style={{ width: `${value * 10}%` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/5" />
        )}
        {threshold !== undefined && (
          <span
            aria-hidden
            className="absolute -top-1 h-4 w-0.5 rounded bg-white/60"
            style={{ left: `calc(${threshold * 10}% - 1px)` }}
          />
        )}
      </dd>
      <dd className="text-right text-xs tabular-nums text-white/85">
        {value !== undefined ? (
          <>
            {fmtScore(value)}
            {below && <span className="text-red-300"> ⚠</span>}
          </>
        ) : (
          '–'
        )}
      </dd>
    </div>
  );
}

function RewritingCard({ n, from }: { n: number; from: number }) {
  return (
    <article className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet/40 bg-violet/5 p-6 text-center">
      <span className="inline-block animate-spin text-xl text-violet" aria-hidden>
        ↻
      </span>
      <h3 className="mt-2 font-heading font-semibold">Attempt {n}</h3>
      <p className="mt-1 text-sm text-white/60">Rewriting from attempt {from} with the critic's feedback…</p>
    </article>
  );
}
