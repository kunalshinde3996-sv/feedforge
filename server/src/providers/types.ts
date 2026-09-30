export type LLMMessage = { role: 'user' | 'assistant'; content: string };

export type LLMRequest = {
  system: string;
  messages: LLMMessage[];
  /** Ask the provider for a JSON-only response when it supports it. */
  json?: boolean;
  temperature?: number;
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate(req: LLMRequest): Promise<string>;
}

/** Transient failure (rate limit, 5xx, network, timeout) — the queue may retry the stage. */
export class LLMTransientError extends Error {
  readonly retryable = true;
  readonly code = 'LLM_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'LLMTransientError';
  }
}

/** Permanent failure (bad key, unknown model, bad request) — retrying will not help. */
export class LLMFatalError extends Error {
  readonly retryable = false;
  constructor(
    message: string,
    readonly code = 'LLM_ERROR',
  ) {
    super(message);
    this.name = 'LLMFatalError';
  }
}

/** Provider-side safety block — the job is rejected, not failed. */
export class LLMBlockedError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'LLMBlockedError';
  }
}
