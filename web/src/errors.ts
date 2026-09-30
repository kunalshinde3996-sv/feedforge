import type { JobError } from './types';

export type FriendlyError = {
  /** Plain-language message: never contains URLs, quota metric names or stack-ish text. */
  message: string;
  /** Offer the "View a sample run" shortcut (provider is out of quota). */
  suggestSample: boolean;
  /** The job can reasonably be re-run as-is. */
  retryable: boolean;
};

const MAP: Record<string, FriendlyError> = {
  LLM_QUOTA_EXHAUSTED: {
    message: "The AI provider's daily limit is used up. Try a sample run below, or come back later.",
    suggestSample: true,
    retryable: true,
  },
  LLM_UNAVAILABLE: {
    message: 'The AI provider is busy right now. Please retry in a minute.',
    suggestSample: false,
    retryable: true,
  },
  LLM_OUTPUT_INVALID: {
    message: "The AI returned a plan in the wrong format, even after being asked to fix it. Please retry.",
    suggestSample: false,
    retryable: true,
  },
  QUALITY_GATE_EXHAUSTED: {
    message: 'No plan passed the Quality Gate after 3 attempts. Try rephrasing the topic with more detail.',
    suggestSample: false,
    retryable: true,
  },
  SAFETY_REJECTED: {
    message: 'The Quality Gate rejected this plan on safety (score below 8), so it will not be published.',
    suggestSample: false,
    retryable: false,
  },
  SAFETY_BLOCKED: {
    message: "The AI provider's safety filter blocked this topic, so it will not be published.",
    suggestSample: false,
    retryable: false,
  },
  INTERRUPTED: {
    message: 'The server restarted while this job was running. Please retry.',
    suggestSample: false,
    retryable: true,
  },
};

const CONFIG_ERROR: FriendlyError = {
  message: 'The AI provider rejected the request because of a server configuration issue. Please try again later.',
  suggestSample: true,
  retryable: true,
};

export function friendlyError(err: JobError): FriendlyError {
  if (MAP[err.code]) return MAP[err.code]!;
  if (/^LLM_(AUTH|MODEL_NOT_FOUND|NOT_IMPLEMENTED|ERROR)$/.test(err.code)) return CONFIG_ERROR;
  return { message: 'Something went wrong while generating this plan. Please retry.', suggestSample: false, retryable: true };
}

/** Short, URL-free version of a raw provider error for secondary UI (e.g. timings list). */
export function sanitizeError(raw: string): string {
  const noUrls = raw.replace(/https?:\/\/\S+/g, '').replace(/\s+\*.*$/s, '');
  const firstSentence = noUrls.split(/(?<=\.)\s/)[0] ?? noUrls;
  return firstSentence.trim().replace(/[,:;]\s*$/, '');
}
