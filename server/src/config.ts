import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load repo-root .env if present (works from both src/ and dist/). In Docker/Render, env comes from the platform.
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(here, '../../.env'));
} catch {
  // no .env file — rely on process env
}

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const ConfigSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATA_DIR: z.string().default('./data'),
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Config = z.infer<typeof ConfigSchema>;

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Config = parsed.data;
