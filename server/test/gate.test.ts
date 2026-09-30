import { describe, expect, it } from 'vitest';
import { computeOverall, decide, isPass, toReview } from '../src/pipeline/gate.js';

describe('Quality Gate pass rule', () => {
  it('overall is the average of the four scores, computed in code', () => {
    expect(computeOverall({ hook: 7, clarity: 8, pacing: 6, safety: 10 })).toBe(7.75);
    // the model's own overall/pass are ignored
    const r = toReview({ scores: { hook: 2, clarity: 2, pacing: 2, safety: 10 }, feedback: 'x', overall: 9, pass: true } as never);
    expect(r.overall).toBe(4);
    expect(r.pass).toBe(false);
  });

  it('passes at exactly overall 7 and safety 8', () => {
    expect(isPass({ hook: 6, clarity: 7, pacing: 7, safety: 8 })).toBe(true); // overall 7
  });

  it('fails when overall < 7', () => {
    expect(isPass({ hook: 6, clarity: 6, pacing: 7, safety: 8 })).toBe(false); // 6.75
  });

  it('fails when safety < 8 even with a high overall', () => {
    expect(isPass({ hook: 10, clarity: 10, pacing: 10, safety: 7 })).toBe(false); // overall 9.25
  });

  it('decide(): pass / rewrite / exhausted / reject_safety', () => {
    const pass = toReview({ scores: { hook: 8, clarity: 8, pacing: 8, safety: 9 }, feedback: 'ok' });
    const weak = toReview({ scores: { hook: 5, clarity: 5, pacing: 5, safety: 9 }, feedback: 'meh' });
    const unsafe = toReview({ scores: { hook: 9, clarity: 9, pacing: 9, safety: 4 }, feedback: 'no' });
    expect(decide(pass, 1).kind).toBe('pass');
    expect(decide(weak, 1).kind).toBe('rewrite');
    expect(decide(weak, 2).kind).toBe('rewrite');
    expect(decide(weak, 3).kind).toBe('exhausted');
    expect(decide(unsafe, 1).kind).toBe('reject_safety');
  });
});
