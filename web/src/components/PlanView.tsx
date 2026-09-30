import { cn } from '../lib';
import type { ScriptPlan } from '../types';

const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');

export function HookSection({ plan }: { plan: ScriptPlan }) {
  const chosen = plan.hookOptions.findIndex((o) => norm(o) === norm(plan.hook));
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Hook · first 2 seconds</h2>
      <p className="mt-2 font-heading text-2xl font-bold leading-tight text-white sm:text-3xl">“{plan.hook}”</p>
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-white/45">3 hook options drafted</h3>
      <ol className="mt-2 space-y-2">
        {plan.hookOptions.map((o, i) => (
          <li
            key={i}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-2 text-sm',
              i === chosen ? 'border-lime/40 bg-lime/[0.07] text-white' : 'border-line text-white/65',
            )}
          >
            <span className="mt-px font-heading text-xs font-bold text-white/40">{i + 1}</span>
            <span className="flex-1">{o}</span>
            {i === chosen && (
              <span className="shrink-0 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-bg">★ Chosen</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SceneTable({ plan }: { plan: ScriptPlan }) {
  return (
    <section className="rounded-2xl border border-line bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-semibold">Scene plan</h2>
        <span className="text-xs text-white/50">
          {plan.scenes.length} scenes · {plan.totalDurationSec}s · 9:16 vertical
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-white/45">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium sm:pl-5">#</th>
              <th scope="col" className="px-2 py-2 font-medium">Time</th>
              <th scope="col" className="px-2 py-2 font-medium">On-screen text</th>
              <th scope="col" className="px-2 py-2 font-medium">Voiceover</th>
              <th scope="col" className="px-4 py-2 font-medium sm:pr-5">Visual query</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {plan.scenes.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="px-4 py-3 font-heading font-semibold text-white/60 sm:pl-5">{s.id}</td>
                <td className="whitespace-nowrap px-2 py-3 tabular-nums text-white/70">{s.durationSec}s</td>
                <td className="px-2 py-3 font-medium text-lime">{s.onScreenText}</td>
                <td className="px-2 py-3 text-white/85">{s.voiceover}</td>
                <td className="px-4 py-3 text-white/55 sm:pr-5">
                  <code className="rounded bg-bg/70 px-1.5 py-0.5 text-xs">{s.visualQuery}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PostMeta({ plan }: { plan: ScriptPlan }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Post</h2>
      <p className="mt-2 font-heading text-lg font-semibold">{plan.title}</p>
      <p className="mt-1 text-sm text-white/75">{plan.description}</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Hashtags">
        {plan.hashtags.map((h) => (
          <li key={h} className="rounded-full bg-violet/15 px-2.5 py-0.5 text-xs font-medium text-violet">
            {h}
          </li>
        ))}
      </ul>
    </section>
  );
}
