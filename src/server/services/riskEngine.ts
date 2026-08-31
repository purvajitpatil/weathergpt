/**
 * WeatherGPT — Risk engine.
 *
 * RiskScore = f(ML probability, rule thresholds, official alert severity,
 * location exposure). We deliberately avoid the word "confidence" for a raw
 * composite score; calibrated probability is only reported when a calibrated
 * model is actually served.
 */
import type {
  ResolvedLocation,
  WeatherObservation,
  WeatherForecast,
  Alert,
  RiskResult,
  HazardType,
  RiskLevel,
  Severity,
} from "../core/models";
import { logger } from "../logger";

export interface RiskEngineContext {
  weather?: WeatherObservation;
  forecast?: WeatherForecast;
  alerts: Alert[];
  hazardType: HazardType;
  modelVersion?: string;
  calibratedProbability?: number;
  windowStart?: string;
  windowEnd?: string;
}

export interface RiskThresholds {
  redAlertScore: number;
  orangeAlertScore: number;
  highProbScore: number;
  highHumidityScore: number;
  highWindScore: number;
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  redAlertScore: 90,
  orangeAlertScore: 75,
  highProbScore: 70,
  highHumidityScore: 30,
  highWindScore: 30,
};

function levelFromScore(score: number): RiskLevel {
  if (score >= 80) return "extreme";
  if (score >= 60) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

export function computeRisk(ctx: RiskEngineContext, thresholds: RiskThresholds = DEFAULT_THRESHOLDS): RiskResult {
  const reasonCodes: string[] = [];
  const factors: { name: string; source: string; contribution: number; note?: string }[] = [];
  const now = new Date().toISOString();

  // 1. ML calibrated probability (when a real calibrated model is served)
  let mlScore = 0;
  if (typeof ctx.calibratedProbability === "number") {
    mlScore = ctx.calibratedProbability * 100;
    factors.push({ name: "ml_calibrated_probability", source: ctx.modelVersion ?? "ml", contribution: 0.4, note: "calibrated prediction from served model" });
    reasonCodes.push("ml_probability_input");
  }

  // 2. Deterministic rule contributions
  let ruleScore = 0;

  const pop = ctx.forecast?.hourly?.reduce((acc, h) => Math.max(acc, h.precipitationProbability ?? 0), 0) ?? 0;
  const maxWind = ctx.forecast?.hourly?.reduce((acc, h) => Math.max(acc, h.windSpeedKmh ?? 0), 0) ?? 0;
  const humidity = ctx.weather?.humidityPercent ?? ctx.forecast?.hourly?.[0]?.humidityPercent ?? 0;
  const tempC = ctx.weather?.temperatureC ?? 0;

  const popContribution = Math.min(100, pop);
  if (pop > 0) {
    factors.push({ name: "precipitation_probability", source: "forecast", contribution: popContribution / 100 });
  }
  if (pop >= thresholds.highProbScore) {
    ruleScore += 40;
    reasonCodes.push("high_precipitation_probability");
  } else if (pop >= 50) {
    ruleScore += 25;
    reasonCodes.push("moderate_precipitation_probability");
  }

  if (humidity >= 85) {
    ruleScore += thresholds.highHumidityScore * 0.7;
    reasonCodes.push("high_humidity");
    factors.push({ name: "humidity", source: "observation", contribution: 0.2 });
  }

  if (maxWind >= 50) {
    ruleScore += thresholds.highWindScore;
    reasonCodes.push("strong_winds");
    factors.push({ name: "wind_speed", source: "forecast", contribution: 0.15 });
  }

  // 3. Official alert severity (takes precedence — a red official warning can
  //    never be downgraded to "low" by our score).
  const matchingAlert = pickStrongestAlert(ctx.alerts);
  let officialAlertSeverity: Severity | undefined;
  let alertBoost = 0;
  if (matchingAlert) {
    officialAlertSeverity = matchingAlert.severity;
    reasonsBySeverity(matchingAlert.severity).forEach((r) => reasonCodes.push(r));
    switch (matchingAlert.severity) {
      case "red": alertBoost = 70; reasonCodes.push("official_red_warning"); break;
      case "orange": alertBoost = 45; reasonCodes.push("official_orange_warning"); break;
      case "yellow": alertBoost = 20; reasonCodes.push("official_yellow_warning"); break;
      default: alertBoost = 0;
    }
  }

  // composite: ML(0.4) + rules(0..1 * 0.6) + official override
  const composite = mlScore * 0.4 + ruleScore * 0.6;
  let finalScore = Math.round(Math.min(100, composite + alertBoost));

  // official severity floor — never downgrade an official red/orange
  if (officialAlertSeverity === "red" && finalScore < thresholds.redAlertScore) finalScore = thresholds.redAlertScore;
  if (officialAlertSeverity === "orange" && finalScore < thresholds.orangeAlertScore) finalScore = thresholds.orangeAlertScore;

  // normalize factor contributions to sum 1 for display
  const total = factors.reduce((acc, f) => acc + f.contribution, 0) || 1;
  for (const f of factors) f.contribution = Math.round((f.contribution / total) * 100) / 100;

  // hazard-appropriate window handling
  const windowStart = ctx.windowStart;
  const windowEnd = ctx.windowEnd;

  return {
    location: ctx.weather?.location ?? ctx.forecast?.location ?? { name: "unknown", latitude: 0, longitude: 0, fullLabel: "unknown", source: "unknown", isDemo: false },
    computedAt: now,
    hazardType: ctx.hazardType,
    riskScore: finalScore,
    calibratedProbability: typeof ctx.calibratedProbability === "number" ? ctx.calibratedProbability : undefined,
    riskLevel: levelFromScore(finalScore),
    reasonCodes: [...new Set(reasonCodes)],
    factors,
    officialAlertSeverity,
    windowStart,
    windowEnd,
    modelVersion: ctx.modelVersion,
    isDemo: !!(ctx.weather?.provenance.isDemo || ctx.forecast?.provenance.isDemo),
    evidenceRefs: [],
  };
}

function reasonsBySeverity(sev: Severity): string[] {
  switch (sev) {
    case "red": return ["official_red_warning_active"];
    case "orange": return ["official_orange_warning_active"];
    case "yellow": return ["official_yellow_warning_active"];
    default: return [];
  }
}

function pickStrongestAlert(alerts: Alert[]): Alert | undefined {
  const rank: Record<Severity, number> = { red: 0, orange: 1, yellow: 2, green: 3 };
  const active = alerts.filter((a) => a.isActive && Date.parse(a.expiresAt) > Date.now());
  if (active.length === 0) return undefined;
  return [...active].sort((a, b) => rank[a.severity] - rank[b.severity])[0];
}

/** Optional: call the ML inference service (bypasses rule engine). Best-effort. */
export interface MlPredictor {
  predict(loc: ResolvedLocation, weather: WeatherObservation, forecast?: WeatherForecast): Promise<{ probability: number; modelVersion: string } | null>;
}

export async function fetchMlPrediction(
  mlUrl: string | undefined,
  loc: ResolvedLocation,
  weather: WeatherObservation,
  forecast: WeatherForecast | undefined,
  timeoutMs = 6_000
): Promise<{ probability: number; modelVersion: string } | null> {
  if (!mlUrl) return null;
  const features = {
    temp_celsius: weather.temperatureC,
    humidity_percent: weather.humidityPercent,
    wind_speed_kmh: weather.windSpeedKmh,
    pressure_hpa: weather.pressureHpa,
    cloud_cover_percent: weather.cloudCoverPercent,
    lat: loc.latitude,
    lon: loc.longitude,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const pop = forecast?.hourly?.reduce((a, h) => Math.max(a, h.precipitationProbability ?? 0), 0) ?? 0;
    const res = await fetch(`${mlUrl.replace(/\/$/, "")}/risk/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...features,
        temperature_val: features.temp_celsius,
        precipitation_probability: pop,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      logger.warn("ML service returned non-OK", { status: res.status });
      return null;
    }
    const data = (await res.json()) as { rain_risk_score: number; calibrated_probability?: number; model_version: string };
    const probability = data.calibrated_probability ?? data.rain_risk_score / 100;
    return { probability, modelVersion: data.model_version };
  } catch (err) {
    logger.warn("ML prediction unavailable", { error: (err as Error).message });
    return null;
  }
}