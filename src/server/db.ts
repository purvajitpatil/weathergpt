/**
 * WeatherGPT — PostgreSQL persistence layer.
 *
 * Connects if DATABASE_URL is configured; otherwise the app degrades to
 * stateless operation (documented in /health and /ready). Fail fast in
 * production (DEMO_MODE=off) via validateConfig().
 */
import { Pool, PoolClient, type QueryResult } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

class Database {
  private pool: Pool | null = null;

  init(connectionString?: string): void {
    if (!connectionString) {
      logger.info("No DATABASE_URL configured — running stateless (no persistence)");
      return;
    }
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 4_000,
    });
    this.pool.on("error", (err) => {
      logger.error("PostgreSQL pool error", { error: err.message });
    });
    logger.info("PostgreSQL pool configured");
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  async query<T extends QueryResult = QueryResult>(text: string, params?: unknown[]): Promise<T> {
    if (!this.pool) throw new Error("Database unavailable: DATABASE_URL not configured");
    return this.pool.query<T>(text, params) as Promise<T>;
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    if (!this.pool) return { ok: false, detail: "not_configured" };
    try {
      const res = await this.pool.query("SELECT 1 AS ok");
      return { ok: (res.rows[0] as { ok: number }).ok === 1, detail: "ok" };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async runMigrations(): Promise<string[]> {
    if (!this.pool) return [];
    const applied: string[] = [];
    try {
      const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        )`
      );
      for (const file of files) {
        const { rowCount } = await this.pool.query<{ filename: string }>(
          `SELECT filename FROM schema_migrations WHERE filename = $1`,
          [file]
        );
        if ((rowCount ?? 0) > 0) continue;
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
        const client: PoolClient = await this.pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
          await client.query("COMMIT");
          applied.push(file);
          logger.info("Applied migration", { migration: file });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }
    } catch (err) {
      logger.warn("Migration run incomplete", { error: (err as Error).message });
    }
    return applied;
  }
}

export const db = new Database();

// ─── Persistence helpers (used by services, best-effort) ────────────────────

export class Persistence {
  constructor(private database: Database) {}

  async saveWeatherSnapshot(obs: {
    location: string;
    tempC?: number;
    humidity?: number;
    windKmh?: number;
    aqi?: number;
    source: string;
    raw: unknown;
  }): Promise<void> {
    if (!this.database.isConnected()) return;
    try {
      await this.database.query(
        `INSERT INTO weather_snapshots (city, temp_celsius, humidity_percent, wind_speed_kmh, aqi_value, source, raw_api_response, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [obs.location, obs.tempC ?? null, obs.humidity ?? null, obs.windKmh ?? null, obs.aqi ?? null, obs.source, JSON.stringify(obs.raw)]
      );
    } catch (err) {
      logger.warn("Failed to persist weather snapshot", { error: (err as Error).message });
    }
  }

  async savePrediction(rec: {
    location: string;
    modelVersion: string;
    riskScore: number;
    riskLevel: string;
    factors: unknown;
    features: unknown;
  }): Promise<void> {
    if (!this.database.isConnected()) return;
    try {
      await this.database.query(
        `INSERT INTO ml_predictions (location, model_version, risk_score, risk_level, contributing_factors, input_features, predicted_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [rec.location, rec.modelVersion, rec.riskScore, rec.riskLevel, JSON.stringify(rec.factors), JSON.stringify(rec.features)]
      );
    } catch (err) {
      logger.warn("Failed to persist prediction", { error: (err as Error).message });
    }
  }
}

export const persistence = new Persistence(db);