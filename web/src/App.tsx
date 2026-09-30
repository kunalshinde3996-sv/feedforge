import { useEffect, useState } from 'react';

type Health = { status: string; llm: { provider: string; model: string | null } };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-4xl font-bold">
        Feed<span className="text-violet">Forge</span>
      </h1>
      <p className="mt-2 text-white/70">Type a topic. Get a publish-ready Qoneqt video.</p>
      <div className="mt-8 rounded-xl border border-line bg-card p-4 text-sm">
        {error && <span className="text-red-300">API unreachable: {error}</span>}
        {!error && !health && <span className="text-white/60">Checking API…</span>}
        {health && (
          <span>
            API <span className="text-lime">{health.status}</span> · provider {health.llm.provider} · model{' '}
            {health.llm.model ?? 'not set'}
          </span>
        )}
      </div>
    </main>
  );
}
