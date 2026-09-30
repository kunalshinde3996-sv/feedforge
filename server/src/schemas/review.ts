import { z } from 'zod';

const score = z.number().min(0).max(10);

/** What the critic LLM must return. overall/pass are NOT trusted from the model — computed in code. */
export const CriticOutputSchema = z.object({
  scores: z.object({
    hook: score,
    clarity: score,
    pacing: score,
    safety: score,
  }),
  feedback: z.string().trim().min(10),
});

export type CriticOutput = z.infer<typeof CriticOutputSchema>;
export type Scores = CriticOutput['scores'];

export type Review = {
  scores: Scores;
  overall: number;
  pass: boolean;
  feedback: string;
};
