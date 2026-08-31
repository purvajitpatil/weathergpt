/**
 * WeatherGPT — Orchestrator engine.
 *
 * One facade the API layer calls. It runs the pipeline:
 *   query → location → tools (routed) → risk → evidence → chat
 *   (deterministic when possible, LLM-grounded otherwise, safety-validated always).
 */
import { CacheService } from "./cache";
import { getRegistry, type DataMode } from "./providers";
import { LocationService } from "./services/locationService";
import { understand } from "./services/queryUnderstanding";
import { AlertService } from "./services/alertsService";
import { WeatherDataFetcher } from "./services/fetcher";
import { computeRisk, fetchMlPrediction } from "./services/riskEngine";
import { evidenceService, type EvidenceContext } from "./services/evidenceService";
import { safetyValidator, severityFromEvidence } from "./safety/safetyValidator";
import { LLMGateway } from "./gateway/llmGateway";
import { persistence } from "./db";
import { logger } from "./logger";
import type { FloodData } from "./providers/floodApi";
import type {
  ResolvedLocation,
  WeatherObservation,
  WeatherForecast,
  AirQualityObservation,
  Alert,
  RiskResult,
  StructuredChatResponse,
  QueryUnderstanding,
  EvidenceItem,
} from "./core/models";

export interface ChatAnswerData {
  answer: string;
  language: string;
  severity: string;
  recommendation: string;
  disclaimer?: string;
  followUpSuggestions: string[];
  statistics: {
    rainChance?: number;
    tempMax?: number;
    tempMin?: number;
    wind?: number;
    humidity?: number;
    cloudCover?: number;
    pressure?: number;
    uvIndex?: number;
  };
}

export interface EngineData {
  mode: DataMode;
  location: ResolvedLocation;
  current?: WeatherObservation;
  forecast?: WeatherForecast;
  aqi?: AirQualityObservation;
  alerts: Alert[];
  risk?: RiskResult;
  flood?: FloodData;
  elevation?: number;
  sources: { label: string; retrievedAt?: string; validUntil?: string; isDemo: boolean }[];
}

export interface EngineResult {
  understanding: QueryUnderstanding;
  data: EngineData;
  evidence: EvidenceItem[];
  evidenceContext: EvidenceContext;
  chat: ChatAnswerData;
  llmUsed: boolean;
  validationIssues: { type: string; description: string; severity: string }[];
}

export interface EngineOptions {
  cache: CacheService;
  alerts: AlertService;
  llm: LLMGateway | null;
  config: { mlInferenceUrl?: string; modelVersion: string };
}

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: "Respond in clear, professional English.",
  hi: "Respond in natural Hindi (हिन्दी).",
  mr: "Respond in natural Marathi (मराठी).",
  ta: "Respond in natural Tamil (தமிழ்).",
  te: "Respond in natural Telugu (తెలుగు).",
  bn: "Respond in natural Bengali (বাংলা).",
  gu: "Respond in natural Gujarati (ગુજરાતી).",
  kn: "Respond in natural Kannada (ಕನ್ನಡ).",
};

const SYSTEM_POLICY = `You are WeatherGPT, an explanation and reasoning layer over structured meteorological evidence.

RULES:
- Never invent weather values, warnings, locations, forecasts, measurements, risk scores, or source information.
- Use ONLY the supplied EVIDENCE (JSON below). If evidence is missing, say so explicitly.
- Never override official warnings. Never create official warning severity. If data mode is demo, never claim IMD or "live" data.
- Do not present uncertain information as certain. Use probabilistic framing ("conditions suggest elevated risk").
- For agriculture: explain the recommendation produced by the advisory engine. Do not invent new agronomic rules.
- Currency/language: match the requested language.
- Return COUNTERFACTUAL-free, concise, actionable answers.`;

export class WeatherGPTEngine {
  private fetcher: WeatherDataFetcher;

  constructor(
    private opts: EngineOptions,
    public locationService: LocationService
  ) {
    this.fetcher = new WeatherDataFetcher(opts.cache, () => getRegistry().weather);
  }

  async resolveLocation(input?: string, fallback?: ResolvedLocation): Promise<ResolvedLocation | null> {
    if (input) {
      const resolved = await this.locationService.resolve(input);
      if (resolved) return resolved;
    }
    return fallback ?? null;
  }

  /** Fetch exactly the data needed for an intent (routed, cached). */
  async gatherData(location: ResolvedLocation, intent: QueryUnderstanding["intent"]): Promise<EngineData> {
    const registry = getRegistry();
    const mode = registry.mode;
    const alerts = await this.opts.alerts.getActiveForLocation(location);

    const needWeather = [
      "current_weather", "forecast", "precipitation", "temperature",
      "wind", "aqi", "agriculture", "event_weather", "location_weather",
      "unknown", "comparison", "explanation", "historical",
    ].includes(intent);

    const needForecast = [
      "forecast", "precipitation", "agriculture", "event_weather",
      "unknown", "comparison", "explanation",
    ].includes(intent);

    const needAqi = ["aqi", "current_weather", "location_weather", "unknown", "explanation"].includes(intent);

    let current: WeatherObservation | undefined;
    let forecast: WeatherForecast | undefined;
    let aqi: AirQualityObservation | undefined;

    const fetcher = this.fetcher;
    if (needWeather) {
      current = await fetcher.getCurrent(location);
      if (needForecast && current) forecast = await fetcher.getForecast(location, 3);
    }
    if (needAqi) aqi = await fetcher.getAqi(location);

    // Flood data: fetch when precipitation/disaster intent, or for agriculture
    let flood: FloodData | undefined;
    const needFlood = ["precipitation", "flood", "agriculture", "disaster", "unknown"].includes(intent);
    if (needFlood && mode === "live") {
      try {
        flood = await registry.flood.getFloodData(location, { days: 7 }) ?? undefined;
      } catch {
        // Flood data may not be available for all locations — graceful
      }
    }

    // Elevation: fetch for terrain-aware risk assessment
    let elevation: number | undefined;
    if (mode === "live") {
      try {
        elevation = await registry.elevation.getForLocation(location);
      } catch {
        // Elevation is supplementary — graceful failure
      }
    }

    // Risk is requested explicitly, or whenever forecast/observation exists.
    let risk: RiskResult | undefined;
    const wantRisk =
      current ||
      (forecast?.hourly ?? []).length > 0 ||
      alerts.length > 0 ||
      flood ||
      ["precipitation", "agriculture", "event_weather", "unknown"].includes(intent);

    if (wantRisk && current) {
      const ml = await fetchMlPrediction(this.opts.config.mlInferenceUrl, location, current, forecast);

      // Combine flood discharge risk with weather risk for compound assessment
      const floodRiskBoost = flood?.floodRisk?.score ?? 0;
      const elevationModifier = elevation !== undefined
        ? (elevation < 100 ? 10 : elevation < 300 ? 5 : elevation < 750 ? 0 : -5)
        : 0;

      risk = computeRisk({
        weather: current,
        forecast,
        alerts,
        hazardType: "heavy_rain",
        modelVersion: ml?.modelVersion,
        calibratedProbability: ml?.probability,
        windowStart: forecast?.hourly?.[0]?.time,
        windowEnd: forecast?.hourly?.[Math.min(11, (forecast?.hourly.length ?? 0) - 1)]?.time,
      });

      // Adjust risk score with flood and elevation data
      if (risk && (floodRiskBoost > 0 || elevationModifier !== 0)) {
        const adjusted = Math.min(100, risk.riskScore + Math.round(floodRiskBoost * 0.3) + elevationModifier);
        risk = { ...risk, riskScore: adjusted };
      }

      await persistence.savePrediction({
        location: location.fullLabel,
        modelVersion: ml?.modelVersion ?? "rule-engine",
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        factors: risk.factors,
        features: { temp: current.temperatureC, humidity: current.humidityPercent },
      }).catch(() => undefined);
    }

    return {
      mode,
      location,
      current,
      forecast,
      aqi,
      alerts,
      risk,
      flood,
      elevation,
      sources: [
        ...(current?.provenance
          ? [{ label: current.provenance.sourceLabel, retrievedAt: current.provenance.retrievedAt, validUntil: current.provenance.validUntil, isDemo: current.provenance.isDemo }]
          : []),
        ...(forecast?.provenance
          ? [{ label: forecast.provenance.sourceLabel, retrievedAt: forecast.provenance.retrievedAt, validUntil: forecast.provenance.validUntil, isDemo: forecast.provenance.isDemo }]
          : []),
        ...(aqi?.provenance
          ? [{ label: aqi.provenance.sourceLabel, retrievedAt: aqi.provenance.retrievedAt, validUntil: aqi.provenance.validUntil, isDemo: aqi.provenance.isDemo }]
          : []),
        ...(flood?.provenance
          ? [{ label: flood.provenance.sourceLabel, retrievedAt: flood.provenance.retrievedAt, validUntil: flood.provenance.validUntil, isDemo: flood.provenance.isDemo }]
          : []),
        ...alerts.map((a) => ({ label: a.source, retrievedAt: a.createdAt, validUntil: a.expiresAt, isDemo: a.provenance.isDemo })),
      ],
    };
  }

  buildEvidence(data: EngineData) {
    const chain = evidenceService.buildChain({
      observation: data.current,
      forecast: data.forecast,
      alerts: data.alerts,
      risk: data.risk,
    });
    return { evidence: chain.evidence, evidenceContext: chain.contextForLLM };
  }

  /**
   * Answer a chat query. Uses the LLM only when needed; deterministic answers
   * (simple current temperature, aqi, etc.) never touch the LLM.
   */
  async chat(
    understanding: QueryUnderstanding,
    data: EngineData,
    evidence: EvidenceItem[],
    evidenceContext: EvidenceContext
  ): Promise<{ chat: ChatAnswerData; llmUsed: boolean; validationIssues: unknown[] }> {
    const deterministic = this.tryDeterministicAnswer(understanding, data, evidenceContext);
    if (deterministic && data.current) {
      void persistence.saveWeatherSnapshot({
        location: data.location.fullLabel,
        tempC: data.current.temperatureC,
        humidity: data.current.humidityPercent,
        windKmh: data.current.windSpeedKmh,
        aqi: data.aqi?.usAqi,
        source: data.current.provenance.sourceLabel,
        raw: data.current,
      }).catch(() => undefined);
      return { chat: deterministic, llmUsed: false, validationIssues: [] };
    }

    const llmOut = await this.answerWithLLM(understanding, data, evidence, evidenceContext);
    return { chat: llmOut.chat, llmUsed: true, validationIssues: llmOut.issues };
  }

  // ─── deterministic (no-LLM) answers ────────────────────────────────────────

  private tryDeterministicAnswer(
    u: QueryUnderstanding,
    data: EngineData,
    context: EvidenceContext
  ): ChatAnswerData | null {
    const current = data.current;
    if (!current) return null;

    const base = {
      rainChance: data.forecast?.hourly?.[0]?.precipitationProbability,
      tempMax: data.forecast?.daily?.[0]?.tempMaxC,
      tempMin: data.forecast?.daily?.[0]?.tempMinC,
      wind: current.windSpeedKmh,
      humidity: current.humidityPercent,
      cloudCover: current.cloudCoverPercent,
      pressure: current.pressureHpa,
      uvIndex: current.uvIndex,
    };

    const alertLead = data.alerts[0]
      ? `${severityUi(data.alerts[0].severity)} ${data.alerts[0].title} for ${data.location.name}. `
      : "";

    const hourly = data.forecast?.hourly?.[0];
    const pop = hourly?.precipitationProbability ?? 0;
    const followUpSuggestions = followUpsFor(u.intent);

    switch (u.intent) {
      case "current_weather":
      case "temperature":
        return {
          answer: `${alertLead}Currently at ${data.location.name}: **${Math.round(current.temperatureC ?? 0)}°C** (feels like **${Math.round(current.feelsLikeC ?? current.temperatureC ?? 0)}°C**), ${current.weatherText ?? ""}. Humidity **${Math.round(current.humidityPercent ?? 0)}%**, wind **${Math.round(current.windSpeedKmh ?? 0)} km/h**.`,
          language: u.language,
          severity: severityFromEvidence(context),
          recommendation: data.alerts[0]
            ? `Follow the active ${data.alerts[0].severity} advisory for ${data.location.name}.`
            : "No active official warnings for this location.",
          followUpSuggestions,
          statistics: base,
        };
      case "precipitation":
      case "event_weather": {
        const rainAnswer =
          pop >= 60
            ? `Rain is **likely** for ${data.location.name} (up to **${Math.round(pop)}%** probability in the next few hours).`
            : pop >= 30
            ? `There is a **moderate chance of rain** (about **${Math.round(pop)}%**) for ${data.location.name}.`
            : `Rain is **unlikely** in the near term (about **${Math.round(pop)}%** probability).`;
        return {
          answer: `${alertLead}${rainAnswer}${riskSentence(data.risk)}`,
          language: u.language,
          severity: severityFromEvidence(context),
          recommendation:
            pop >= 60
              ? "Carry rain protection and consider an indoor alternative for outdoor plans."
              : "No special rain preparation needed, but conditions may change — check again before heading out.",
          followUpSuggestions,
          statistics: base,
        };
      }
      case "aqi": {
        const aqi = data.aqi?.usAqi;
        return {
          answer: `${alertLead}Air quality at ${data.location.name}: **AQI ${aqi ?? "unavailable"}**${aqiLabel(aqi)}.`,
          language: u.language,
          severity: severityFromEvidence(context),
          recommendation:
            aqi !== undefined && aqi > 150
              ? "Sensitive groups should limit outdoor exertion."
              : "Air quality is acceptable for outdoor activity.",
          followUpSuggestions,
          statistics: base,
        };
      }
      case "greeting":
        return {
          answer: `Hello! I can tell you about current weather, forecasts, alerts, air quality, and agriculture advisories for ${data.location.name}. Try: "Will it rain tomorrow in ${data.location.name}?"`,
          language: u.language,
          severity: "info",
          recommendation: "",
          followUpSuggestions,
          statistics: base,
        };
      default:
        return null; // needs LLM (forecast narration, warnings, agriculture explanation)
    }
  }

  // ─── LLM-grounded answers (evidence injected) ──────────────────────────────

  private async answerWithLLM(
    u: QueryUnderstanding,
    data: EngineData,
    evidence: EvidenceItem[],
    context: EvidenceContext
  ): Promise<{ chat: ChatAnswerData; issues: unknown[] }> {
    const llm = this.opts.llm;
    if (!llm || !llm.isAvailable()) {
      // Honest deterministic fallback — grounded, no fabricated data.
      const fallback = this.deterministicFallbackAnswer(u, data, context);
      return { chat: fallback, issues: [] };
    }

    const langInstruction = LANGUAGE_INSTRUCTIONS[u.language] ?? LANGUAGE_INSTRUCTIONS.en;
    const riskLine = data.risk ? `Risk score for heavy rain is ${data.risk.riskScore}/100 (${data.risk.riskLevel}).` : "";
    const cropLine = u.cropHint ? `User is asking about crop "${u.cropHint}".` : "";

    const system = `${SYSTEM_POLICY}\nLanguage: ${langInstruction}\n\nEVIDENCE (source of truth):\n${JSON.stringify(context)}\n${riskLine}\n${cropLine}`;

    const user = `Question: "${u.rawQuery}"\nAnswer concisely in the requested language. Use **bold** for key facts.`;

    try {
      const { data: structured } = await llm.generateStructured<StructuredChatResponse>({
        system,
        user,
        validate: (raw) => {
          // minimal shape guard before safety layer
          const r = raw as StructuredChatResponse;
          if (!r || typeof r.answer !== "string") throw new Error("LLM returned malformed structured response");
          return r;
        },
      });

      const validation = safetyValidator.validate(structured, context, { mode: data.mode });
      if (validation.issues.filter((i) => i.severity === "error").length > 0) {
        logger.warn("Safety validation rejected LLM answer; using grounded fallback", {
          issues: validation.issues.map((i) => i.type),
        });
        const fallback = this.deterministicFallbackAnswer(u, data, context);
        return { chat: fallback, issues: validation.issues };
      }

      const chat: ChatAnswerData = {
        answer: validation.sanitizedResponse.answer,
        language: validation.sanitizedResponse.language,
        severity: validation.sanitizedResponse.severity,
        recommendation: (validation.sanitizedResponse.recommendations ?? []).join(" ") ||
          "No additional action recommended at this time.",
        disclaimer: validation.sanitizedResponse.disclaimer,
        followUpSuggestions: validation.sanitizedResponse.followUpSuggestions ?? followUpsFor(u.intent),
        statistics: statsFromEvidence(data, evidence),
      };
      return { chat, issues: validation.issues };
    } catch (err) {
      logger.warn("LLM failed; using grounded deterministic fallback", { error: (err as Error).message });
      const fallback = this.deterministicFallbackAnswer(u, data, context);
      return { chat: fallback, issues: [{ type: "llm_failed", description: (err as Error).message, severity: "warning" }] };
    }
  }

  private deterministicFallbackAnswer(
    u: QueryUnderstanding,
    data: EngineData,
    context: EvidenceContext
  ): ChatAnswerData {
    const current = data.current;
    const stats = current
      ? {
          rainChance: data.forecast?.hourly?.[0]?.precipitationProbability,
          tempMax: data.forecast?.daily?.[0]?.tempMaxC,
          tempMin: data.forecast?.daily?.[0]?.tempMinC,
          wind: current.windSpeedKmh,
          humidity: current.humidityPercent,
          cloudCover: current.cloudCoverPercent,
          pressure: current.pressureHpa,
          uvIndex: current.uvIndex,
        }
      : {};

    const alertLead = data.alerts[0]
      ? `${data.alerts[0].severity.toUpperCase()} WARNING active for ${data.location.name}: ${data.alerts[0].title}. `
      : "";

    let answer: string;
    if (u.intent === "agriculture") {
      answer = `${alertLead}To give a crop-specific advisory I need the crop stage. Based on current data for ${data.location.name}: **${current?.weatherText ?? "conditions"}**, humidity **${Math.round(current?.humidityPercent ?? 0)}%**, max **${Math.round(data.forecast?.daily?.[0]?.tempMaxC ?? 0)}°C**${data.risk ? `, heavy-rain risk score **${data.risk.riskScore}/100**` : ""}.`;
    } else if (u.intent === "warning" || u.intent === "disaster") {
      if (context.mode === "demo") {
        answer = data.alerts.length
          ? `${alertLead}This alert is from the DEMO fixture source. Official IMD warning data is not configured in this build.`
          : "No active warnings for this location. Official IMD warning data is currently unavailable in this configuration.";
      } else {
        answer = data.alerts.length
          ? alertLead
          : "No active official warnings for this location.";
      }
    } else if (u.intent === "forecast") {
      const d = data.forecast?.daily?.[0];
      answer = `${alertLead}Forecast for ${data.location.name} today: max **${Math.round(d?.tempMaxC ?? 0)}°C**, min **${Math.round(d?.tempMinC ?? 0)}°C**, rain probability up to **${Math.round(d?.precipitationProbabilityMax ?? 0)}%**.`;
    } else if (current) {
      answer = `${alertLead}Current conditions at ${data.location.name}: **${Math.round(current.temperatureC ?? 0)}°C**, ${current.weatherText ?? ""}. Humidity **${Math.round(current.humidityPercent ?? 0)}%**, wind **${Math.round(current.windSpeedKmh ?? 0)} km/h**.`;
    } else {
      answer = `Live data is temporarily unavailable for ${data.location.name}. Please try again shortly.`;
    }

    return {
      answer,
      language: u.language,
      severity: severityFromEvidence(context),
      recommendation: data.alerts[0]
        ? `Follow the active ${data.alerts[0].severity} advisory (valid until ${new Date(data.alerts[0].expiresAt).toLocaleString()}).`
        : "No active official warnings for this location.",
      followUpSuggestions: followUpsFor(u.intent),
      statistics: stats,
    };
  }
}

// ─── small helpers ───────────────────────────────────────────────────────────

function severityUi(sev: string): string {
  return sev.toUpperCase();
}

function aqiLabel(v?: number): string {
  if (v === undefined) return "";
  if (v <= 50) return " (Good)";
  if (v <= 100) return " (Moderate)";
  if (v <= 150) return " (Unhealthy for Sensitive Groups)";
  if (v <= 200) return " (Unhealthy)";
  return " (Very Unhealthy)";
}

function riskSentence(risk?: RiskResult): string {
  if (!risk) return "";
  if (risk.riskLevel === "high" || risk.riskLevel === "extreme")
    return ` Conditions suggest **elevated risk**.`;
  if (risk.riskLevel === "moderate") return " Conditions suggest **moderate risk**.";
  return "";
}

function statsFromEvidence(data: EngineData, evidence: EvidenceItem[]): ChatAnswerData["statistics"] {
  const current = data.current;
  return {
    rainChance: data.forecast?.hourly?.[0]?.precipitationProbability,
    tempMax: data.forecast?.daily?.[0]?.tempMaxC,
    tempMin: data.forecast?.daily?.[0]?.tempMinC,
    wind: current?.windSpeedKmh,
    humidity: current?.humidityPercent,
    cloudCover: current?.cloudCoverPercent,
    pressure: current?.pressureHpa,
    uvIndex: current?.uvIndex,
  };
}

function followUpsFor(intent: QueryUnderstanding["intent"]): string[] {
  switch (intent) {
    case "precipitation": return ["Will it rain tomorrow?", "Is there a weather warning?", "Check the hourly forecast"];
    case "agriculture": return ["Which crops are affected?", "When can I spray pesticide?", "Advice for next week"];
    case "temperature": return ["What is the humidity?", "Air quality here?", "Will it rain?"];
    case "warning": return ["When does the warning expire?", "Which areas are affected?", "What should I do?"];
    case "aqi": return ["Air quality tomorrow?", "What is PM2.5?", "Advice for sensitive groups"];
    default: return ["Should I carry an umbrella?", "How is the weekend looking?", "Any weather warnings?"];
  }
}