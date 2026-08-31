/**
 * WeatherGPT — Gemini LLM provider.
 */
import { GoogleGenAI } from "@google/genai";
import type { LLMProvider } from "./llmGateway";
import { LLMGatewayError } from "./llmGateway";

export interface GeminiOptions {
  apiKey?: string;
  httpHeaders?: Record<string, string>;
}

export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  private client: GoogleGenAI | null = null;

  constructor(opts: GeminiOptions = {}) {
    if (!opts.apiKey) return;
    try {
      this.client = new GoogleGenAI({
        apiKey: opts.apiKey,
        httpOptions: {
          headers: opts.httpHeaders ?? { "User-Agent": "weathergpt-sih" },
        },
      });
    } catch {
      this.client = null;
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generate(opts: {
    model: string;
    system: string;
    user: string;
    mimeType?: "text/plain" | "application/json";
    responseSchema?: unknown;
    timeoutMs?: number;
  }): Promise<{ text: string; model: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    if (!this.client) {
      throw new LLMGatewayError("Gemini provider not initialized (missing GEMINI_API_KEY)", "provider", false);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

    try {
      const config: Record<string, unknown> = {};
      if (opts.system) config.systemInstruction = opts.system;
      if (opts.mimeType === "application/json") {
        config.responseMimeType = "application/json";
        if (opts.responseSchema) config.responseSchema = opts.responseSchema;
      }

      const resp = await this.client.models.generateContent({
        model: opts.model,
        contents: opts.user,
        config,
      });

      const text = resp.text ?? "";
      if (!text) {
        throw new LLMGatewayError("Gemini returned an empty response", "transport", true);
      }
      // strip markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const usage = resp.usageMetadata
        ? {
            inputTokens: resp.usageMetadata.promptTokenCount ?? undefined,
            outputTokens: resp.usageMetadata.candidatesTokenCount ?? undefined,
          }
        : undefined;
      return { text: cleaned, model: opts.model, usage };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new LLMGatewayError(`Gemini request timed out after ${opts.timeoutMs ?? 30_000}ms`, "timeout", true);
      }
      if (err instanceof LLMGatewayError) throw err;
      throw new LLMGatewayError(`Gemini call failed: ${(err as Error).message}`, "transport", true);
    } finally {
      clearTimeout(timer);
    }
  }
}