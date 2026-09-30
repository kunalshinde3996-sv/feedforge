import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { GOOD, MockLLM, listen, review, setup, validPlan } from './helpers.js';

let server: Server | undefined;
afterEach(() => server?.close());

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('API', () => {
  it('GET /api/health', async () => {
    const s = setup(new MockLLM({}));
    const l = await listen(s.app);
    server = l.server;
    const res = await fetch(`${l.base}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });

  it('validates POST body with the standard error format', async () => {
    const s = setup(new MockLLM({}));
    const l = await listen(s.app);
    server = l.server;
    for (const body of [{}, { topic: 'hi' }, { topic: 42 }]) {
      const res = await post(l.base, body);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.message).toMatch(/topic/);
    }
    const bad = await fetch(`${l.base}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect((await bad.json()).error.code).toBe('INVALID_JSON');
  });

  it('creates a job, lists it, returns details, and streams SSE until done', async () => {
    const llm = new MockLLM({ script: [validPlan()], critic: [review(GOOD)] });
    const s = setup(llm);
    const l = await listen(s.app);
    server = l.server;

    const res = await post(l.base, { topic: 'Monsoon street food in Mumbai' });
    expect(res.status).toBe(202);
    const { jobId } = await res.json();

    const sse = await fetch(`${l.base}/api/jobs/${jobId}/events`);
    expect(sse.headers.get('content-type')).toMatch(/text\/event-stream/);
    const text = await sse.text(); // server closes the stream on a terminal status
    expect(text).toMatch(/event: job/);
    expect(text).toMatch(/event: end\ndata: {"status":"passed"}/);

    const job = await (await fetch(`${l.base}/api/jobs/${jobId}`)).json();
    expect(job.status).toBe('passed');
    expect(job.attempts).toHaveLength(1);

    const list = await (await fetch(`${l.base}/api/jobs`)).json();
    expect(list.jobs[0].id).toBe(jobId);
    expect(list.jobs[0].status).toBe('passed');
  });

  it('404 / 400 for unknown or malformed job ids', async () => {
    const s = setup(new MockLLM({}));
    const l = await listen(s.app);
    server = l.server;
    expect((await (await fetch(`${l.base}/api/jobs/00000000-0000-4000-8000-000000000000`)).json()).error.code).toBe('JOB_NOT_FOUND');
    expect((await (await fetch(`${l.base}/api/jobs/abc`)).json()).error.code).toBe('INVALID_JOB_ID');
  });

  it('rate limits POST /api/jobs', async () => {
    const llm = new MockLLM({ script: [validPlan(), validPlan()], critic: [review(GOOD), review(GOOD)] });
    const s = setup(llm, { rateMax: 2 });
    const l = await listen(s.app);
    server = l.server;
    expect((await post(l.base, { topic: 'topic one' })).status).toBe(202);
    expect((await post(l.base, { topic: 'topic two' })).status).toBe(202);
    const third = await post(l.base, { topic: 'topic three' });
    expect(third.status).toBe(429);
    expect((await third.json()).error.code).toBe('RATE_LIMITED');
    await s.queue.drain();
  });

  it('returns 503 when the LLM is not configured', async () => {
    const s = setup(new MockLLM({}), { pipeline: false });
    const l = await listen(s.app);
    server = l.server;
    const res = await post(l.base, { topic: 'valid topic' });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('LLM_NOT_CONFIGURED');
  });
});
