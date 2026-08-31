/**
 * WeatherGPT — Open-Meteo Elevation API provider.
 *
 * Provides elevation data from coordinates using the Open-Meteo Elevation API.
 * Elevation matters because the same rainfall doesn't produce the same risk
 * everywhere — low-lying areas near rivers face higher flood risk.
 *
 * API: https://open-meteo.com/en/docs/elevation-api
 *
 * Architecture:
 *   Rainfall + Elevation + River proximity + Location → Flood Risk
 *
 * License: CC-BY 4.0 (attribution to Open-Meteo required)
 */
import type { ResolvedLocation } from "../core/models";
import { providerError, type FetchLike } from "./types";

interface ElevationResponse {
  elevation: number[];
}

export interface ElevationData {
  latitude: number;
  longitude: number;
  elevation: number; // meters above sea level
}

export interface ElevationApiOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class ElevationApiProvider {
  readonly id = "open-meteo-elevation";
  readonly label = "Open-Meteo Elevation API";

  private fetchImpl: FetchLike;
  private baseUrl: string;

  constructor(opts: ElevationApiOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://api.open-meteo.com/v1/elevation";
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
        throw providerError(this.id, `Elevation API returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `Elevation API timed out`, { retryable: true, cause: err });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `Elevation API failed: ${(err as Error).message}`, {
        retryable: true, cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Get elevation for one or more coordinates.
   */
  async getElevation(
    locations: Array<{ latitude: number; longitude: number }>,
    opts?: { timeoutMs?: number }
  ): Promise<ElevationData[]> {
    const timeout = opts?.timeoutMs ?? 5_000;
    const lats = locations.map((l) => l.latitude).join(",");
    const lons = locations.map((l) => l.longitude).join(",");

    const url = `${this.baseUrl}?latitude=${lats}&longitude=${lons}`;
    const data = await this.getJson<ElevationResponse>(url, timeout);

    return locations.map((loc, i) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      elevation: data.elevation[i] ?? 0,
    }));
  }

  /**
   * Get elevation for a single resolved location.
   */
  async getForLocation(
    location: ResolvedLocation,
    opts?: { timeoutMs?: number }
  ): Promise<number> {
    const results = await this.getElevation(
      [{ latitude: location.latitude, longitude: location.longitude }],
      opts
    );
    return results[0]?.elevation ?? 0;
  }

  /**
   * Classify terrain based on elevation.
   */
  static classifyTerrain(elevationMeters: number): {
    category: "lowland" | "plain" | "plateau" | "hilly" | "mountainous";
    floodRiskModifier: number; // -0.2 to +0.2 adjustment
  } {
    if (elevationMeters < 100) {
      return { category: "lowland", floodRiskModifier: 0.15 }; // lowlands: higher flood risk
    }
    if (elevationMeters < 300) {
      return { category: "plain", floodRiskModifier: 0.05 };
    }
    if (elevationMeters < 750) {
      return { category: "plateau", floodRiskModifier: -0.05 };
    }
    if (elevationMeters < 2000) {
      return { category: "hilly", floodRiskModifier: -0.1 };
    }
    return { category: "mountainous", floodRiskModifier: -0.2 }; // mountains: lower flood risk
  }

  async health(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}?latitude=18.5204&longitude=73.8567`;
      const data = await this.getJson<ElevationResponse>(url, 5_000);
      return Array.isArray(data.elevation) && data.elevation.length > 0;
    } catch {
      return false;
    }
  }
}
