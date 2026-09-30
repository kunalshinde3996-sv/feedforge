import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { GeminiProvider, classify } from '../src/providers/gemini.js';
import { LLMFatalError, LLMTransientError } from '../src/providers/index.js';

const body = (code: number, message: string, quotaId?: string) =>
  JSON.stringify({
    error: {
      code,
      message,
      details: quotaId ? [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] }] : [],
    },
  });

describe('Gemini error classification', () => {
  it('daily quota 429 is fatal (no pointless retries)', () => {
    const err = classify(new ApiError({ status: 429, message: body(429, 'You exceeded your current quota', 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') }), 'm');
    expect(err).toBeInstanceOf(LLMFatalError);
    expect((err as LLMFatalError).code).toBe('LLM_QUOTA_EXHAUSTED');
  });

  it('per-minute 429 and 503 are transient (retried)', () => {
    expect(classify(new ApiError({ status: 429, message: body(429, 'Rate limited', 'GenerateRequestsPerMinutePerProjectPerModel') }), 'm')).toBeInstanceOf(LLMTransientError);
    expect(classify(new ApiError({ status: 503, message: body(503, 'high demand') }), 'm')).toBeInstanceOf(LLMTransientError);
  });

  it('404 surfaces Google\'s message with LLM_MODEL_NOT_FOUND', () => {
    const err = classify(new ApiError({ status: 404, message: body(404, 'no longer available to new users') }), 'old-model') as LLMFatalError;
    expect(err.code).toBe('LLM_MODEL_NOT_FOUND');
    expect(err.message).toContain('no longer available to new users');
  });

  it('network errors are transient', () => {
    expect(classify(new TypeError('fetch failed'), 'm')).toBeInstanceOf(LLMTransientError);
  });
});

// ---- fallback model --------------------------------------------------------

type Step = string | Error;

/** GeminiProvider with the network stubbed: scripted responses per model. */
class StubGemini extends GeminiProvider {
  readonly calls: string[] = [];
  constructor(
    private readonly script: Record<string, Step[]>,
    fallback: string | null,
  ) {
    super('test-key', 'primary-model', fallback);
  }
  protected override async callModel(model: string): Promise<string> {
    this.calls.push(model);
    const step = this.script[model]?.shift();
    if (step === undefined) throw new Error(`no scripted response for ${model}`);
    if (step instanceof Error) throw step;
    return step;
  }
}

const dailyQuota = (model: string) =>
  classify(
    new ApiError({ status: 429, message: body(429, 'You exceeded your current quota', 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') }),
    model,
  );
const overloaded = (model: string) => classify(new ApiError({ status: 503, message: body(503, 'high demand') }), model);
const req = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('Gemini fallback model', () => {
  it('primary 429 (quota) → fallback succeeds, and reports which model served it', async () => {
    const llm = new StubGemini({ 'primary-model': [dailyQuota('primary-model')], 'lite-model': ['{"ok":true}'] }, 'lite-model');
    expect(await llm.generate(req)).toEqual({ text: '{"ok":true}', model: 'lite-model', fallback: true });
    expect(llm.calls).toEqual(['primary-model', 'lite-model']);
  });

  it('primary 503 (overloaded) → fallback succeeds', async () => {
    const llm = new StubGemini({ 'primary-model': [overloaded('primary-model')], 'lite-model': ['ok'] }, 'lite-model');
    expect((await llm.generate(req)).model).toBe('lite-model');
  });

  it('both fail (quota) → LLM_QUOTA_EXHAUSTED, fallback tried exactly once', async () => {
    const llm = new StubGemini(
      { 'primary-model': [dailyQuota('primary-model')], 'lite-model': [dailyQuota('lite-model')] },
      'lite-model',
    );
    const err = await llm.generate(req).catch((e) => e);
    expect(err).toBeInstanceOf(LLMFatalError);
    expect(err.code).toBe('LLM_QUOTA_EXHAUSTED');
    expect(llm.calls).toEqual(['primary-model', 'lite-model']);
  });

  it('primary success never touches the fallback', async () => {
    const llm = new StubGemini({ 'primary-model': ['ok'] }, 'lite-model');
    expect(await llm.generate(req)).toEqual({ text: 'ok', model: 'primary-model', fallback: false });
    expect(llm.calls).toEqual(['primary-model']);
  });

  it('non-quota errors (e.g. 404) do not trigger the fallback', async () => {
    const notFound = classify(new ApiError({ status: 404, message: body(404, 'gone') }), 'primary-model');
    const llm = new StubGemini({ 'primary-model': [notFound], 'lite-model': ['ok'] }, 'lite-model');
    expect((await llm.generate(req).catch((e) => e)).code).toBe('LLM_MODEL_NOT_FOUND');
    expect(llm.calls).toEqual(['primary-model']);
  });

  it('without a fallback configured, the primary error is returned as-is', async () => {
    const llm = new StubGemini({ 'primary-model': [dailyQuota('primary-model')] }, null);
    expect((await llm.generate(req).catch((e) => e)).code).toBe('LLM_QUOTA_EXHAUSTED');
  });
});
