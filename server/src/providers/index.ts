import type { Config } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import type { LLMProvider } from './types.js';

export function createLLMProvider(config: Config): LLMProvider {
  const model = config.LLM_MODEL;
  if (!model) throw new Error('LLM_MODEL is not set');

  switch (config.LLM_PROVIDER) {
    case 'gemini':
      if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
      return new GeminiProvider(config.GEMINI_API_KEY, model);
    case 'anthropic':
      return new AnthropicProvider(model);
    case 'openai':
      return new OpenAIProvider(model);
  }
}

export * from './types.js';
