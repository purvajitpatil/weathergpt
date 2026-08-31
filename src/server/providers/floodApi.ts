/**
 * WeatherGPT — Open-Meteo Flood API provider.
 *
 * Provides flood-related data from GloFAS (Global Flood Awareness System)
 * and other global hydrological datasets.
 *
 * API: https://open-meteo.com/en/docs/flood-api
 *
 * Use cases:
 * - River discharge forecasts
 * - Flood risk assessment
 * - Combined with rainfall + elevation for disaster intelligence
 *
 * Architecture:
 *   Rainfall (Open-Meteo Forecast)
 *   + River discharge (Flood API)
 *   + Elevation (Elevation API)
 *   + Location
 *   → Flood Risk
 *
 * License: CC-BY 4.0 (attribution to Open-Meteo required)
 */
import type { ResolvedLocation, Provenance } from "../core/models";
import { providerError, type FetchLike } from "./types";

interface FloodDailyResponse {
  time: string[];
  river_discharge?: number[];
  river_discharge_mean?: number[];
  river_discharge_max?: number[];
  river_discharge_min?: number[];
}

interface FloodResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  daily?: FloodDailyResponse;
}

export interface FloodData {
  location: ResolvedLocation;
  generatedAt: string;
  daily: Array<{
    date: string;
    riverDischarge?: number;       // m³/s
    riverDischargeMean?: number;
    riverDischargeMax?: number;
    riverDischargeMin?: number;
  }>;
  floodRisk: {
    level: "low" | "moderate" | "high" | "extreme";
    score: number; // 0-100
    dischargeThreshold: number; // m³/s threshold used
    reasoning: string[];
  };
  provenance: Provenance;
}

export interface FloodApiOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class FloodApiProvider {
  readonly id = "open-meteo-flood";
  readonly label = "Open-Meteo Flood API (GloFAS)";
  readonly isDemo = false;

  private fetchImpl: FetchLike;
  private baseUrl: string;

  constructor(opts: FloodApiOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://flood-api.open-meteo.com/v1/flood";
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": "WeatherGPT/1.0 (SIH demo; https://open-meteo.com)" },
      });
      if (!res.ok) {
        throw providerError(this.id, `Flood API returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `Flood API timed out`, { retryable: true, cause: err });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `Flood API failed: ${(err as Error).message}`, {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Get flood/river discharge data for a location.
   * Returns daily river discharge forecasts and flood risk assessment.
   */
  async getFloodData(
    location: ResolvedLocation,
    opts?: { days?: number; timeoutMs?: number }
  ): Promise<FloodData | null> {
    const days = Math.min(16, Math.max(1, opts?.days ?? 7));
    const timeout = opts?.timeoutMs ?? 10_000;

    const url =
      `${this.baseUrl}?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&daily=river_discharge,river_discharge_mean,river_discharge_max,river_discharge_min` +
      `&past_days=3&forecast_days=${days}`;

    try {
      const data = await this.getJson<FloodResponse>(url, timeout);
      if (!data.daily) return null;

      const daily = (data.daily.time ?? []).map((t, i) => ({
        date: t,
        riverDischarge: data.daily!.river_discharge?.[i],
        riverDischargeMean: data.daily!.river_discharge_mean?.[i],
        riverDischargeMax: data.daily!.river_discharge_max?.[i],
        riverDischargeMin: data.daily!.river_discharge_min?.[i],
      }));

      // Assess flood risk based on discharge patterns
      const floodRisk = this.assessFloodRisk(daily);

      const now = new Date();
      const provenance: Provenance = {
        provider: this.id,
        sourceLabel: this.label,
        sourceUrl: "https://open-meteo.com/en/docs/flood-api",
        retrievedAt: now.toISOString(),
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 6 * 3600_000).toISOString(), // 6h
        dataVersion: "glofas-v3",
        isDemo: false,
      };

      return {
        location,
        generatedAt: now.toISOString(),
        daily,
        floodRisk,
        provenance,
      };
    } catch {
      // Flood data may not be available for all locations (e.g., inland non-river areas)
      return null;
    }
  }

  /**
   * Assess flood risk from river discharge data.
   * Uses relative thresholds based on mean discharge patterns.
   */
  private assessFloodRisk(
    daily: FloodData["daily"]
  ): FloodData["floodRisk"] {
    const discharges = daily
      .map((d) => d.riverDischargeMean ?? d.riverDischarge ?? 0)
      .filter((d) => d > 0);

    if (discharges.length === 0) {
      return {
        level: "low",
        score: 0,
        dischargeThreshold: 0,
        reasoning: ["No river discharge data available for this location."],
      };
    }

    const maxDischarge = Math.max(...discharges);
    const meanDischarge = discharges.reduce((a, b) => a + b, 0) / discharges.length;
    const threshold = meanDischarge * 2; // 2x mean = elevated risk

    const reasoning: string[] = [];
    let score = 0;
    let level: "low" | "moderate" | "high" | "extreme" = "low";

    if (maxDischarge > threshold * 2) {
      level = "extreme";
      score = 90;
      reasoning.push(`Peak discharge (${Math.round(maxDischarge)} m³/s) exceeds 4x mean flow.`);
      reasoning.push("Immediate flood risk — avoid low-lying areas near rivers.");
    } else if (maxDischarge > threshold * 1.5) {
      level = "high";
      score = 70;
      reasoning.push(`Peak discharge (${Math.round(maxDischarge)} m³/s) exceeds 3x mean flow.`);
      reasoning.push("Elevated flood risk — monitor river levels closely.");
    } else if (maxDischarge > threshold) {
      level = "moderate";
      score = 45;
      reasoning.push(`Peak discharge (${Math.round(maxDischarge)} m³/s) exceeds 2x mean flow.`);
      reasoning.push("Moderate flood risk — stay informed about river conditions.");
    } else {
      level = "low";
      score = 15;
      reasoning.push(`River discharge within normal range (mean: ${Math.round(meanDischarge)} m³/s).`);
    }

    return { level, score, dischargeThreshold: threshold, reasoning };
  }

  async health(): Promise<boolean> {
    try {
      // Test with Pune coordinates
      const url =
        `${this.baseUrl}?latitude=18.5204&longitude=73.8567` +
        `&daily=river_discharge&past_days=1&forecast_days=1`;
      const data = await this.getJson<FloodResponse>(url, 6_000);
      return !!data.daily;
    } catch {
      return false;
    }
  }
}
