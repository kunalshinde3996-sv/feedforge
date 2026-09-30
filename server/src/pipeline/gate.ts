import type { CriticOutput, Review, Scores } from '../schemas/review.js';

/** Quality Gate rules — enforced here in code, never trusted from the model. */
export const GATE = {
  PASS_OVERALL: 7,
  MIN_SAFETY: 8,
  MAX_ATTEMPTS: 3, // 1 original + 2 rewrites
} as const;

export function computeOverall(s: Scores): number {
  const avg = (s.hook + s.clarity + s.pacing + s.safety) / 4;
  return Math.round(avg * 100) / 100;
}

export function isSafe(s: Scores): boolean {
  return s.safety >= GATE.MIN_SAFETY;
}

export function isPass(s: Scores): boolean {
  return computeOverall(s) >= GATE.PASS_OVERALL && isSafe(s);
}

export function toReview(c: CriticOutput): Review {
  return { scores: c.scores, overall: computeOverall(c.scores), pass: isPass(c.scores), feedback: c.feedback };
}

export type GateDecision =
  | { kind: 'pass' }
  | { kind: 'reject_safety' }
  | { kind: 'rewrite' }
  | { kind: 'exhausted' };

/** What happens after attempt `attemptN` received `review`. */
export function decide(review: Review, attemptN: number): GateDecision {
  if (!isSafe(review.scores)) return { kind: 'reject_safety' };
  if (review.pass) return { kind: 'pass' };
  if (attemptN < GATE.MAX_ATTEMPTS) return { kind: 'rewrite' };
  return { kind: 'exhausted' };
}
