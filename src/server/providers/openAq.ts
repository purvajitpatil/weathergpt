/**
 * WeatherGPT — OpenAQ provider.
 *
 * Provides ground-level air quality measurements from sensor stations worldwide.
 * API: https://api.openaq.org/v3/
 *
 * IMPORTANT: OpenAQ provides physical measurements from sensors.
 * Do NOT blindly treat its measurements as an official AQI number.
 * We normalize to our canonical AirQualityObservation model.
 *
 * License: Data is aggregated from multiple sources; users must comply with
 * third-party terms. Attribution required.
 */
import type {
  ResolvedLocation,
  AirQualityObservation,
  Provenance,
} from "../core/models";
import { providerError, type FetchLike } from "./types";

interface OpenAqMeasurement {
  date: { utc: string; local: string };
  parameter: string;
  value: number;
  unit: string;
  coordinates: { latitude: number; longitude: number };
  location: string;
  city?: string;
  country?: string;
  sourceName: string;
  averagingPeriod: { value: number; unit: string };
}

interface OpenAqResponse {
  meta: { name: string; license: string; website: string };
  results: OpenAqMeasurement[];
}

export interface OpenAqOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
}

export class OpenAqProvider {
  readonly id = "openaq";
  readonly label = "OpenAQ (ground-level sensor measurements)";
  readonly isDemo = false;

  private fetchImpl: FetchLike;
  private baseUrl: string;
  private apiKey?: string;

  constructor(opts: OpenAqOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://api.openaq.org/v3";
    this.apiKey = opts.apiKey;
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        headers,
      });
      if (!res.ok) {
        throw providerError(this.id, `OpenAQ returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `OpenAQ request timed out after ${timeoutMs}ms`, {
          retryable: true,
          cause: err,
        });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `OpenAQ request failed: ${(err as Error).message}`, {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Get latest air quality measurements near a location.
   * Returns a normalized AirQualityObservation compatible with our canonical model.
   */
  async getNearbyMeasurements(
    location: ResolvedLocation,
    opts?: { radiusKm?: number; timeoutMs?: number }
  ): Promise<AirQualityObservation | null> {
    const radius = opts?.radiusKm ?? 25;
    const timeout = opts?.timeoutMs ?? 10_000;

    // OpenAQ v3: search for measurements near coordinates
    const url =
      `${this.baseUrl}/measurements?coordinates=${location.latitude},${location.longitude}` +
      `&radius=${radius}&limit=100&order=desc&sort=desc`;

    try {
      const data = await this.getJson<OpenAqResponse>(url, timeout);
      if (!data.results || data.results.length === 0) return null;

      // Aggregate measurements by parameter
      const params = new Map<string, number[]>();
      for (const m of data.results) {
        if (m.value < 0) continue; // skip invalid
        const existing = params.get(m.parameter) ?? [];
        existing.push(m.value);
        params.set(m.parameter, existing);
      }

      // Average values per parameter
      const avg = (values: number[]): number =>
        values.length > 0
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
          : 0;

      const pm25 = avg(params.get("pm25") ?? []);
      const pm10 = avg(params.get("pm10") ?? []);
      const no2 = avg(params.get("no2") ?? []);
      const o3 = avg(params.get("o3") ?? []);
      const co = avg(params.get("co") ?? []);
      const so2 = avg(params.get("so2") ?? []);

      // Calculate US AQI from PM2.5 (simplified EPA breakpoint calculation)
      const usAqi = this.pm25ToAqi(pm25);

      const now = new Date();
      const provenance: Provenance = {
        provider: this.id,
        sourceLabel: this.label,
        sourceUrl: "https://openaq.org/",
        retrievedAt: now.toISOString(),
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 60 * 60_000).toISOString(), // 1h validity
        dataVersion: "openaq-v3",
        isDemo: false,
      };

      return {
        location,
        timestamp: data.results[0]?.date?.utc ?? now.toISOString(),
        usAqi,
        pm25,
        pm10,
        no2,
        o3,
        co,
        so2,
        provenance,
      };
    } catch (err) {
      if ((err as { name?: string }).name === "ProviderError") throw err;
      // OpenAQ may not have data for all locations — return null gracefully
      return null;
    }
  }

  /**
   * US AQI calculation from PM2.5 using EPA breakpoints.
   * Simplified version — for production, use full breakpoint tables.
   */
  private pm25ToAqi(pm25: number): number {
    if (pm25 <= 0) return 0;
    // EPA breakpoint pairs: [ConcLow, ConcHigh, AqiLow, AqiHigh]
    const breakpoints: [number, number, number, number][] = [
      [0.0, 12.0, 0, 50],
      [12.1, 35.4, 51, 100],
      [35.5, 55.4, 101, 150],
      [55.5, 150.4, 151, 200],
      [150.5, 250.4, 201, 300],
      [250.5, 350.4, 301, 400],
      [350.5, 500.4, 401, 500],
    ];
    for (const [cLow, cHigh, aqiLow, aqiHigh] of breakpoints) {
      if (pm25 >= cLow && pm25 <= cHigh) {
        return Math.round(((aqiHigh - aqiLow) / (cHigh - cLow)) * (pm25 - cLow) + aqiLow);
      }
    }
    return pm25 > 500.4 ? 500 : 0;
  }

  async health(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/countries?limit=1`;
      const data = await this.getJson<{ meta: unknown }>(url, 5_000);
      return !!data.meta;
    } catch {
      return false;
    }
  }
}
