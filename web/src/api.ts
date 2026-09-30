import type { Job, JobSummary } from './types';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the FeedForge API. Is the server running?', 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  createJob: (topic: string) =>
    request<{ jobId: string }>('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic }),
    }),
  listJobs: () => request<{ jobs: JobSummary[] }>('/api/jobs').then((r) => r.jobs),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  eventsUrl: (id: string) => `/api/jobs/${id}/events`,
};
