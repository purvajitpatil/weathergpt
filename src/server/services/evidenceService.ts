/**
 * WeatherGPT — Evidence layer.
 *
 * Every factual claim the system makes must be traceable to an EvidenceItem.
 * The LLM receives only these evidence items — it does not invent facts —
 * and the safety validator checks that claims map to supplied evidence.
 */
import { randomUUID } from "node:crypto";
import type {
  EvidenceItem,
  WeatherObservation,
  WeatherForecast,
  Alert,
  RiskResult,
} from "../core/models";

export interface EvidenceChain {
  claims: string[];
  evidence: EvidenceItem[];
  /** compact prompt-safe serialization given to the LLM */
  contextForLLM: EvidenceContext;
}

export interface EvidenceContext {
  mode: "live" | "demo";
  location?: string;
  observation?: Record<string, unknown>;
  forecast?: {
    daily?: unknown[];
    next12h?: unknown[];
  };
  alerts: unknown[];
  risk?: Record<string, unknown>;
  sources: string[];
  retrievedAt?: string;
  validUntil?: string;
}

function evidenceId(kind: string): string {
  return `ev-${kind}-${randomUUID().slice(0, 8)}`;
}

function qualityOf(retrievedAt: string, validUntil?: string): EvidenceItem["quality"] {
  const now = Date.now();
  if (validUntil && Date.parse(validUntil) < now) return "expired";
  const ageMs = now - Date.parse(retrievedAt);
  if (ageMs > 60 * 60 * 1000) return "stale";
  return "current";
}

export class EvidenceService {
  buildObservation(obs: WeatherObservation): EvidenceItem {
    return {
      id: evidenceId("obs"),
      claim: `Current conditions at ${obs.location.fullLabel}`,
      source: obs.provenance.provider,
      sourceLabel: obs.provenance.sourceLabel,
      sourceUrl: obs.provenance.sourceUrl,
      sourceId: obs.provenance.sourceId,
      retrievedAt: obs.provenance.retrievedAt,
      data: {
        timestamp: obs.timestamp,
        temperatureC: obs.temperatureC,
        feelsLikeC: obs.feelsLikeC,
        humidityPercent: obs.humidityPercent,
        pressureHpa: obs.pressureHpa,
        windSpeedKmh: obs.windSpeedKmh,
        windDirectionDeg: obs.windDirectionDeg,
        precipitationMm: obs.precipitationMm,
        precipitationProbability: obs.precipitationProbability,
        cloudCoverPercent: obs.cloudCoverPercent,
        uvIndex: obs.uvIndex,
        weatherText: obs.weatherText,
        isDemo: obs.provenance.isDemo,
      },
      quality: qualityOf(obs.provenance.retrievedAt, obs.provenance.validUntil),
    };
  }

  buildForecast(fc: WeatherForecast, focus?: string[]): EvidenceItem {
    const next12 = fc.hourly.slice(0, 12).map((h) => ({
      time: h.time,
      temperatureC: h.temperatureC,
      humidityPercent: h.humidityPercent,
      precipitationProbability: h.precipitationProbability,
      precipitationMm: h.precipitationMm,
      weatherText: h.weatherText,
      windSpeedKmh: h.windSpeedKmh,
    }));
    return {
      id: evidenceId("fc"),
      claim: `Forecast for ${fc.location.fullLabel}`,
      source: fc.provenance.provider,
      sourceLabel: fc.provenance.sourceLabel,
      sourceUrl: fc.provenance.sourceUrl,
      sourceId: fc.provenance.sourceId,
      retrievedAt: fc.provenance.retrievedAt,
      data: {
        generatedAt: fc.generatedAt,
        hourlyNext: next12,
        daily: fc.daily.slice(0, 7).map((d) => ({
          date: d.date,
          tempMaxC: d.tempMaxC,
          tempMinC: d.tempMinC,
          precipitationProbabilityMax: d.precipitationProbabilityMax,
          precipitationSumMm: d.precipitationSumMm,
          weatherText: d.weatherText,
        })),
        isDemo: fc.provenance.isDemo,
      },
      quality: qualityOf(fc.provenance.retrievedAt, fc.provenance.validUntil),
    };
  }

  buildAlert(alert: Alert): EvidenceItem {
    return {
      id: evidenceId("alert"),
      claim: `Active ${alert.severity} warning: ${alert.title}`,
      source: alert.source,
      sourceLabel: alert.source,
      sourceId: alert.sourceAlertId,
      retrievedAt: alert.createdAt,
      data: {
        hazardType: alert.hazardType,
        severity: alert.severity,
        affectedAreas: alert.affectedAreas,
        issuedAt: alert.issuedAt,
        expiresAt: alert.expiresAt,
        instructions: alert.instructions,
        isDemo: alert.provenance.isDemo,
      },
      quality: qualityOf(alert.provenance.retrievedAt, alert.provenance.validUntil),
    };
  }

  buildRisk(risk: RiskResult): EvidenceItem {
    return {
      id: evidenceId("risk"),
      claim: `Risk assessment for ${risk.location.fullLabel}`,
      source: "risk-engine",
      sourceLabel: "WeatherGPT risk engine (rules + signals)",
      retrievedAt: risk.computedAt,
      data: {
        hazardType: risk.hazardType,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        calibratedProbability: risk.calibratedProbability,
        reasonCodes: risk.reasonCodes,
        officialAlertSeverity: risk.officialAlertSeverity,
        windowStart: risk.windowStart,
        windowEnd: risk.windowEnd,
        isDemo: risk.isDemo,
      },
      quality: "current",
    };
  }

  buildChain(opts: {
    observation?: WeatherObservation;
    forecast?: WeatherForecast;
    alerts?: Alert[];
    risk?: RiskResult;
    focus?: string[];
  }): EvidenceChain {
    const evidence: EvidenceItem[] = [];
    if (opts.observation) evidence.push(this.buildObservation(opts.observation));
    if (opts.forecast) evidence.push(this.buildForecast(opts.forecast, opts.focus));
    for (const a of opts.alerts ?? []) evidence.push(this.buildAlert(a));
    if (opts.risk) evidence.push(this.buildRisk(opts.risk));

    const claims = evidence.map((e) => e.claim);
    const contextForLLM = this.toLLMContext(opts.observation, opts.forecast, opts.alerts, opts.risk);
    return { claims, evidence, contextForLLM };
  }

  private toLLMContext(
    observation?: WeatherObservation,
    forecast?: WeatherForecast,
    alerts?: Alert[],
    risk?: RiskResult
  ): EvidenceContext {
    const sources: string[] = [];
    if (observation) sources.push(observation.provenance.sourceLabel);
    if (forecast) sources.push(forecast.provenance.sourceLabel);
    for (const a of alerts ?? []) sources.push(a.source);

    const isDemo = observation?.provenance.isDemo || forecast?.provenance.isDemo || (alerts ?? []).some((a) => a.provenance.isDemo);

    return {
      mode: isDemo ? "demo" : "live",
      location: observation?.location.fullLabel ?? forecast?.location.fullLabel,
      observation: observation
        ? {
            timestamp: observation.timestamp,
            temperatureC: observation.temperatureC,
            feelsLikeC: observation.feelsLikeC,
            humidityPercent: observation.humidityPercent,
            pressureHpa: observation.pressureHpa,
            windSpeedKmh: observation.windSpeedKmh,
            windDirectionDeg: observation.windDirectionDeg,
            precipitationMm: observation.precipitationMm,
            precipitationProbability: observation.precipitationProbability,
            cloudCoverPercent: observation.cloudCoverPercent,
            uvIndex: observation.uvIndex,
            weatherText: observation.weatherText,
          }
        : undefined,
      forecast: forecast
        ? {
            next12h: forecast.hourly.slice(0, 12).map((h) => ({
              time: h.time,
              temperatureC: h.temperatureC,
              precipitationProbability: h.precipitationProbability,
              precipitationMm: h.precipitationMm,
              weatherText: h.weatherText,
              windSpeedKmh: h.windSpeedKmh,
            })),
            daily: forecast.daily.slice(0, 7).map((d) => ({
              date: d.date,
              tempMaxC: d.tempMaxC,
              tempMinC: d.tempMinC,
              precipitationProbabilityMax: d.precipitationProbabilityMax,
              precipitationSumMm: d.precipitationSumMm,
              weatherText: d.weatherText,
            })),
          }
        : undefined,
      alerts: (alerts ?? []).map((a) => ({
        hazardType: a.hazardType,
        severity: a.severity,
        title: a.title,
        expiresAt: a.expiresAt,
      })),
      risk: risk
        ? {
            riskScore: risk.riskScore,
            riskLevel: risk.riskLevel,
            reasonCodes: risk.reasonCodes,
            calibratedProbability: risk.calibratedProbability,
            officialAlertSeverity: risk.officialAlertSeverity,
          }
        : undefined,
      sources: [...new Set(sources)],
      retrievedAt: observation?.provenance.retrievedAt ?? forecast?.provenance.retrievedAt,
      validUntil: observation?.provenance.validUntil ?? forecast?.provenance.validUntil,
    };
  }
}

export const evidenceService = new EvidenceService();