/**
 * WeatherGPT — Alert ingestion & querying.
 *
 * Pipeline: external source → ingestion → schema validation → normalization →
 * deduplication → store → query-time expiry filter → location matching.
 *
 * IMPORTANT: WeatherGPT does not declare official warnings. It consumes
 * authoritative/trusted warnings and converts them into usable information.
 * If no official source is configured, we say so — we never invent a warning.
 */
import type { Alert, HazardType, Severity, ResolvedLocation } from "../core/models";
import type { AlertIngestionSource, AlertIngestionRecord } from "../providers/types";
import { logger } from "../logger";
import { providerError } from "../providers/types";
import { createAlertStore, type AlertStore } from "./alertStore";

const SEVERITIES: Severity[] = ["green", "yellow", "orange", "red"];
const HAZARDS = new Set<string>([
  "heavy_rain", "thunderstorm", "cyclone", "flood", "extreme_heat",
  "cold_wave", "lightning", "strong_wind", "fog", "other",
]);

function normalizeSeverity(raw: string): Severity | null {
  const s = raw.toLowerCase().trim();
  if (SEVERITIES.includes(s as Severity)) return s as Severity;
  if ((s as string) === "critical") return "red";
  if ((s as string) === "warning" || (s as string) === "moderate") return "orange";
  if ((s as string) === "advisory" || (s as string) === "info") return "yellow";
  return null;
}

function normalizeHazard(raw: string): HazardType {
  const s = raw.toLowerCase().trim();
  if (HAZARDS.has(s)) return s as HazardType;
  if (s.includes("rain")) return "heavy_rain";
  if (s.includes("thunder") || s.includes("storm")) return "thunderstorm";
  if (s.includes("cyclone")) return "cyclone";
  if (s.includes("flood")) return "flood";
  if (s.includes("heat") || s.includes("hot")) return "extreme_heat";
  if (s.includes("cold")) return "cold_wave";
  if (s.includes("lightning")) return "lightning";
  if (s.includes("wind")) return "strong_wind";
  if (s.includes("fog")) return "fog";
  return "other";
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateAlertRecord(rec: AlertIngestionRecord): ValidationResult {
  const errors: string[] = [];
  if (!rec.title) errors.push("title is required");
  if (!rec.description) errors.push("description is required");
  if (!normalizeSeverity(rec.severity)) errors.push(`invalid severity: ${rec.severity}`);
  if (isNaN(Date.parse(rec.issuedAt))) errors.push(`invalid issuedAt: ${rec.issuedAt}`);
  if (isNaN(Date.parse(rec.expiresAt))) errors.push(`invalid expiresAt: ${rec.expiresAt}`);
  if ((rec.affectedAreas ?? []).length === 0) errors.push("affectedAreas must be non-empty");
  return { ok: errors.length === 0, errors };
}

export type { AlertStore } from "./alertStore";
export { InMemoryAlertStore, createAlertStore } from "./alertStore";

interface AlertSourceConfig {
  source: AlertIngestionSource;
  store: AlertStore;
}

export class AlertService {
  private sources: AlertSourceConfig[] = [];
  private lastIngestion: Map<string, string> = new Map(); // sourceId -> ISO time
  private store: AlertStore;

  constructor(store?: AlertStore) {
    this.store = store ?? createAlertStore();
  }

  registerSource(source: AlertIngestionSource): void {
    this.sources.push({ source, store: this.store });
  }

  get configuredSources() {
    return this.sources.map((s) => ({ id: s.source.id, label: s.source.label, isDemo: s.source.isDemo }));
  }

  get lastIngestionTimes() {
    const out: Record<string, string> = {};
    for (const [k, v] of this.lastIngestion) out[k] = v;
    return out;
  }

  /** Run ingestion for one source. Returns { ingested, rejected } counts. */
  async ingest(sourceId?: string): Promise<{ source: string; ingested: number; rejected: number }[]> {
    const results: { source: string; ingested: number; rejected: number }[] = [];
    const target = sourceId ? this.sources.filter((s) => s.source.id === sourceId) : this.sources;
    for (const cfg of target) {
      const { source, store } = cfg;
      try {
        const records = await source.fetchAlerts();
        let ingested = 0;
        let rejected = 0;
        const seen = new Set<string>();
        const now = new Date();
        for (const rec of records) {
          const validation = validateAlertRecord(rec);
          if (!validation.ok) {
            rejected += 1;
            logger.warn("Rejected malformed alert record", { source: source.id, errors: validation.errors });
            continue;
          }
          const dedupKey = rec.sourceAlertId ?? `${rec.title}|${rec.issuedAt}`;
          if (seen.has(dedupKey)) {
            rejected += 1;
            continue;
          }
          seen.add(dedupKey);

          const severity = normalizeSeverity(rec.severity)!;
          const expiresAt = new Date(rec.expiresAt);
          const alert: Alert = {
            id: dedupKey,
            source: source.label,
            sourceAlertId: rec.sourceAlertId,
            hazardType: normalizeHazard(rec.hazardType),
            severity,
            title: rec.title,
            description: rec.description,
            instructions: rec.instructions,
            geometry: rec.geometry,
            affectedAreas: rec.affectedAreas,
            affectedDistricts: rec.affectedDistricts,
            issuedAt: new Date(rec.issuedAt).toISOString(),
            expiresAt: expiresAt.toISOString(),
            language: rec.language ?? "en",
            isActive: expiresAt.getTime() > now.getTime(),
            provenance: {
              provider: source.id,
              sourceLabel: source.label,
              sourceUrl: source.isDemo ? undefined : source.sourceUrl,
              retrievedAt: now.toISOString(),
              validFrom: new Date(rec.issuedAt).toISOString(),
              validUntil: expiresAt.toISOString(),
              isDemo: source.isDemo,
            },
            createdAt: now.toISOString(),
          };
          await store.upsert(alert);
          ingested += 1;
        }
        this.lastIngestion.set(source.id, now.toISOString());
        results.push({ source: source.id, ingested, rejected });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Alert ingestion failed", { source: source.id, error: message });
        results.push({ source: source.id, ingested: 0, rejected: 0 });
      }
    }
    return results;
  }

  /** Active alerts matching a resolved location (area/district containment). */
  async getActiveForLocation(location: ResolvedLocation): Promise<Alert[]> {
    const now = Date.now();
    const all = await this.store.findActive();
    if (all.length === 0) return [];

    const name = location.name.toLowerCase();
    const state = (location.state ?? "").toLowerCase();
    const district = (location.district ?? "").toLowerCase();
    const full = location.fullLabel.toLowerCase();

    const matches = all.filter((a) => {
      if (!a.isActive || Date.parse(a.expiresAt) <= now || Date.parse(a.issuedAt) > now) return false;
      const areas = (a.affectedAreas ?? []).map((x) => x.toLowerCase());
      const districts = (a.affectedDistricts ?? []).map((x) => x.toLowerCase());
      return (
        areas.some((x) => name.includes(x) || x.includes(name) || full.includes(x) || x.includes(full)) ||
        districts.some((x) => name.includes(x) || x.includes(name) || state.includes(x) || x.includes(district) || full.includes(x))
      );
    });
    // deterministic ordering: strongest severity first, then soonest expiry
    const rank: Record<Severity, number> = { red: 0, orange: 1, yellow: 2, green: 3 };
    return matches.sort((a, b) => {
      const bySeverity = rank[a.severity] - rank[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
    });
  }

  /** All active alerts (unfiltered). */
  async getAllActive(): Promise<Alert[]> {
    return this.store.findActive();
  }

  /** Honest answer when no official source is configured. */
  get officialWarningsConfigured(): boolean {
    return this.sources.some((s) => !s.source.isDemo);
  }
}

/** Normalize a raw (possibly demo) alert into an Alert used by risk engine. */
export function alertSeverityRank(s: Severity | undefined): number {
  return s ? SEVERITIES.indexOf(s) : SEVERITIES.indexOf("green");
}

export { normalizeSeverity, normalizeHazard };

export async function createAlertServiceWithDemo(): Promise<AlertService> {
  const svc = new AlertService();
  const { createDemoProviders } = await import("../providers/demo");
  const providers = createDemoProviders();
  svc.registerSource(providers.alertSource);
  await svc.ingest();
  return svc;
}

export { providerError };