import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { TERMINAL, type Job, type JobSummary } from './types';

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'closed';

/** Live job via SSE (`event: job` on every stage update, `event: end` on terminal status). */
export function useJobStream(id: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');

  useEffect(() => {
    setJob(null);
    setError(null);
    if (!id) return;
    setConnection('connecting');

    let finished = false;
    const es = new EventSource(api.eventsUrl(id));
    es.addEventListener('job', (e) => {
      setJob(JSON.parse((e as MessageEvent).data));
      setConnection('live');
    });
    es.addEventListener('end', () => {
      finished = true;
      es.close();
      setConnection('closed');
    });
    es.onerror = () => {
      if (finished) return;
      if (es.readyState === EventSource.CLOSED) {
        // Not an event stream (e.g. 404/400 JSON error) — fetch once to surface the real error.
        setConnection('closed');
        api.getJob(id).then(setJob, (err: ApiError) => setError(err));
      } else {
        setConnection('reconnecting'); // EventSource retries automatically
      }
    };
    return () => {
      finished = true;
      es.close();
    };
  }, [id]);

  return { job, error, connection };
}

/** Job list. Polls only while some job is still in flight; `upsert` patches from the live stream. */
export function useJobList() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = jobs?.some((j) => !TERMINAL.includes(j.status)) ?? false;

  const refresh = useCallback(async () => {
    try {
      setJobs(await api.listJobs());
      setError(null);
    } catch (err) {
      setError(err as ApiError);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [inFlight, refresh]);

  const upsert = useCallback((s: JobSummary) => {
    setJobs((prev) => {
      if (!prev) return [s];
      const i = prev.findIndex((j) => j.id === s.id);
      if (i === -1) return [s, ...prev];
      const next = prev.slice();
      next[i] = s;
      return next;
    });
  }, []);

  return { jobs, error, refresh, upsert };
}

/** Seconds elapsed since `since`, ticking every second while `active`. */
export function useElapsed(since: string | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!since) return 0;
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
}

/** Selected job id stored in the URL hash (#/jobs/<id>) so refresh/share keeps the selection. */
export function useHashSelection() {
  const read = () => location.hash.match(/^#\/jobs\/([0-9a-f-]{36})$/i)?.[1] ?? null;
  const [id, setId] = useState<string | null>(read);
  const skip = useRef(false);

  useEffect(() => {
    const onHash = () => {
      if (skip.current) {
        skip.current = false;
        return;
      }
      setId(read());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = useCallback((next: string | null) => {
    setId(next);
    skip.current = true;
    location.hash = next ? `/jobs/${next}` : '';
  }, []);

  return [id, select] as const;
}
