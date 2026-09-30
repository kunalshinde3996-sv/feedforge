import { ApiError, GoogleGenAI } from '@google/genai';
import {
  LLMBlockedError,
  LLMFatalError,
  LLMTransientError,
  type LLMProvider,
  type LLMRequest,
} from './types.js';

const TIMEOUT_MS = 60_000;

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(req: LLMRequest): Promise<string> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
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
      throw classify(err, this.model);
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
      return new LLMFatalError(`Gemini daily quota exhausted for "${model}": ${short(apiMessage(err))}`, 'LLM_QUOTA_EXHAUSTED');
    }
    if (s === 429 || s >= 500) return new LLMTransientError(`Gemini API ${s}: ${short(apiMessage(err))}`);
    if (s === 404) {
      return new LLMFatalError(`Gemini model "${model}" is not available (404): ${short(apiMessage(err))}`, 'LLM_MODEL_NOT_FOUND');
    }
    if (s === 401 || s === 403) return new LLMFatalError(`Gemini rejected the API key (${s})`, 'LLM_AUTH');
    return new LLMFatalError(`Gemini API ${s}: ${short(apiMessage(err))}`);
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
