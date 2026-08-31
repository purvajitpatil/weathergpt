/**
 * WeatherGPT — Background alert ingestion worker.
 *
 * Runs periodic alert ingestion from configured sources and persists to PostgreSQL.
 * Start: npx tsx scripts/worker.ts
 */
import dotenv from "dotenv";
import { loadConfig, validateConfig } from "../src/server/config";
import { setLogLevel, logger } from "../src/server/logger";
import { db } from "../src/server/db";
import { createProviderRegistry } from "../src/server/providers";
import { AlertService } from "../src/server/services/alertsService";
import { createAlertStore } from "../src/server/services/alertStore";
import { createDemoProviders } from "../src/server/providers/demo";

dotenv.config();

const INGEST_INTERVAL_MS = Number(process.env.WORKER_INGEST_INTERVAL_MS || 5 * 60 * 1000);

async function main(): Promise<void> {
  const cfg = loadConfig();
  setLogLevel(cfg.logLevel);
  for (const warning of validateConfig(cfg)) {
    logger.warn("config_warning", { detail: warning });
  }

  db.init(cfg.databaseUrl);
  await db.runMigrations();

  const registry = await createProviderRegistry(cfg);
  const alerts = new AlertService(createAlertStore());

  if (registry.mode === "demo") {
    const demo = createDemoProviders();
    alerts.registerSource(demo.alertSource);
  }

  if (alerts.configuredSources.length === 0) {
    logger.warn("No alert sources configured — worker idle");
  }

  async function runIngestion(): Promise<void> {
    const results = await alerts.ingest();
    logger.info("Alert ingestion complete", { results, mode: registry.mode });
  }

  await runIngestion();
  setInterval(() => {
    runIngestion().catch((err) => {
      logger.error("Ingestion cycle failed", { error: err instanceof Error ? err.message : String(err) });
    });
  }, INGEST_INTERVAL_MS).unref();

  logger.info("WeatherGPT alert worker started", { intervalMs: INGEST_INTERVAL_MS, mode: registry.mode });
}

main().catch((err) => {
  logger.error("Worker fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
