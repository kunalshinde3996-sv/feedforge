import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { JobEvents } from '../src/lib/events.js';
import { Pipeline } from '../src/pipeline/runner.js';
import { CRITIC_SYSTEM, SCRIPT_SYSTEM } from '../src/pipeline/prompts.js';
import type { LLMProvider, LLMRequest, LLMResult } from '../src/providers/index.js';
import { InProcessQueue } from '../src/queue/inProcessQueue.js';
import { MemoryJobStore } from '../src/store/memoryStore.js';

type Scripted = string | object | Error;

/** Deterministic LLM: separate response queues for the Script Engine and the critic. */
export class MockLLM implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock-model';
  readonly calls: { kind: 'script' | 'critic'; req: LLMRequest }[] = [];

  constructor(
    private readonly responses: { script?: Scripted[]; critic?: Scripted[] },
    /** When set, every response reports it was served by this fallback model. */
    private readonly servedByFallback?: string,
  ) {}

  async generate(req: LLMRequest): Promise<LLMResult> {
    const kind = req.system === SCRIPT_SYSTEM ? 'script' : req.system === CRITIC_SYSTEM ? 'critic' : null;
    if (!kind) throw new Error('MockLLM: unknown system prompt');
    this.calls.push({ kind, req });
    const next = this.responses[kind]?.shift();
    if (next === undefined) throw new Error(`MockLLM: no more ${kind} responses`);
    if (next instanceof Error) throw next;
    const text = typeof next === 'string' ? next : JSON.stringify(next);
    return this.servedByFallback
      ? { text, model: this.servedByFallback, fallback: true }
      : { text, model: this.model, fallback: false };
  }

  count(kind: 'script' | 'critic') {
    return this.calls.filter((c) => c.kind === kind).length;
  }
}

export function validPlan(overrides: Record<string, unknown> = {}) {
  return {
    topic: 'Monsoon street food in Mumbai',
    hookOptions: [
      'Mumbai rain tastes better with these five bites',
      'Locals queue in the rain for this one snack',
      'Your monsoon plans are missing this street food',
    ],
    hook: 'Locals queue in the rain for this one snack',
    title: 'Monsoon Street Food in Mumbai',
    description: 'Five rainy-day bites Mumbaikars swear by. Which one is your favourite?',
    hashtags: ['#Mumbai', '#StreetFood', '#Monsoon'],
    scenes: [
      { id: 1, durationSec: 4, visualQuery: 'crowd at vada pav stall in heavy rain', onScreenText: 'The rain queue is real', voiceover: 'Locals queue in the rain for this one snack.' },
      { id: 2, durationSec: 7, visualQuery: 'vada pav frying close up', onScreenText: 'Vada pav, straight from the kadhai', voiceover: 'Hot vada pav, fresh out of the oil, is the monsoon classic.' },
      { id: 3, durationSec: 7, visualQuery: 'bhutta roasting on coals rain', onScreenText: 'Roasted bhutta with lime', voiceover: 'Then there is bhutta, roasted on coals with lime and chilli.' },
      { id: 4, durationSec: 7, visualQuery: 'cutting chai glasses steam', onScreenText: 'Cutting chai completes it', voiceover: 'Wash it all down with a steaming glass of cutting chai.' },
      { id: 5, durationSec: 5, visualQuery: 'friends laughing under umbrella eating', onScreenText: 'What is your rain snack?', voiceover: 'So what is your go-to rain snack? Tell us below.' },
    ],
    totalDurationSec: 30,
    ...overrides,
  };
}

export function review(scores: { hook: number; clarity: number; pacing: number; safety: number }, feedback = 'Tighten the hook and make scene two more specific.') {
  return { scores, feedback };
}

export const GOOD = { hook: 8, clarity: 8, pacing: 8, safety: 10 };
export const WEAK = { hook: 5, clarity: 6, pacing: 6, safety: 9 };
export const UNSAFE = { hook: 9, clarity: 9, pacing: 9, safety: 5 };

export function setup(llm: LLMProvider, opts: { rateMax?: number; pipeline?: boolean } = {}) {
  const store = new MemoryJobStore();
  const events = new JobEvents();
  const queue = new InProcessQueue({ maxRuns: 3, baseDelayMs: 1 });
  const pipeline = opts.pipeline === false ? null : new Pipeline({ store, queue, llm, events });
  const app = createApp({ store, events, pipeline, rateLimit: { max: opts.rateMax ?? 100, windowMs: 60_000 } });
  return { store, events, queue, pipeline, app };
}

export async function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
