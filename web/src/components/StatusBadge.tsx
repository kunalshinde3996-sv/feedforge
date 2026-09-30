import { cn } from '../lib';
import type { JobStatus } from '../types';

const STYLES: Record<JobStatus, { label: string; icon: string; cls: string }> = {
  queued: { label: 'Queued', icon: '○', cls: 'border-white/15 text-white/70' },
  running: { label: 'Running', icon: '●', cls: 'border-violet/40 bg-violet/10 text-violet' },
  passed: { label: 'Passed', icon: '✓', cls: 'border-lime/40 bg-lime/10 text-lime' },
  rejected: { label: 'Rejected', icon: '⛔', cls: 'border-red-400/40 bg-red-400/10 text-red-300' },
  failed: { label: 'Failed', icon: '✕', cls: 'border-red-400/40 bg-red-400/10 text-red-300' },
};

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
