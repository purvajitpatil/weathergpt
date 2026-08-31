/**
 * WeatherGPT — LLM gateway.
 *
 * All LLM calls flow through here. It provides provider abstraction, timeouts,
 * retries, structured output enforcement and (crucially) makes it trivial to
 * NOT call the LLM when a deterministic answer suffices.
 */

export interface LLMProvider {
  id: string;
  isAvailable(): boolean;
  /** Generate plain text (or JSON string) content. */
  generate(opts: {
    model: string;
    system: string;
    user: string;
    mimeType?: "text/plain" | "application/json";
    responseSchema?: unknown;
    timeoutMs?: number;
  }): Promise<{ text: string; model: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
}

export class LLMGatewayError extends Error {
  constructor(
    message: string,
    public readonly phase: "timeout" | "transport" | "parse" | "schema" | "provider",
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "LLMGatewayError";
  }
}

export class LLMGateway {
  constructor(
    private provider: LLMProvider,
    private model: string,
    private defaultTimeoutMs = 30_000,
    private maxRetries = 2
  ) {}

  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  async generateStructured<T>(
    config: {
      system: string;
      user: string;
      responseSchema?: unknown;
      timeoutMs?: number;
      validate?: (raw: unknown) => T;
    }
  ): Promise<{ data: T; model: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    if (!this.provider.isAvailable()) {
      throw new LLMGatewayError("LLM provider is not configured", "provider", false);
    }
    const timeoutMs = config.timeoutMs ?? this.defaultTimeoutMs;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const resp = await this.provider.generate({
          model: this.model,
          system: config.system,
          user: config.user,
          mimeType: "application/json",
          responseSchema: config.responseSchema,
          timeoutMs,
        });
        const parsed = JSON.parse(resp.text) as unknown;
        const data = config.validate ? config.validate(parsed) : (parsed as T);
        return { data, model: resp.model, usage: resp.usage };
      } catch (err) {
        if (err instanceof LLMGatewayError && !err.retryable) throw err;
        lastErr = err as Error;
      }
    }
    throw new LLMGatewayError(`LLM generation failed after retries: ${lastErr?.message ?? "unknown"}`, "provider", true);
  }
}