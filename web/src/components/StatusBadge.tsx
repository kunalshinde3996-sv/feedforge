import { cn } from '../lib';
import type { JobStatus } from '../types';

const STYLES: Record<JobStatus, { label: string; icon: string; cls: string }> = {
  queued: { label: 'Queued', icon: '○', cls: 'border-white/15 text-white/70' },
  running: { label: 'Running', icon: '●', cls: 'border-violet/40 bg-violet/10 text-violet' },
  passed: { label: 'Passed', icon: '✓', cls: 'border-lime/40 bg-lime/10 text-lime' },
  rejected: { label: 'Rejected', icon: '⛔', cls: 'border-red-400/40 bg-red-400/10 text-red-300' },
  failed: { label: 'Failed', icon: '✕', cls: 'border-red-400/40 bg-red-400/10 text-red-300' },
};

/** Marks pre-generated real runs loaded from /examples, so it's clear they weren't created live. */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      title="A real pipeline run generated earlier and pre-loaded so the dashboard is never empty"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-white/25 px-2 py-0.5 text-[11px] font-medium text-white/65',
        className,
      )}
    >
      <span aria-hidden>◆</span> Sample run
    </span>
  );
}

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        s.cls,
        className,
      )}
    >
      <span aria-hidden className={cn(status === 'running' && 'animate-pulse')}>
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}
