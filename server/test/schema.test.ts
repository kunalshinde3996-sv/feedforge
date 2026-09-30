import { describe, expect, it } from 'vitest';
import { extractJson } from '../src/pipeline/llmJson.js';
import { CreateJobSchema } from '../src/schemas/job.js';
import { ScriptPlanSchema, chosenHookIndex } from '../src/schemas/plan.js';
import { CriticOutputSchema } from '../src/schemas/review.js';
import { validPlan } from './helpers.js';

const errorsFor = (input: unknown) => {
  const r = ScriptPlanSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('ScriptPlanSchema', () => {
  it('accepts a valid plan', () => {
    expect(ScriptPlanSchema.safeParse(validPlan()).success).toBe(true);
  });

  it('recomputes totalDurationSec from scenes and renumbers scene ids', () => {
    const plan = validPlan({ totalDurationSec: 999 });
    plan.scenes = plan.scenes.map((s) => ({ ...s, id: 42 }));
    const parsed = ScriptPlanSchema.parse(plan);
    expect(parsed.totalDurationSec).toBe(30);
    expect(parsed.scenes.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects total duration outside 25–45s', () => {
    const plan = validPlan();
    plan.scenes = plan.scenes.slice(0, 3); // 18s
    expect(errorsFor(plan).join()).toMatch(/totalDurationSec/);
  });

  it('rejects a hook longer than 12 words', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const plan = validPlan({ hook: long, hookOptions: [long, 'b option', 'c option'] });
    expect(errorsFor(plan).join()).toMatch(/hook: hook must be 12 words or fewer/);
  });

  it('requires exactly 3 hook options and the hook to be one of them', () => {
    expect(errorsFor(validPlan({ hookOptions: ['a', 'b'] })).join()).toMatch(/hookOptions/);
    expect(errorsFor(validPlan({ hook: 'A totally different hook' })).join()).toMatch(/one of hookOptions/);
  });

  it('validates hashtags (3–6, each starting with #)', () => {
    expect(errorsFor(validPlan({ hashtags: ['#a', '#b'] })).join()).toMatch(/hashtags/);
    expect(errorsFor(validPlan({ hashtags: ['#a', 'b', '#c'] })).join()).toMatch(/hashtags\.1/);
    expect(errorsFor(validPlan({ hashtags: ['#a', '#b', '#c', '#d', '#e', '#f', '#g'] })).join()).toMatch(/hashtags/);
  });

  it('validates scene duration (2–8s) and onScreenText (≤ 8 words)', () => {
    const plan = validPlan();
    plan.scenes[0] = { ...plan.scenes[0]!, durationSec: 9 };
    plan.scenes[1] = { ...plan.scenes[1]!, onScreenText: 'one two three four five six seven eight nine' };
    const errs = errorsFor(plan).join();
    expect(errs).toMatch(/scenes\.0\.durationSec/);
    expect(errs).toMatch(/scenes\.1\.onScreenText/);
  });

  it('chosenHookIndex finds the chosen option', () => {
    expect(chosenHookIndex(validPlan())).toBe(1);
  });
});

describe('CriticOutputSchema', () => {
  it('rejects scores outside 0–10', () => {
    expect(CriticOutputSchema.safeParse({ scores: { hook: 11, clarity: 5, pacing: 5, safety: 5 }, feedback: 'some feedback here' }).success).toBe(false);
  });
});

describe('CreateJobSchema', () => {
  it('enforces 3–200 chars after trimming', () => {
    expect(CreateJobSchema.safeParse({ topic: '  ab ' }).success).toBe(false);
    expect(CreateJobSchema.safeParse({ topic: 'x'.repeat(201) }).success).toBe(false);
    expect(CreateJobSchema.parse({ topic: '  UPI  ' }).topic).toBe('UPI');
  });
});

describe('extractJson', () => {
  it('handles fenced and prose-wrapped JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here it is: {"a":2} Hope that helps')).toEqual({ a: 2 });
  });
});
