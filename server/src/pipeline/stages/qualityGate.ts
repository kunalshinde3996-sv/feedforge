import type { LLMProvider } from '../../providers/index.js';
import type { ScriptPlan } from '../../schemas/plan.js';
import { CriticOutputSchema } from '../../schemas/review.js';
import { toReview } from '../gate.js';
import { generateValidated } from '../llmJson.js';
import { CRITIC_SYSTEM, criticPrompt } from '../prompts.js';

export async function runQualityGate(llm: LLMProvider, plan: ScriptPlan) {
  const { value, repairs, model, fallback } = await generateValidated(llm, {
    system: CRITIC_SYSTEM,
    prompt: criticPrompt(plan),
    schema: CriticOutputSchema,
    temperature: 0.2,
    label: 'Quality Gate',
  });
  return { review: toReview(value), repairs, servedBy: { model, fallback } };
}
