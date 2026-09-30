import { describe, expect, it } from 'vitest';
import { LLMBlockedError, LLMTransientError } from '../src/providers/index.js';
import { GOOD, MockLLM, UNSAFE, WEAK, review, setup, validPlan } from './helpers.js';

async function run(llm: MockLLM, topic = 'Monsoon street food in Mumbai') {
  const { pipeline, queue, store } = setup(llm);
  const job = await pipeline!.submit(topic);
  await queue.drain();
  return (await store.get(job.id))!;
}

describe('pipeline', () => {
  it('passes on the first attempt', async () => {
    const llm = new MockLLM({ script: [validPlan()], critic: [review(GOOD)] });
    const job = await run(llm);
    expect(job.status).toBe('passed');
    expect(job.currentStage).toBe('done');
    expect(job.passedAttempt).toBe(1);
    expect(job.finalPlan?.hook).toBe(validPlan().hook);
    expect(job.attempts).toHaveLength(1);
    expect(job.attempts[0]!.review?.overall).toBe(8.5);
    expect(job.timings.map((t) => t.stage)).toEqual(['script', 'quality_gate']);
  });

  it('retry loop: fail → rewrite with critic feedback → pass', async () => {
    const feedback = 'Hook is generic; open on the queue in the rain.';
    const llm = new MockLLM({
      script: [validPlan(), validPlan({ title: 'Rewritten title' })],
      critic: [review(WEAK, feedback), review(GOOD)],
    });
    const job = await run(llm);

    expect(job.status).toBe('passed');
    expect(job.attempts).toHaveLength(2);
    expect(job.attempts[0]!.outcome).toBe('failed_quality');
    expect(job.attempts[1]!.outcome).toBe('passed');
    expect(job.attempts[1]!.rewrittenFrom).toBe(1);
    expect(job.passedAttempt).toBe(2);
    expect(job.finalPlan?.title).toBe('Rewritten title');

    // the rewrite prompt carries the critic's feedback and the previous plan
    const rewriteCall = llm.calls.filter((c) => c.kind === 'script')[1]!;
    expect(rewriteCall.req.messages[0]!.content).toContain(feedback);
    expect(rewriteCall.req.messages[0]!.content).toContain('attempt #1');
  });

  it('max-retry exhaustion: 3 failing attempts → failed', async () => {
    const llm = new MockLLM({
      script: [validPlan(), validPlan(), validPlan()],
      critic: [review(WEAK), review(WEAK), review(WEAK)],
    });
    const job = await run(llm);

    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('QUALITY_GATE_EXHAUSTED');
    expect(job.attempts).toHaveLength(3);
    expect(job.attempts.map((a) => a.rewrittenFrom)).toEqual([null, 1, 2]);
    expect(job.attempts.every((a) => a.review && a.review.pass === false)).toBe(true);
    expect(llm.count('script')).toBe(3);
    expect(job.finalPlan).toBeNull();
  });

  it('safety rejection: unsafe plan is rejected immediately and never rewritten', async () => {
    const llm = new MockLLM({ script: [validPlan(), validPlan()], critic: [review(UNSAFE, 'Invented statistic.')] });
    const job = await run(llm);

    expect(job.status).toBe('rejected');
    expect(job.error?.code).toBe('SAFETY_REJECTED');
    expect(job.attempts).toHaveLength(1);
    expect(job.attempts[0]!.outcome).toBe('failed_safety');
    expect(llm.count('script')).toBe(1);
  });

  it('safety rejection on a rewrite still stops the job', async () => {
    const llm = new MockLLM({ script: [validPlan(), validPlan()], critic: [review(WEAK), review(UNSAFE)] });
    const job = await run(llm);
    expect(job.status).toBe('rejected');
    expect(job.attempts.map((a) => a.outcome)).toEqual(['failed_quality', 'failed_safety']);
  });

  it('invalid JSON is repaired once with the Zod error', async () => {
    const llm = new MockLLM({ script: ['not json at all', validPlan()], critic: [review(GOOD)] });
    const job = await run(llm);
    expect(job.status).toBe('passed');
    expect(job.attempts[0]!.script.repairs).toBe(1);
    const repairMsg = llm.calls[1]!.req.messages.at(-1)!.content;
    expect(repairMsg).toMatch(/did not match the required JSON schema/);
  });

  it('schema failure after the repair re-ask fails the job with a clear error (no queue retry)', async () => {
    const bad = validPlan({ hashtags: ['nohash'] });
    const llm = new MockLLM({ script: [bad, bad, validPlan()], critic: [review(GOOD)] });
    const job = await run(llm);
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('LLM_OUTPUT_INVALID');
    expect(job.error?.message).toMatch(/hashtags\.0/);
    expect(llm.count('script')).toBe(2);
  });

  it('transient LLM errors are retried by the queue with backoff', async () => {
    const llm = new MockLLM({ script: [new LLMTransientError('503'), validPlan()], critic: [review(GOOD)] });
    const job = await run(llm);
    expect(job.status).toBe('passed');
    expect(job.timings.map((t) => `${t.stage}:${t.run}:${t.outcome}`)).toEqual([
      'script:1:retrying',
      'script:2:ok',
      'quality_gate:1:ok',
    ]);
  });

  it('transient errors that exhaust queue retries fail the job with LLM_UNAVAILABLE', async () => {
    const e = () => new LLMTransientError('Gemini API 503: high demand');
    const llm = new MockLLM({ script: [e(), e(), e()] });
    const job = await run(llm);
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('LLM_UNAVAILABLE');
    expect(job.timings.map((t) => t.outcome)).toEqual(['retrying', 'retrying', 'error']);
  });

  it('provider safety block rejects the job', async () => {
    const llm = new MockLLM({ script: [new LLMBlockedError('blocked (SAFETY)')] });
    const job = await run(llm);
    expect(job.status).toBe('rejected');
    expect(job.error?.code).toBe('SAFETY_BLOCKED');
  });
});

describe('pipeline records the serving model', () => {
  it('stores the primary model per stage', async () => {
    const job = await run(new MockLLM({ script: [validPlan()], critic: [review(GOOD)] }));
    expect(job.attempts[0]!.script.servedBy).toEqual({ model: 'mock-model', fallback: false });
    expect(job.attempts[0]!.review!.servedBy).toEqual({ model: 'mock-model', fallback: false });
  });

  it('stores the fallback model when it served the stage', async () => {
    const job = await run(new MockLLM({ script: [validPlan()], critic: [review(GOOD)] }, 'mock-lite'));
    expect(job.status).toBe('passed');
    expect(job.attempts[0]!.script.servedBy).toEqual({ model: 'mock-lite', fallback: true });
    expect(job.attempts[0]!.review!.servedBy).toEqual({ model: 'mock-lite', fallback: true });
  });
});
