/**
 * WeatherGPT — Alert storage backends (in-memory and PostgreSQL).
 */
import type { Alert } from "../core/models";
import { db } from "../db";
import { logger } from "../logger";

export interface AlertStore {
  upsert(alert: Alert): Promise<void>;
  findActive(): Promise<Alert[]>;
  findById(id: string): Promise<Alert | null>;
}

export class InMemoryAlertStore implements AlertStore {
  private alerts = new Map<string, Alert>();

  async upsert(alert: Alert): Promise<void> {
    this.alerts.set(alert.id, alert);
  }

  async findActive(): Promise<Alert[]> {
    const now = Date.now();
    return [...this.alerts.values()].filter(
      (a) => a.isActive && Date.parse(a.expiresAt) > now && Date.parse(a.issuedAt) <= now
    );
  }

  async findById(id: string): Promise<Alert | null> {
    return this.alerts.get(id) ?? null;
  }
}

function rowToAlert(row: Record<string, unknown>): Alert {
  const provenance = (row.provenance as Alert["provenance"]) ?? {
    provider: String(row.source),
    sourceLabel: String(row.source),
    retrievedAt: String(row.created_at),
    validFrom: String(row.issued_at),
    validUntil: String(row.expires_at),
    isDemo: Boolean(row.is_demo),
  };
  return {
    id: String(row.external_id ?? row.id),
    source: String(row.source),
    sourceAlertId: row.external_id ? String(row.external_id) : undefined,
    hazardType: (row.hazard_type as Alert["hazardType"]) ?? "other",
    severity: row.severity as Alert["severity"],
    title: String(row.title),
    description: String(row.description ?? ""),
    instructions: (row.instructions as string[]) ?? [],
    geometry: row.geometry,
    affectedAreas: (row.affected_areas as string[]) ?? [],
    affectedDistricts: (row.affected_districts as string[]) ?? [],
    issuedAt: new Date(String(row.issued_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    language: String(row.language ?? "en"),
    isActive: Boolean(row.is_active),
    provenance,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export class PostgresAlertStore implements AlertStore {
  async upsert(alert: Alert): Promise<void> {
    if (!db.isConnected()) return;
    try {
      await db.query(
        `INSERT INTO warnings (
          external_id, source, hazard_type, severity, title, description,
          instructions, geometry, affected_areas, affected_districts,
          issued_at, expires_at, language, is_active, provenance, is_demo, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          instructions = EXCLUDED.instructions,
          affected_areas = EXCLUDED.affected_areas,
          affected_districts = EXCLUDED.affected_districts,
          expires_at = EXCLUDED.expires_at,
          is_active = EXCLUDED.is_active,
          provenance = EXCLUDED.provenance,
          updated_at = NOW()`,
        [
          alert.id,
          alert.source,
          alert.hazardType,
          alert.severity,
          alert.title,
          alert.description,
          JSON.stringify(alert.instructions ?? []),
          alert.geometry ? JSON.stringify(alert.geometry) : null,
          JSON.stringify(alert.affectedAreas ?? []),
          JSON.stringify(alert.affectedDistricts ?? []),
          alert.issuedAt,
          alert.expiresAt,
          alert.language,
          alert.isActive,
          JSON.stringify(alert.provenance),
          alert.provenance.isDemo,
        ]
      );
    } catch (err) {
      logger.warn("Failed to persist alert", { error: (err as Error).message, alertId: alert.id });
    }
  }

  async findActive(): Promise<Alert[]> {
    if (!db.isConnected()) return [];
    const now = new Date().toISOString();
    const res = await db.query(
      `SELECT * FROM warnings
       WHERE is_active = true AND expires_at > $1 AND issued_at <= $1
       ORDER BY CASE severity WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END`,
      [now]
    );
    return (res.rows as Record<string, unknown>[]).map(rowToAlert);
  }

  async findById(id: string): Promise<Alert | null> {
    if (!db.isConnected()) return null;
    const res = await db.query(
      `SELECT * FROM warnings WHERE external_id = $1 OR id::text = $1 LIMIT 1`,
      [id]
    );
    if (!res.rows[0]) return null;
    return rowToAlert(res.rows[0] as Record<string, unknown>);
  }
}

export function createAlertStore(): AlertStore {
  if (db.isConnected()) return new PostgresAlertStore();
  return new InMemoryAlertStore();
}
