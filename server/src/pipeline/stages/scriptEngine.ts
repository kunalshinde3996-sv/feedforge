import type { LLMProvider } from '../../providers/index.js';
import { ScriptPlanSchema, type ScriptPlan } from '../../schemas/plan.js';
import type { Review } from '../../schemas/review.js';
import { generateValidated } from '../llmJson.js';
import { SCRIPT_SYSTEM, rewritePrompt, scriptPrompt } from '../prompts.js';

export type ScriptInput = {
  topic: string;
  /** Present when rewriting a plan that failed the Quality Gate. */
  previous?: { plan: ScriptPlan; review: Review; attempt: number };
};

export async function runScriptEngine(llm: LLMProvider, input: ScriptInput) {
  const prompt = input.previous
    ? rewritePrompt(input.topic, input.previous.plan, input.previous.review, input.previous.attempt)
    : scriptPrompt(input.topic);

  const { value, repairs } = await generateValidated(llm, {
    system: SCRIPT_SYSTEM,
    prompt,
    schema: ScriptPlanSchema,
    temperature: 0.8,
    label: 'Script Engine',
  });
  // topic is the user's input, not the model's paraphrase
  return { plan: { ...value, topic: input.topic }, repairs };
}
