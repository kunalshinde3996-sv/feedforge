import { LLMFatalError, type LLMProvider, type LLMRequest } from './types.js';

/** Stub — implement with the official @anthropic-ai/sdk when needed. */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  constructor(readonly model: string) {}

  async generate(_req: LLMRequest): Promise<string> {
    throw new LLMFatalError('Anthropic provider is not implemented yet — set LLM_PROVIDER=gemini', 'LLM_NOT_IMPLEMENTED');
  }
}
