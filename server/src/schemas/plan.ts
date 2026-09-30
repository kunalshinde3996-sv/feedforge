import { z } from 'zod';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');

export const MIN_TOTAL_SEC = 25;
export const MAX_TOTAL_SEC = 45;

export const SceneSchema = z.object({
  id: z.number().int().positive(),
  durationSec: z.number().min(2).max(8),
  visualQuery: z.string().trim().min(3),
  onScreenText: z
    .string()
    .trim()
    .min(1)
    .refine((s) => wordCount(s) <= 8, 'onScreenText must be 8 words or fewer'),
  voiceover: z.string().trim().min(3),
});

/**
 * Script Engine output contract.
 * Two normalisations happen in code before validation so the contract is always internally consistent:
 *  - scene ids are renumbered 1..n
 *  - totalDurationSec is recomputed as the sum of scene durations (then range-checked)
 */
export const ScriptPlanSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.scenes)) return obj;
    const scenes = obj.scenes.map((s, i) => (s && typeof s === 'object' ? { ...s, id: i + 1 } : s));
    const total = scenes.reduce(
      (sum: number, s) => sum + (s && typeof s === 'object' && typeof (s as any).durationSec === 'number' ? (s as any).durationSec : 0),
      0,
    );
    return { ...obj, scenes, totalDurationSec: Math.round(total * 10) / 10 };
  },
  z
    .object({
      topic: z.string().trim().min(1),
      hookOptions: z.array(z.string().trim().min(1)).length(3),
      hook: z
        .string()
        .trim()
        .min(1)
        .refine((s) => wordCount(s) <= 12, 'hook must be 12 words or fewer'),
      title: z.string().trim().min(3).max(100),
      description: z.string().trim().min(10).max(500),
      hashtags: z
        .array(z.string().trim().regex(/^#[\p{L}\p{N}_]+$/u, 'each hashtag must start with # and contain no spaces'))
        .min(3)
        .max(6),
      scenes: z.array(SceneSchema).min(3).max(12),
      totalDurationSec: z
        .number()
        .min(MIN_TOTAL_SEC, `sum of scene durations must be at least ${MIN_TOTAL_SEC}s`)
        .max(MAX_TOTAL_SEC, `sum of scene durations must be at most ${MAX_TOTAL_SEC}s`),
    })
    .refine((p) => p.hookOptions.some((o) => norm(o) === norm(p.hook)), {
      message: 'hook must be exactly one of hookOptions',
      path: ['hook'],
    }),
);

export type ScriptPlan = z.infer<typeof ScriptPlanSchema>;
export type Scene = z.infer<typeof SceneSchema>;

/** Index of the hook option that was chosen (-1 if none matches). */
export function chosenHookIndex(plan: Pick<ScriptPlan, 'hook' | 'hookOptions'>): number {
  return plan.hookOptions.findIndex((o) => norm(o) === norm(plan.hook));
}
