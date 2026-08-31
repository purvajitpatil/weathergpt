/**
 * WeatherGPT — application entrypoint.
 *
 * Boots config, providers, cache, persistence, alert ingestion, the LLM
 * gateway and the WeatherGPT engine, then mounts the v1 API + frontend.
 */
import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

import { loadConfig, validateConfig } from "./src/server/config";
import { setLogLevel, logger } from "./src/server/logger";
import { db } from "./src/server/db";
import { CacheService } from "./src/server/cache";
import { createProviderRegistry } from "./src/server/providers";
import { LocationService } from "./src/server/services/locationService";
import { AlertService } from "./src/server/services/alertsService";
import { createAlertStore } from "./src/server/services/alertStore";
import { WeatherGPTEngine } from "./src/server/engine";
import { LLMGateway } from "./src/server/gateway/llmGateway";
import { GeminiProvider } from "./src/server/gateway/geminiProvider";
import { createApi } from "./src/server/api";
import { createDemoProviders } from "./src/server/providers/demo";

dotenv.config();

async function main(): Promise<void> {
  const cfg = loadConfig();
  setLogLevel(cfg.logLevel);
  for (const warning of validateConfig(cfg)) {
    logger.warn("config_warning", { detail: warning });
  }

  db.init(cfg.databaseUrl);
  await db.runMigrations();

  const registry = await createProviderRegistry(cfg);
  const cache = new CacheService(cfg.redisUrl);
  const locationService = new LocationService(cache, registry.geocoding);

  const alerts = new AlertService(createAlertStore());
  if (registry.mode === "demo") {
    const demo = createDemoProviders();
    alerts.registerSource(demo.alertSource);
    const results = await alerts.ingest();
    logger.info("Demo alert source registered", { results });
  }

  const llm = new LLMGateway(
    new GeminiProvider({ apiKey: cfg.geminiApiKey }),
    cfg.geminiModel,
    cfg.llmTimeoutMs,
    2
  );

  const engine = new WeatherGPTEngine(
    {
      cache,
      alerts,
      llm,
      config: { mlInferenceUrl: cfg.mlInferenceUrl, modelVersion: cfg.mlModelVersion },
    },
    locationService
  );

  const api = createApi({ cfg, engine, alerts, cache, llm });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Production security: trust proxy (for rate limiting behind reverse proxy)
  if (cfg.nodeEnv === "production") {
    app.set("trust proxy", 1);
  }

  // legacy liveness (kept for old probes)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.4.0" });
  });

  app.use("/api/v1", api.router);

  // frontend
  if (cfg.nodeEnv !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // periodic alert re-ingestion
  if (alerts.configuredSources.length > 0) {
    setInterval(() => {
      alerts.ingest().catch(() => undefined);
    }, 5 * 60 * 1000).unref();
  }

  app.listen(cfg.port, "0.0.0.0", () => {
    logger.info("WeatherGPT server started", {
      port: cfg.port,
      mode: registry.mode,
      demoMode: cfg.demoMode,
      apiDoc: `http://localhost:${cfg.port}/api/v1/health`,
    });
  });
}

main().catch((err) => {
  logger.error("Fatal boot error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});