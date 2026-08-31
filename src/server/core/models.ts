/**
 * WeatherGPT — Canonical data models (core).
 *
 * These types are the "source of truth" contract shared by providers,
 * engines, the evidence layer, the LLM gateway and the API.
 * Provider-specific structures must NEVER leak past the provider boundary.
 */

// ─── Location ────────────────────────────────────────────────────────────────

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface ResolvedLocation {
  name: string;
  district?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  /** e.g. "Pune, Maharashtra, India" */
  fullLabel: string;
  /** where this resolution came from: "open-meteo-geocoding" | "demo" | "user-supplied" */
  source: string;
  /** true when the coordinate data itself is deterministic fixture data */
  isDemo: boolean;
}

// ─── Provenance ──────────────────────────────────────────────────────────────
// Every fact worth trusting must be attributable.

export interface Provenance {
  /** technical identifier, e.g. "open-meteo" | "demo" */
  provider: string;
  /** human-readable source label, e.g. "Open-Meteo (GFS/ICON based)" */
  sourceLabel: string;
  sourceUrl?: string;
  sourceId?: string;
  /** when the data was fetched by us */
  retrievedAt: string;
  /** the moment the data begins to be valid */
  validFrom: string;
  /** when the data expires (must be respected by callers) */
  validUntil?: string;
  dataVersion?: string;
  /** true ⇒ this is deterministic fixture data, not real observations */
  isDemo: boolean;
}

// ─── Weather ─────────────────────────────────────────────────────────────────

export interface WeatherObservation {
  location: ResolvedLocation;
  timestamp: string;
  temperatureC?: number;
  feelsLikeC?: number;
  humidityPercent?: number;
  pressureHpa?: number;
  windSpeedKmh?: number;
  windDirectionDeg?: number;
  windGustKmh?: number;
  precipitationMm?: number;
  precipitationProbability?: number;
  visibilityKm?: number;
  cloudCoverPercent?: number;
  uvIndex?: number;
  weatherCode?: number;
  weatherText?: string;
  isDay?: boolean;
  provenance: Provenance;
}

export interface HourlyForecastPoint {
  time: string;
  temperatureC?: number;
  humidityPercent?: number;
  precipitationProbability?: number;
  precipitationMm?: number;
  weatherCode?: number;
  weatherText?: string;
  cloudCoverPercent?: number;
  windSpeedKmh?: number;
  windDirectionDeg?: number;
}

export interface DailyForecastPoint {
  date: string;
  weatherCode?: number;
  weatherText?: string;
  tempMaxC?: number;
  tempMinC?: number;
  sunrise?: string;
  sunset?: string;
  precipitationProbabilityMax?: number;
  precipitationSumMm?: number;
  windSpeedMaxKmh?: number;
  uvIndexMax?: number;
}

export interface WeatherForecast {
  location: ResolvedLocation;
  generatedAt: string;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastPoint[];
  provenance: Provenance;
}

export interface AirQualityObservation {
  location: ResolvedLocation;
  timestamp: string;
  usAqi?: number;
  pm25?: number;
  pm10?: number;
  no2?: number;
  o3?: number;
  co?: number;
  so2?: number;
  provenance: Provenance;
}

// ─── Alerts / Warnings ───────────────────────────────────────────────────────

export type HazardType =
  | "heavy_rain"
  | "thunderstorm"
  | "cyclone"
  | "flood"
  | "extreme_heat"
  | "cold_wave"
  | "lightning"
  | "strong_wind"
  | "fog"
  | "other";

export type Severity = "green" | "yellow" | "orange" | "red";

export interface Alert {
  id: string;
  source: string;
  sourceAlertId?: string;
  hazardType: HazardType;
  severity: Severity;
  /** e.g. "orange" | "red" */
  title: string;
  description: string;
  instructions?: string[];
  geometry?: unknown;
  affectedAreas: string[];
  affectedDistricts?: string[];
  issuedAt: string;
  expiresAt: string;
  language: string;
  isActive: boolean;
  provenance: Provenance;
  createdAt: string;
}

// ─── Risk ────────────────────────────────────────────────────────────────────
// NOTE: we must NOT label a risk score "confidence" unless it is a calibrated
// probability. We use `riskScore` (0–100) and optionally `calibratedProbability`.

export type RiskLevel = "low" | "moderate" | "high" | "extreme";

export interface RiskFactorDetail {
  name: string;
  source: string;
  contribution: number; // 0..1 relative contribution
  note?: string;
}

export interface RiskResult {
  location: ResolvedLocation;
  computedAt: string;
  hazardType: HazardType;
  /** 0..100 composite score. This is NOT a calibrated probability. */
  riskScore: number;
  /** calibrated probability of the hazard within the window, when a model is available */
  calibratedProbability?: number;
  riskLevel: RiskLevel;
  reasonCodes: string[];
  factors: RiskFactorDetail[];
  officialAlertSeverity?: Severity;
  windowStart?: string;
  windowEnd?: string;
  modelVersion?: string;
  isDemo: boolean;
  evidenceRefs: string[];
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  id: string;
  /** free-text claim that this evidence supports */
  claim: string;
  source: string;
  sourceLabel: string;
  sourceUrl?: string;
  sourceId?: string;
  retrievedAt: string;
  /** compact payload shown to the user (numbers, labels) */
  data: Record<string, unknown>;
  quality: "current" | "stale" | "expired" | "demo";
}

// ─── Query understanding ─────────────────────────────────────────────────────

export type Intent =
  | "current_weather"
  | "forecast"
  | "precipitation"
  | "temperature"
  | "wind"
  | "aqi"
  | "warning"
  | "disaster"
  | "agriculture"
  | "comparison"
  | "historical"
  | "explanation"
  | "location_weather"
  | "event_weather"
  | "greeting"
  | "unknown";

export type TimeBucket = "now" | "today" | "tonight" | "tomorrow" | "tomorrow_evening" | "weekend" | "week" | "next_hours";

export interface TimeRange {
  bucket: TimeBucket;
  startISO?: string;
  endISO?: string;
  /** human label e.g. "tomorrow evening" */
  label?: string;
}

export interface QueryUnderstanding {
  rawQuery: string;
  intent: Intent;
  locationHint?: string;
  /** which weather variables the user asked about */
  variables: string[];
  timeRange?: TimeRange;
  /** detected user language (ISO 639-1 or "code-mixed") */
  language: string;
  cropHint?: string;
  /** confidence of our own parser, not the LLM */
  resolution: "resolved" | "partial" | "unresolved";
  normalizedQuery: string;
}

// ─── LLM / chat ──────────────────────────────────────────────────────────────

export interface StructuredChatResponse {
  answer: string;
  language: string;
  severity: "green" | "yellow" | "orange" | "red" | "info";
  claims: string[];
  evidenceIds: string[];
  recommendations: string[];
  disclaimer?: string;
  followUpSuggestions?: string[];
  sourceLabel?: string;
  sourceUpdatedAt?: string;
}

// ─── Agriculture ─────────────────────────────────────────────────────────────

export interface CropContext {
  crop: string;
  stage: string;
  location: ResolvedLocation;
  soil?: string;
  irrigationAvailable: boolean;
}

export interface AgricultureAdvisory {
  crop: string;
  stage: string;
  action: string;
  actionReason: string;
  reasonCodes: string[];
  riskLevel: RiskLevel;
  /** the time window the recommendation refers to */
  window?: string;
  /** explicit boundary between weather-derived guidance and agronomic advice */
  advisoryType: "weather_derived" | "professional_agronomic";
  evidenceRefs: string[];
  disclaimer: string;
}

// ─── API envelope ────────────────────────────────────────────────────────────

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface ApiMeta {
  mode: "live" | "demo";
  sources: string[];
  retrievedAt?: string;
}