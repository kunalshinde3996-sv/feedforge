import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { classify } from '../src/providers/gemini.js';
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
