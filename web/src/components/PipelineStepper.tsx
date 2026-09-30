import { useElapsed } from '../hooks';
import { cn, fmtScore } from '../lib';
import { MAX_ATTEMPTS, TERMINAL, type Job } from '../types';

type StepState = 'done' | 'active' | 'failed' | 'pending' | 'phase2';
type Step = { key: string; label: string; short?: string; state: StepState; detail?: string };

function steps(job: Job): Step[] {
  const terminal = TERMINAL.includes(job.status);
  const ended = job.status === 'failed' || job.status === 'rejected';
  const n = job.attempts.length;
  const last = job.attempts.at(-1);

  let script: Step;
  if (ended && job.currentStage === 'script') script = { key: 'script', label: 'Script', state: 'failed', detail: 'Error' };
  else if (job.currentStage === 'script' && !terminal)
    script = {
      key: 'script',
      label: 'Script',
      state: 'active',
      detail: n === 0 ? `Drafting · 1/${MAX_ATTEMPTS}` : `Rewrite · ${n + 1}/${MAX_ATTEMPTS}`,
    };
  else if (n > 0) script = { key: 'script', label: 'Script', state: 'done', detail: `${n} plan${n > 1 ? 's' : ''} written` };
  else script = { key: 'script', label: 'Script', state: 'pending' };

  let gate: Step;
  if (job.status === 'passed')
    gate = { key: 'gate', label: 'Quality Gate', short: 'Gate', state: 'done', detail: `Passed · ${fmtScore(last!.review!.overall)}/10` };
  else if (job.status === 'rejected' && job.currentStage === 'quality_gate')
    gate = { key: 'gate', label: 'Quality Gate', short: 'Gate', state: 'failed', detail: 'Rejected · safety' };
  else if (job.status === 'failed' && job.currentStage === 'quality_gate')
    gate = {
      key: 'gate',
      label: 'Quality Gate', short: 'Gate',
      state: 'failed',
      detail: job.error?.code === 'QUALITY_GATE_EXHAUSTED' ? `Failed · ${n}/${MAX_ATTEMPTS} attempts` : 'Error',
    };
  else if (job.currentStage === 'quality_gate' && !terminal)
    gate = { key: 'gate', label: 'Quality Gate', short: 'Gate', state: 'active', detail: `Scoring attempt ${n}` };
  else if (last?.review && !last.review.pass)
    gate = { key: 'gate', label: 'Quality Gate', short: 'Gate', state: 'pending', detail: `Attempt ${last.n} failed` };
  else gate = { key: 'gate', label: 'Quality Gate', short: 'Gate', state: 'pending', detail: terminal ? 'Not reached' : undefined };

  return [
    { key: 'input', label: 'Input', state: 'done', detail: 'Topic received' },
    script,
    gate,
    { key: 'assets', label: 'Assets', state: 'phase2', detail: 'Phase 2' },
    { key: 'compose', label: 'Compose', state: 'phase2', detail: 'Phase 2' },
    { key: 'publish', label: 'Publish', state: 'phase2', detail: 'Phase 2' },
  ];
}

const ICON: Record<StepState, string> = { done: '✓', active: '', failed: '✕', pending: '', phase2: '' };

export function PipelineStepper({ job }: { job: Job }) {
  const list = steps(job);
  return (
    <ol
      aria-label="Pipeline stages"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-[repeat(6,minmax(max-content,1fr))]"
    >
      {list.map((s, i) => (
        <li
          key={s.key}
          aria-current={s.state === 'active' ? 'step' : undefined}
          className={cn(
            'relative rounded-xl border px-3 py-2.5',
            s.state === 'done' && 'border-lime/30 bg-lime/[0.06]',
            s.state === 'active' && 'border-violet/60 bg-violet/10 shadow-[0_0_0_3px_rgba(167,139,250,0.12)]',
            s.state === 'failed' && 'border-red-400/40 bg-red-400/10',
            s.state === 'pending' && 'border-line bg-bg/40',
            s.state === 'phase2' && 'border-dashed border-line bg-transparent opacity-45',
          )}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                s.state === 'done' && 'bg-lime text-bg',
                s.state === 'active' && 'border-2 border-violet border-t-transparent animate-spin',
                s.state === 'failed' && 'bg-red-400 text-bg',
                (s.state === 'pending' || s.state === 'phase2') && 'border border-white/25 text-white/50',
              )}
            >
              {ICON[s.state] || (s.state === 'active' ? '' : i + 1)}
            </span>
            <span className="whitespace-nowrap font-heading text-sm font-semibold">
              {s.short ? (
                <>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </>
              ) : (
                s.label
              )}
            </span>
          </div>
          <p
            className={cn(
              // contain: detail text never widens the column; it truncates instead
              'mt-1 truncate text-xs [contain:inline-size]',
              s.state === 'active' ? 'text-violet' : s.state === 'failed' ? 'text-red-200' : 'text-white/50',
            )}
          >
            <span className="sr-only">{stateWord(s.state)}: </span>
            {s.detail ?? 'Waiting'}
          </p>
        </li>
      ))}
    </ol>
  );
}

const stateWord = (s: StepState) =>
  ({ done: 'Done', active: 'In progress', failed: 'Stopped', pending: 'Pending', phase2: 'Not in Phase 1' })[s];

/** One-line narration of what is happening right now, with a live elapsed timer. */
export function LiveActivity({ job }: { job: Job }) {
  const active = !TERMINAL.includes(job.status);
  const elapsed = useElapsed(job.updatedAt, active);
  const total = useElapsed(job.createdAt, active);
  if (!active) return null;

  const n = job.attempts.length;
  const lastTiming = job.timings.at(-1);
  const retrying = lastTiming?.outcome === 'retrying' && lastTiming.stage === job.currentStage;

  let msg: string;
  if (job.status === 'queued') msg = 'Queued, waiting for a worker…';
  else if (job.currentStage === 'script')
    msg =
      n === 0
        ? 'Script Engine is drafting 3 hooks, picking the strongest and writing scenes…'
        : `Script Engine is rewriting attempt ${n} using the critic's feedback…`;
  else msg = `Quality Gate critic is scoring attempt ${n} on hook, clarity, pacing and safety…`;

  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="inline-block size-2 animate-pulse rounded-full bg-violet" aria-hidden />
      <span className="text-white/85">{msg}</span>
      <span className="tabular-nums text-white/45">
        {elapsed}s · total {total}s
      </span>
      {retrying && (
        <span className="rounded-md bg-amber-300/10 px-2 py-0.5 text-xs text-amber-200">
          ↻ LLM busy, retrying (run {lastTiming.run + 1})
        </span>
      )}
    </div>
  );
}
