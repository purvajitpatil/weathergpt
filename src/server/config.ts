/**
 * WeatherGPT — configuration & environment validation.
 *
 * Fails fast for critical misconfiguration, degrades gracefully elsewhere.
 */

export type NodeEnv = "development" | "test" | "production";
export type DemoMode = "on" | "off" | "auto";

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  demoMode: DemoMode;
  databaseUrl?: string;
  redisUrl?: string;
  geminiApiKey?: string;
  geminiModel: string;
  mlInferenceUrl?: string;
  mlModelVersion: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxPerWindow: number;
  cacheTtlSeconds: {
    current: number;
    forecast: number;
    aqi: number;
    geo: number;
    alerts: number;
  };
  requestTimeoutMs: number;
  llmTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_ML_VERSION = "xgb-rain-v1.2";

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoModeRaw = (env.WEATHERGPT_DEMO_MODE || env.DEMO_MODE || "auto").toLowerCase();

  let demoMode: DemoMode = "auto";
  if (demoModeRaw === "on" || demoModeRaw === "true") demoMode = "on";
  else if (demoModeRaw === "off" || demoModeRaw === "false") demoMode = "off";

  const databaseUrl = env.DATABASE_URL || undefined;
  const redisUrl = env.REDIS_URL || undefined;
  const geminiApiKey = env.GEMINI_API_KEY || undefined;
  const mlInferenceUrl = env.ML_INFERENCE_URL || undefined;

  const config: AppConfig = {
    nodeEnv: (env.NODE_ENV as NodeEnv) || "development",
    port: Number(env.PORT || 3000),
    demoMode,
    databaseUrl,
    redisUrl,
    geminiApiKey,
    geminiModel: env.GEMINI_MODEL || "gemini-2.5-flash",
    mlInferenceUrl,
    mlModelVersion: env.ML_MODEL_VERSION || DEFAULT_ML_VERSION,
    corsOrigins: parseList(env.CORS_ORIGINS, []),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000),
    rateLimitMaxPerWindow: Number(env.RATE_LIMIT_MAX_REQUESTS || 60),
    cacheTtlSeconds: {
      current: Number(env.CACHE_TTL_CURRENT_S || 300),
      forecast: Number(env.CACHE_TTL_FORECAST_S || 900),
      aqi: Number(env.CACHE_TTL_AQI_S || 1800),
      geo: Number(env.CACHE_TTL_GEO_S || 86_400),
      alerts: Number(env.CACHE_TTL_ALERTS_S || 300),
    },
    requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS || 20_000),
    llmTimeoutMs: Number(env.LLM_TIMEOUT_MS || 30_000),
    logLevel: (env.LOG_LEVEL as AppConfig["logLevel"]) || "info",
  };

  return config;
}

/**
 * Startup validation. Returns warnings (non-fatal) and throws on critical
 * misconfiguration so we fail fast where it matters.
 */
export function validateConfig(cfg: AppConfig): string[] {
  const warnings: string[] = [];

  if (!cfg.geminiApiKey) {
    warnings.push(
      "GEMINI_API_KEY is not set. AI explanation features will be unavailable; " +
      "the system will operate in deterministic mode (real data, no LLM)."
    );
  }

  if (cfg.demoMode === "off" && !cfg.databaseUrl) {
    throw new Error("DEMO_MODE=off requires DATABASE_URL to be configured. Failing fast.");
  }

  if (cfg.demoMode === "off" && !cfg.redisUrl) {
    throw new Error("DEMO_MODE=off requires REDIS_URL to be configured. Failing fast.");
  }

  if (cfg.port < 1 || cfg.port > 65535) {
    throw new Error(`Invalid PORT: ${cfg.port}`);
  }

  if (cfg.rateLimitMaxPerWindow < 1) {
    throw new Error("RATE_LIMIT_MAX_REQUESTS must be >= 1");
  }

  return warnings;
}