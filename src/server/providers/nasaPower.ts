/**
 * WeatherGPT — NASA POWER provider.
 *
 * Provides historical meteorological and environmental data from NASA POWER
 * (Prediction Of Worldwide Energy Resources).
 *
 * API: https://power.larc.nasa.gov/api/
 * Docs: https://power.larc.nasa.gov/docs/
 *
 * Use cases:
 * - Historical weather data for ML training
 * - Agriculture: solar radiation, temperature, precipitation
 * - Climate analytics: long-term patterns
 *
 * License: NASA POWER data is publicly available for research and applications.
 * Attribution to NASA POWER is required.
 *
 * NOTE: This is a SECONDARY data source for historical/ML use.
 * Primary live weather comes from Open-Meteo.
 */
import type { FetchLike } from "./types";
import { providerError } from "./types";

interface PowerDailyResponse {
  features: Array<{
    geometry: { type: string; coordinates: number[] };
    properties: {
      parameter: {
        T2M?: Record<string, number>;       // Temperature at 2m
        T2M_MAX?: Record<string, number>;    // Max temperature
        T2M_MIN?: Record<string, number>;    // Min temperature
        PRECTOTCORR?: Record<string, number>; // Precipitation
        RH2M?: Record<string, number>;       // Relative humidity at 2m
        WS2M?: Record<string, number>;       // Wind speed at 2m
        ALLSKY_KT?: Record<string, number>;   // Clearness index
        GWETROOT?: Record<string, number>;   // Root zone soil wetness
        [key: string]: Record<string, number> | undefined;
      };
    };
  }>;
}

export interface NasaPowerOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface HistoricalWeatherData {
  location: { latitude: number; longitude: number };
  startDate: string;
  endDate: string;
  daily: Array<{
    date: string;
    temperatureMax?: number;
    temperatureMin?: number;
    temperatureMean?: number;
    precipitation?: number;
    humidity?: number;
    windSpeed?: number;
    soilWetness?: number;
    solarRadiation?: number;
  }>;
  source: string;
  retrievedAt: string;
}

export class NasaPowerProvider {
  readonly id = "nasa-power";
  readonly label = "NASA POWER (historical environmental data)";
  readonly isDemo = false;

  private fetchImpl: FetchLike;
  private baseUrl: string;

  constructor(opts: NasaPowerOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://power.larc.nasa.gov/api/temporal/daily/point";
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "WeatherGPT/1.0 (SIH demo; NASA POWER attribution)",
        },
      });
      if (!res.ok) {
        throw providerError(this.id, `NASA POWER returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `NASA POWER request timed out`, { retryable: true, cause: err });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `NASA POWER request failed: ${(err as Error).message}`, {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch historical daily weather data for a location.
   * NASA POWER provides data from 1981 to ~5 days ago.
   *
   * @param latitude - Location latitude
   * @param longitude - Location longitude
   * @param startDate - Start date (YYYYMMDD format)
   * @param endDate - End date (YYYYMMDD format)
   */
  async getHistoricalDaily(
    latitude: number,
    longitude: number,
    startDate: string,
    endDate: string,
    opts?: { timeoutMs?: number }
  ): Promise<HistoricalWeatherData> {
    const timeout = opts?.timeoutMs ?? 15_000;
    const parameters = [
      "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR",
      "RH2M", "WS2M", "GWETROOT", "ALLSKY_KT",
    ].join(",");

    const url =
      `${this.baseUrl}?parameters=${parameters}` +
      `&community=AG&longitude=${longitude}&latitude=${latitude}` +
      `&start=${startDate}&end=${endDate}&format=JSON`;

    const data = await this.getJson<PowerDailyResponse>(url, timeout);

    if (!data.features || data.features.length === 0) {
      return {
        location: { latitude, longitude },
        startDate,
        endDate,
        daily: [],
        source: this.label,
        retrievedAt: new Date().toISOString(),
      };
    }

    const props = data.features[0].properties.parameter;
    const dateKeys = Object.keys(props.T2M ?? {});

    const daily = dateKeys.map((dateKey) => ({
      date: this.parsePowerDate(dateKey),
      temperatureMax: props.T2M_MAX?.[dateKey],
      temperatureMin: props.T2M_MIN?.[dateKey],
      temperatureMean: props.T2M?.[dateKey],
      precipitation: props.PRECTOTCORR?.[dateKey],
      humidity: props.RH2M?.[dateKey],
      windSpeed: props.WS2M?.[dateKey],
      soilWetness: props.GWETROOT?.[dateKey],
      solarRadiation: props.ALLSKY_KT?.[dateKey],
    }));

    return {
      location: { latitude, longitude },
      startDate,
      endDate,
      daily,
      source: this.label,
      retrievedAt: new Date().toISOString(),
    };
  }

  /**
   * Get recent historical data (last N days) for ML feature engineering.
   */
  async getRecentHistory(
    latitude: number,
    longitude: number,
    days: number = 30,
    opts?: { timeoutMs?: number }
  ): Promise<HistoricalWeatherData> {
    const end = new Date();
    end.setDate(end.getDate() - 5); // NASA POWER has ~5 day delay
    const start = new Date(end);
    start.setDate(start.getDate() - days);

    const format = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

    return this.getHistoricalDaily(latitude, longitude, format(start), format(end), opts);
  }

  /**
   * Convert NASA POWER date key (YYYYMMDD) to ISO date string.
   */
  private parsePowerDate(key: string): string {
    // NASA POWER keys are like "20240115"
    if (key.length === 8) {
      return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
    }
    return key;
  }

  async health(): Promise<boolean> {
    try {
      // Quick test: Pune coordinates, last month
      const url =
        `${this.baseUrl}?parameters=T2M&community=AG` +
        `&longitude=73.8567&latitude=18.5204` +
        `&start=20240101&end=20240107&format=JSON`;
      const data = await this.getJson<PowerDailyResponse>(url, 8_000);
      return !!data.features;
    } catch {
      return false;
    }
  }
}
