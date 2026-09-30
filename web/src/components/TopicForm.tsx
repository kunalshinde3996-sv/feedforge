import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { TOPIC_HINT, cn, isDetailedTopic } from '../lib';

const EXAMPLES = ['Monsoon street food in Mumbai', 'How UPI changed small shops', '3 study habits that actually work'];
const MAX = 200;

export function TopicForm({ onCreated }: { onCreated: (jobId: string, topic: string) => void }) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = topic.trim();
  const valid = isDetailedTopic(trimmed) && trimmed.length <= MAX;
  const tooShort = trimmed.length > 0 && !valid;

  async function submit(value: string) {
    const t = value.trim();
    if (!isDetailedTopic(t) || t.length > MAX || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await api.createJob(t);
      onCreated(jobId, t);
      setTopic('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(topic);
  };

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <form onSubmit={onSubmit}>
        <label htmlFor="topic" className="block font-heading text-sm font-semibold text-white/90">
          What should the video be about?
        </label>
        <div className="mt-2 flex flex-col gap-2">
          <input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={MAX}
            placeholder="Type a topic, prompt or trend…"
            aria-invalid={tooShort}
            aria-describedby="topic-help"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-white placeholder:text-white/35 focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/30"
          />
          <button
            type="submit"
            disabled={!valid || busy}
            className="rounded-xl bg-violet px-5 py-2.5 font-heading font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Starting…' : 'Generate'}
          </button>
        </div>
        <p id="topic-help" className={cn('mt-1.5 text-xs', tooShort ? 'text-red-300' : 'text-white/45')}>
          {tooShort ? TOPIC_HINT : `${trimmed.length}/${MAX}`}
        </p>
      </form>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Example topics">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={busy}
            onClick={() => {
              setTopic(ex);
              void submit(ex);
            }}
            className="rounded-full border border-line bg-bg/60 px-3 py-1 text-xs text-white/75 transition hover:border-violet/60 hover:text-white disabled:opacity-40"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
