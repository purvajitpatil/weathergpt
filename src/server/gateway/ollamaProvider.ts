/**
 * WeatherGPT — Ollama LLM provider.
 *
 * Ollama provides a local API for running open-source LLMs.
 * API: http://localhost:11434/api
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * Use cases:
 * - Local development without external API keys
 * - Private deployment (no data leaves the server)
 * - Fallback when Gemini/OpenRouter is unavailable
 * - SIH demo showing self-hosted AI capability
 *
 * Architecture:
 *   WeatherGPT → LLMGateway → OllamaProvider → Ollama → Local model
 *
 * Supported models (recommended for weather):
 * - llama3.1 (8B) — good general quality
 * - mistral (7B) — fast, good for structured output
 * - phi3 (3.8B) — lightweight, fast inference
 */
import type { LLMProvider } from "./llmGateway";
import { LLMGatewayError } from "./llmGateway";

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  format?: "json";
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

interface OllamaTagsResponse {
  models: Array<{ name: string; size: number; modified_at: string }>;
}

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  private baseUrl: string;
  private model: string;
  private available: boolean = false;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "http://localhost:11434";
    this.model = opts.model ?? "llama3.1:8b";
    // Check availability asynchronously
    this.checkAvailability().catch(() => {
      this.available = false;
    });
  }

  private async checkAvailability(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        const data = (await res.json()) as OllamaTagsResponse;
        this.available = data.models && data.models.length > 0;
      }
    } catch {
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async generate(opts: {
    model: string;
    system: string;
    user: string;
    mimeType?: "text/plain" | "application/json";
    responseSchema?: unknown;
    timeoutMs?: number;
  }): Promise<{ text: string; model: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    if (!this.available) {
      throw new LLMGatewayError("Ollama is not available (not running or no models installed)", "provider", false);
    }

    const timeoutMs = opts.timeoutMs ?? 30_000;
    const request: OllamaGenerateRequest = {
      model: opts.model || this.model,
      prompt: opts.user,
      system: opts.system,
      stream: false,
      options: {
        temperature: 0.3, // Low temperature for factual responses
        num_predict: 1024,
      },
    };

    if (opts.mimeType === "application/json") {
      request.format = "json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new LLMGatewayError(`Ollama returned HTTP ${res.status}`, "transport", true);
      }

      const data = (await res.json()) as OllamaGenerateResponse;

      if (!data.response) {
        throw new LLMGatewayError("Ollama returned empty response", "transport", true);
      }

      return {
        text: data.response,
        model: data.model,
        usage: data.eval_count
          ? { inputTokens: 0, outputTokens: data.eval_count }
          : undefined,
      };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new LLMGatewayError(`Ollama request timed out after ${timeoutMs}ms`, "timeout", true);
      }
      if (err instanceof LLMGatewayError) throw err;
      throw new LLMGatewayError(`Ollama call failed: ${(err as Error).message}`, "transport", true);
    } finally {
      clearTimeout(timer);
    }
  }
}
