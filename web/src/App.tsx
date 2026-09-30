import { useEffect, useRef } from 'react';
import { JobDetail } from './components/JobDetail';
import { JobList } from './components/JobList';
import { TopicForm } from './components/TopicForm';
import { useHashSelection, useJobList, useJobStream } from './hooks';
import { toSummary } from './lib';

export default function App() {
  const [selectedId, select] = useHashSelection();
  const list = useJobList();
  const stream = useJobStream(selectedId);
  const detailRef = useRef<HTMLDivElement>(null);

  // Live stream → keep the matching list row in sync instantly.
  const { upsert } = list;
  useEffect(() => {
    if (stream.job) upsert(toSummary(stream.job));
  }, [stream.job, upsert]);

  const open = (id: string) => {
    select(id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Feed<span className="text-violet">Forge</span>
        </h1>
        <p className="mt-1 text-white/65">Type a topic. Get a publish-ready Qoneqt video.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr] lg:gap-6">
        <aside className="space-y-4">
          <TopicForm
            onCreated={(jobId, topic) => {
              const now = new Date().toISOString();
              upsert({
                id: jobId,
                topic,
                createdAt: now,
                updatedAt: now,
                status: 'queued',
                currentStage: 'script',
                error: null,
                attempts: 0,
                lastOverall: null,
                hook: null,
              });
              open(jobId);
            }}
          />
          <JobList jobs={list.jobs} error={list.error} selectedId={selectedId} onSelect={open} onRetry={list.refresh} />
        </aside>

        <main ref={detailRef} className="min-w-0 scroll-mt-4">
          {selectedId ? (
            <JobDetail job={stream.job} error={stream.error} connection={stream.connection} />
          ) : (
            <EmptyDetail />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
      <p className="font-heading text-lg font-semibold">No job selected</p>
      <p className="mt-1 max-w-sm text-sm text-white/55">
        Generate a video plan from a topic, or pick a job from the list. The pipeline runs Script Engine → Quality Gate
        and streams each stage here live.
      </p>
    </div>
  );
}
