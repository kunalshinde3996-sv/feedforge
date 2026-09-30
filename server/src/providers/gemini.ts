import { ApiError, GoogleGenAI } from '@google/genai';
import { logger } from '../lib/logger.js';
import {
  LLMBlockedError,
  LLMFatalError,
  LLMTransientError,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
} from './types.js';

const TIMEOUT_MS = 60_000;

/** Quota (429) or overloaded (503) — the cases where a different model can still answer. */
export function shouldFallback(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 429 || status === 503;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    readonly fallbackModel: string | null = null,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(req: LLMRequest): Promise<LLMResult> {
    try {
      return { text: await this.callModel(this.model, req), model: this.model, fallback: false };
    } catch (err) {
      if (!this.fallbackModel || !shouldFallback(err)) throw err;
      logger.warn('primary model unavailable, trying fallback once', {
        model: this.model,
        fallbackModel: this.fallbackModel,
        status: (err as { status?: number }).status,
      });
      // If the fallback fails too, its (classified) error is what the stage sees.
      return { text: await this.callModel(this.fallbackModel, req), model: this.fallbackModel, fallback: true };
    }
  }

  /** One generateContent call; throws classified LLM errors. Protected so tests can stub the network. */
  protected async callModel(model: string, req: LLMRequest): Promise<string> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model,
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction: req.system,
          temperature: req.temperature,
          responseMimeType: req.json ? 'application/json' : undefined,
          httpOptions: { timeout: TIMEOUT_MS },
        },
      });
    } catch (err) {
      throw classify(err, model);
    }

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) throw new LLMBlockedError(`Gemini blocked the prompt (${blockReason})`);

    const finish = response.candidates?.[0]?.finishReason;
    const text = response.text;
    if (!text) {
      if (finish && /SAFETY|BLOCKLIST|PROHIBITED|SPII/.test(String(finish))) {
        throw new LLMBlockedError(`Gemini blocked the response (${finish})`);
      }
      throw new LLMTransientError(`Gemini returned an empty response (finishReason: ${finish ?? 'unknown'})`);
    }
    return text;
  }
}

export function classify(err: unknown, model: string): Error {
  if (err instanceof ApiError) {
    const s = err.status;
    // A daily quota won't recover within the retry window — fail fast with a clear code.
    if (s === 429 && /PerDay/i.test(err.message)) {
      return new LLMFatalError(`Gemini daily quota exhausted for "${model}": ${short(apiMessage(err))}`, 'LLM_QUOTA_EXHAUSTED', s);
    }
    if (s === 429 || s >= 500) return new LLMTransientError(`Gemini API ${s} (${model}): ${short(apiMessage(err))}`, s);
    if (s === 404) {
      return new LLMFatalError(`Gemini model "${model}" is not available (404): ${short(apiMessage(err))}`, 'LLM_MODEL_NOT_FOUND', s);
    }
    if (s === 401 || s === 403) return new LLMFatalError(`Gemini rejected the API key (${s})`, 'LLM_AUTH', s);
    return new LLMFatalError(`Gemini API ${s}: ${short(apiMessage(err))}`, 'LLM_ERROR', s);
  }
  // network errors, timeouts, aborts
  return new LLMTransientError(`Gemini request failed: ${short(err instanceof Error ? err.message : String(err))}`);
}

/** ApiError.message is the raw JSON body; pull out Google's human-readable message. */
function apiMessage(err: ApiError): string {
  try {
    return JSON.parse(err.message)?.error?.message ?? err.message;
  } catch {
    return err.message;
  }
}

const short = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);
