/**
 * WeatherGPT — Open-Meteo provider (real weather data).
 *
 * Data source: https://open-meteo.com/  (authoritative open weather data
 * derived from GFS, ICON, ECMWF-IFS (HRES+ENS), ERA5 and CAMS-AIR).
 * No API key required. Data is licensed for free use with attribution
 * (CC-BY 4.0). This is a REAL data source — it is NOT IMD.
 */
import type {
  ResolvedLocation,
  WeatherObservation,
  WeatherForecast,
  HourlyForecastPoint,
  DailyForecastPoint,
  AirQualityObservation,
  Provenance,
} from "../core/models";
import { WeatherProvider, FetchLike, providerError } from "./types";

const WMO_CODES = new Map<number, string>([
  [0, "Clear"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Depositing rime fog"],
  [51, "Light drizzle"],
  [53, "Drizzle"],
  [55, "Dense drizzle"],
  [56, "Freezing drizzle"],
  [57, "Dense freezing drizzle"],
  [61, "Light rain"],
  [63, "Rain"],
  [65, "Heavy rain"],
  [66, "Freezing rain"],
  [67, "Heavy freezing rain"],
  [71, "Slight snow"],
  [73, "Snow"],
  [75, "Heavy snow"],
  [77, "Snow grains"],
  [80, "Light rain showers"],
  [81, "Rain showers"],
  [82, "Violent rain showers"],
  [85, "Snow showers"],
  [86, "Heavy snow showers"],
  [95, "Thunderstorm"],
  [96, "Thunderstorm with light hail"],
  [99, "Thunderstorm with heavy hail"],
]);

export function wmoText(code: number | undefined): string {
  if (code === undefined || code === null) return "";
  return WMO_CODES.get(Math.round(code)) ?? `Weather code ${code}`;
}

const CURRENT_FIELDS = [
  "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
  "precipitation", "rain", "showers", "snowfall", "weather_code",
  "cloud_cover", "pressure_msl", "surface_pressure", "wind_speed_10m",
  "wind_direction_10m", "wind_gusts_10m",
].join(",");

const HOURLY_FIELDS = [
  "temperature_2m", "relative_humidity_2m", "precipitation_probability",
  "precipitation", "weather_code", "cloud_cover", "wind_speed_10m",
  "wind_direction_10m", "visibility",
].join(",");

const DAILY_FIELDS = [
  "weather_code", "temperature_2m_max", "temperature_2m_min", "sunrise",
  "sunset", "precipitation_probability_max", "precipitation_sum",
  "wind_speed_10m_max", "uv_index_max",
].join(",");

const AQI_CURRENT_FIELDS = "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide";

interface HourlyResponse {
  time: string[];
  temperature_2m?: number[];
  relative_humidity_2m?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
  weather_code?: number[];
  cloud_cover?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  visibility?: number[];
}

interface DailyResponse {
  time: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  sunrise?: string[];
  sunset?: string[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  wind_speed_10m_max?: number[];
  uv_index_max?: number[];
}

interface CurrentResponse {
  time: string;
  interval: number;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weather_code: number;
  cloud_cover: number;
  pressure_msl?: number;
  surface_pressure?: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m?: number;
}

interface ForecastResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  current?: CurrentResponse;
  current_units?: Record<string, string>;
  hourly?: HourlyResponse;
  daily?: DailyResponse;
}

interface AQICurrentResponse {
  time: string;
  us_aqi?: number;
  pm2_5?: number;
  pm10?: number;
  nitrogen_dioxide?: number;
  ozone?: number;
  carbon_monoxide?: number;
  sulphur_dioxide?: number;
}

interface AQIResponse {
  latitude: number;
  longitude: number;
  current?: AQICurrentResponse;
}

export interface OpenMeteoOptions {
  forecastBaseUrl?: string;
  airQualityBaseUrl?: string;
  defaultDays?: number;
  fetchImpl?: FetchLike;
}

export class OpenMeteoProvider implements WeatherProvider {
  readonly id = "open-meteo";
  readonly label = "Open-Meteo (GFS/ICON/ECMWF+ERA5 based)";
  readonly isDemo = false;
  readonly capabilities = {
    current: true,
    forecast: true,
    hourly: true,
    historical: true,
    airQuality: true,
    alerts: false,
  } as const;

  private fetchImpl: FetchLike;
  private forecastBaseUrl: string;
  private airQualityBaseUrl: string;
  private defaultDays: number;

  constructor(opts: OpenMeteoOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.forecastBaseUrl = opts.forecastBaseUrl ?? "https://api.open-meteo.com/v1/forecast";
    this.airQualityBaseUrl = opts.airQualityBaseUrl ?? "https://air-quality-api.open-meteo.com/v1/air-quality";
    this.defaultDays = opts.defaultDays ?? 3;
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
        throw providerError(this.id, `Open-Meteo returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `Open-Meteo request timed out after ${timeoutMs}ms`, {
          retryable: true,
          cause: err,
        });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `Open-Meteo request failed: ${(err as Error).message}`, {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private provenance(location: ResolvedLocation, validForMinutes: number): Provenance {
    const now = new Date();
    return {
      provider: this.id,
      sourceLabel: this.label,
      sourceUrl: "https://open-meteo.com/",
      retrievedAt: now.toISOString(),
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + validForMinutes * 60_000).toISOString(),
      dataVersion: "open-meteo-v1",
      isDemo: false,
    };
  }

  async getCurrent(location: ResolvedLocation, opts?: { timeoutMs?: number }): Promise<WeatherObservation> {
    const timeout = opts?.timeoutMs ?? 10_000;
    const url = `${this.forecastBaseUrl}?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=${CURRENT_FIELDS}&timezone=${encodeURIComponent(location.timezone ?? "auto")}` +
      `&forecast_days=1`;
    const data = await this.getJson<ForecastResponse>(url, timeout);
    if (!data.current) {
      throw providerError(this.id, "Open-Meteo response missing 'current' block", { retryable: false });
    }
    const c = data.current;
    const now = new Date();
    return {
      location,
      timestamp: c.time ?? now.toISOString(),
      temperatureC: c.temperature_2m,
      feelsLikeC: c.apparent_temperature,
      humidityPercent: c.relative_humidity_2m,
      pressureHpa: c.pressure_msl ?? c.surface_pressure,
      windSpeedKmh: c.wind_speed_10m,
      windDirectionDeg: c.wind_direction_10m,
      windGustKmh: c.wind_gusts_10m,
      precipitationMm: c.precipitation,
      cloudCoverPercent: c.cloud_cover,
      weatherCode: c.weather_code,
      weatherText: wmoText(c.weather_code),
      isDay: c.is_day === 1,
      provenance: this.provenance(location, 60),
    };
  }

  async getForecast(location: ResolvedLocation, opts?: { days?: number; timeoutMs?: number }): Promise<WeatherForecast> {
    const days = Math.min(7, Math.max(1, opts?.days ?? this.defaultDays));
    const timeout = opts?.timeoutMs ?? 12_000;
    const url = `${this.forecastBaseUrl}?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=${CURRENT_FIELDS}&hourly=${HOURLY_FIELDS}&daily=${DAILY_FIELDS}` +
      `&timezone=${encodeURIComponent(location.timezone ?? "auto")}&forecast_days=${days}`;
    const data = await this.getJson<ForecastResponse>(url, timeout);

    const hourly: HourlyForecastPoint[] = (data.hourly?.time ?? []).map((t, i) => ({
      time: t,
      temperatureC: data.hourly?.temperature_2m?.[i],
      humidityPercent: data.hourly?.relative_humidity_2m?.[i],
      precipitationProbability: data.hourly?.precipitation_probability?.[i],
      precipitationMm: data.hourly?.precipitation?.[i],
      weatherCode: data.hourly?.weather_code?.[i],
      weatherText: wmoText(data.hourly?.weather_code?.[i]),
      cloudCoverPercent: data.hourly?.cloud_cover?.[i],
      windSpeedKmh: data.hourly?.wind_speed_10m?.[i],
      windDirectionDeg: data.hourly?.wind_direction_10m?.[i],
    }));

    const daily: DailyForecastPoint[] = (data.daily?.time ?? []).map((t, i) => ({
      date: t,
      weatherCode: data.daily?.weather_code?.[i],
      weatherText: wmoText(data.daily?.weather_code?.[i]),
      tempMaxC: data.daily?.temperature_2m_max?.[i],
      tempMinC: data.daily?.temperature_2m_min?.[i],
      sunrise: data.daily?.sunrise?.[i],
      sunset: data.daily?.sunset?.[i],
      precipitationProbabilityMax: data.daily?.precipitation_probability_max?.[i],
      precipitationSumMm: data.daily?.precipitation_sum?.[i],
      windSpeedMaxKmh: data.daily?.wind_speed_10m_max?.[i],
      uvIndexMax: data.daily?.uv_index_max?.[i],
    }));

    const validUntil = hourly.length ? hourly[hourly.length - 1].time : new Date().toISOString();

    return {
      location,
      generatedAt: new Date().toISOString(),
      hourly,
      daily,
      provenance: {
        ...this.provenance(location, 60),
        provider: this.id,
        sourceLabel: this.label,
        validUntil,
        dataVersion: `open-meteo-forecast-${days}d`,
      },
    };
  }

  async getAirQuality(location: ResolvedLocation, opts?: { timeoutMs?: number }): Promise<AirQualityObservation> {
    const timeout = opts?.timeoutMs ?? 10_000;
    const url = `${this.airQualityBaseUrl}?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=${AQI_CURRENT_FIELDS}`;
    const data = await this.getJson<AQIResponse>(url, timeout);
    if (!data.current) {
      throw providerError(this.id, "Open-Meteo AQI response missing 'current' block", { retryable: false });
    }
    const c = data.current;
    return {
      location,
      timestamp: c.time ?? new Date().toISOString(),
      usAqi: c.us_aqi,
      pm25: c.pm2_5,
      pm10: c.pm10,
      no2: c.nitrogen_dioxide,
      o3: c.ozone,
      co: c.carbon_monoxide,
      so2: c.sulphur_dioxide,
      provenance: {
        ...this.provenance(location, 120),
        provider: this.id,
        sourceLabel: "Open-Meteo Air Quality (CAMS-AIR)",
        sourceUrl: "https://open-meteo.com/en/docs/air-quality-api",
        dataVersion: "cams-air-v1",
      },
    };
  }

  getWarnings(): Promise<unknown> {
    // Open-Meteo does not provide IMD/NDMA alerts. Honest: not supported.
    return Promise.reject(providerError(this.id, "Open-Meteo does not provide official IMD/NDMA weather warnings.", {
      retryable: false,
    }));
  }

  async health(): Promise<boolean> {
    try {
      const url = `${this.forecastBaseUrl}?latitude=18.5204&longitude=73.8567&current=temperature_2m&forecast_days=1`;
      const data = await this.getJson<ForecastResponse>(url, 6_000);
      return typeof data?.current?.temperature_2m === "number";
    } catch {
      return false;
    }
  }
}