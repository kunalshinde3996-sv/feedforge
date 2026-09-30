export type LLMMessage = { role: 'user' | 'assistant'; content: string };

export type LLMRequest = {
  system: string;
  messages: LLMMessage[];
  /** Ask the provider for a JSON-only response when it supports it. */
  json?: boolean;
  temperature?: number;
};

/** The response text plus which model actually served it (primary or fallback). */
export type LLMResult = { text: string; model: string; fallback: boolean };

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** Used once per call when the primary model is rate-limited or overloaded. */
  readonly fallbackModel?: string | null;
  generate(req: LLMRequest): Promise<LLMResult>;
}

/** Transient failure (rate limit, 5xx, network, timeout) — the queue may retry the stage. */
export class LLMTransientError extends Error {
  readonly retryable = true;
  readonly code = 'LLM_UNAVAILABLE';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LLMTransientError';
  }
}

/** Permanent failure (bad key, unknown model, bad request, daily quota) — retrying will not help. */
export class LLMFatalError extends Error {
  readonly retryable = false;
  constructor(
    message: string,
    readonly code = 'LLM_ERROR',
    readonly status?: number,
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
