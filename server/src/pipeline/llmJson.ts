import type { z } from 'zod';
import type { LLMMessage, LLMProvider } from '../providers/index.js';

/** LLM output could not be parsed/validated even after one repair re-ask. Not retryable. */
export class LLMOutputInvalidError extends Error {
  readonly retryable = false;
  readonly code = 'LLM_OUTPUT_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'LLMOutputInvalidError';
  }
}

type Result<T> = { value: T; repairs: number };

/** Strip ```json fences and surrounding prose, then JSON.parse. */
export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1]!.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

function describe(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as z.ZodError).issues)) {
    return (err as z.ZodError).issues
      .map((i) => `- ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
      .join('\n');
  }
  return `- invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * Ask the LLM for JSON matching `schema`. On parse/validation failure, re-ask ONCE with the
 * previous output and the exact Zod errors. Still invalid → LLMOutputInvalidError.
 */
export async function generateValidated<S extends z.ZodType>(
  llm: LLMProvider,
  opts: { system: string; prompt: string; schema: S; temperature?: number; label: string },
): Promise<Result<z.infer<S>>> {
  const messages: LLMMessage[] = [{ role: 'user', content: opts.prompt }];

  let lastErr: unknown;
  for (let round = 0; round < 2; round++) {
    const text = await llm.generate({ system: opts.system, messages, json: true, temperature: opts.temperature });
    try {
      const parsed = opts.schema.safeParse(extractJson(text));
      if (parsed.success) return { value: parsed.data, repairs: round };
      lastErr = parsed.error;
    } catch (e) {
      lastErr = e;
    }
    messages.push(
      { role: 'assistant', content: text },
      {
        role: 'user',
        content:
          `Your previous response did not match the required JSON schema. Fix exactly these problems and ` +
          `return the full corrected JSON object only, no commentary:\n${describe(lastErr)}`,
      },
    );
  }
  throw new LLMOutputInvalidError(`${opts.label} output invalid after 1 repair attempt:\n${describe(lastErr)}`);
}
