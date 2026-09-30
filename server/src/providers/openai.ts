import { LLMFatalError, type LLMProvider, type LLMRequest } from './types.js';

/** Stub — implement with the official openai SDK when needed. */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  constructor(readonly model: string) {}

  async generate(_req: LLMRequest): Promise<string> {
    throw new LLMFatalError('OpenAI provider is not implemented yet — set LLM_PROVIDER=gemini', 'LLM_NOT_IMPLEMENTED');
  }
}
