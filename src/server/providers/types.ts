/**
 * WeatherGPT — Provider abstraction.
 * All external providers implement these interfaces and normalize their
 * responses into the canonical models in core/models.ts.
 */
import type {
  ResolvedLocation,
  WeatherObservation,
  WeatherForecast,
  AirQualityObservation,
} from "../core/models";

export type FetchLike = typeof fetch;

export interface ProviderCapabilities {
  current: boolean;
  forecast: boolean;
  hourly: boolean;
  historical: boolean;
  airQuality: boolean;
  alerts: boolean;
}

export interface WeatherProvider {
  id: string;
  label: string;
  isDemo: boolean;
  capabilities: ProviderCapabilities;

  getCurrent(location: ResolvedLocation, opts?: { timeoutMs?: number }): Promise<WeatherObservation>;
  getForecast(location: ResolvedLocation, opts?: { days?: number; timeoutMs?: number }): Promise<WeatherForecast>;
  getAirQuality(location: ResolvedLocation, opts?: { timeoutMs?: number }): Promise<AirQualityObservation>;
  /** optional — throws if not supported */
  getWarnings(location: ResolvedLocation, opts?: { timeoutMs?: number }): Promise<unknown>;

  health(): Promise<boolean>;
}

export interface GeolocationProvider {
  id: string;
  isDemo: boolean;
  search(query: string, opts?: { timeoutMs?: number }): Promise<ResolvedLocation[]>;
  reverse(lat: number, lon: number, opts?: { timeoutMs?: number }): Promise<ResolvedLocation | null>;
}

export interface AlertIngestionSource {
  id: string;
  label: string;
  isDemo: boolean;
  /** Official source URL when applicable; omitted for demo fixtures. */
  sourceUrl?: string;
  /** synchronous fetch of current alerts (ingestion worker may call this periodically) */
  fetchAlerts(): Promise<AlertIngestionRecord[]>;
}

export interface AlertIngestionRecord {
  sourceAlertId?: string;
  hazardType: string;
  severity: string;
  title: string;
  description: string;
  instructions?: string[];
  affectedAreas: string[];
  affectedDistricts?: string[];
  issuedAt: string;
  expiresAt: string;
  language?: string;
  geometry?: unknown;
  meta?: Record<string, unknown>;
}

export interface ProviderError extends Error {
  provider: string;
  status?: number;
  retryable: boolean;
}

export function providerError(provider: string, message: string, opts?: { status?: number; retryable?: boolean; cause?: unknown }): ProviderError {
  const err = new Error(message) as ProviderError;
  err.name = "ProviderError";
  err.provider = provider;
  err.status = opts?.status;
  err.retryable = opts?.retryable ?? true;
  if (opts?.cause) (err as { cause?: unknown }).cause = opts.cause;
  return err;
}