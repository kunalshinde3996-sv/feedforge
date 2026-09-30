import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Job } from '../src/schemas/job.js';
import { MemoryJobStore } from '../src/store/memoryStore.js';
import { seedSampleRuns } from '../src/store/seed.js';
import { validPlan } from './helpers.js';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../examples');

function dirWith(files: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ff-ex-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), JSON.stringify(content));
  return dir;
}

const job = (id: string, status: Job['status'], extra: Partial<Job> | Record<string, unknown> = {}) =>
  ({
    id,
    status,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:01:00.000Z',
    input: { topic: 'Monsoon street food in Mumbai' },
    llm: { provider: 'gemini', model: 'm' },
    currentStage: 'done',
    attempts: [],
    finalPlan: status === 'passed' ? validPlan() : null,
    passedAttempt: status === 'passed' ? 1 : null,
    timings: [],
    error: null,
    ...extra,
  }) as Job;

describe('seedSampleRuns', () => {
  it('seeds the real /examples runs into an empty store, flagged as samples', async () => {
    const store = new MemoryJobStore();
    expect(await seedSampleRuns(store, examples)).toBeGreaterThanOrEqual(2);
    const jobs = await store.list();
    expect(jobs.every((j) => j.sample === true && j.status === 'passed' && j.finalPlan)).toBe(true);
  });

  it('does nothing when the store already has a passed job', async () => {
    const store = new MemoryJobStore();
    await store.create(job('11111111-1111-4111-8111-111111111111', 'passed'));
    expect(await seedSampleRuns(store, examples)).toBe(0);
  });

  it('still seeds when the store only has failed jobs', async () => {
    const store = new MemoryJobStore();
    await store.create(job('22222222-2222-4222-8222-222222222222', 'failed'));
    expect(await seedSampleRuns(store, examples)).toBeGreaterThanOrEqual(2);
  });

  it('skips non-passed, malformed and invalid-plan files; tolerates a missing dir', async () => {
    const dir = dirWith({
      'ok.json': job('33333333-3333-4333-8333-333333333333', 'passed'),
      'failed.json': job('44444444-4444-4444-8444-444444444444', 'failed'),
      'badplan.json': job('55555555-5555-4555-8555-555555555555', 'passed', { finalPlan: { nope: true } }),
    });
    writeFileSync(path.join(dir, 'garbage.json'), '{not json');
    expect(await seedSampleRuns(new MemoryJobStore(), dir)).toBe(1);
    expect(await seedSampleRuns(new MemoryJobStore(), path.join(dir, 'missing'))).toBe(0);
  });
});
