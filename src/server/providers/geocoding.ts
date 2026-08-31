/**
 * WeatherGPT — Open-Meteo geocoding provider.
 * Real geocoding via https://geocoding-api.open-meteo.com (Open-Meteo geocoding
 * database, derived from GeoNames; city-level coordinates).
 */
import type { ResolvedLocation } from "../core/models";
import { GeolocationProvider, FetchLike, providerError } from "./types";

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  timezone?: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

export interface OpenMeteoGeocodingOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class OpenMeteoGeocodingProvider implements GeolocationProvider {
  readonly id = "open-meteo-geocoding";
  readonly isDemo = false;
  private fetchImpl: FetchLike;
  private baseUrl: string;

  constructor(opts: OpenMeteoGeocodingOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://geocoding-api.open-meteo.com/v1/search";
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: controller.signal });
      if (!res.ok) {
        throw providerError(this.id, `Geocoding returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `Geocoding request timed out after ${timeoutMs}ms`, { retryable: true, cause: err });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `Geocoding request failed: ${(err as Error).message}`, { retryable: true, cause: err });
    } finally {
      clearTimeout(timer);
    }
  }

  toResolved(r: GeocodingResult): ResolvedLocation {
    return {
      name: r.name,
      district: r.admin2,
      state: r.admin1,
      country: r.country,
      countryCode: r.country_code,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
      fullLabel: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      source: this.id,
      isDemo: false,
    };
  }

  /** By necessity a greedy lookup is not needed; search returns best candidates. */
  async search(query: string, opts?: { timeoutMs?: number }): Promise<ResolvedLocation[]> {
    const timeout = opts?.timeoutMs ?? 8_000;
    const url = `${this.baseUrl}?name=${encodeURIComponent(query)}&count=5&language=hi&language=en&format=json`;
    const data = await this.getJson<GeocodingResponse>(url, timeout);
    return (data.results ?? []).slice(0, 5).map((r) => this.toResolved(r));
  }

  async reverse(lat: number, lon: number, opts?: { timeoutMs?: number }): Promise<ResolvedLocation | null> {
    const timeout = opts?.timeoutMs ?? 8_000;
    // Reverse geocoding: reuse search with "lat lon" is unreliable; use the
    // cached neighbours endpoint is not part of this API. We instead return the
    // best match from a coarse grid by searching "lat,lon" lowercase — however
    // Open-Meteo geocoding does not support reverse lookup reliably.
    // Honest implementation: return null and let caller fall back to demo/known list.
    void timeout;
    return null;
  }
}