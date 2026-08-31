import { describe, it, expect } from "vitest";
import { computeRisk, type RiskEngineContext } from "../src/server/services/riskEngine";
import { SafetyValidator } from "../src/server/safety/safetyValidator";
import { evalCondition, agricultureEngine } from "../src/server/services/agricultureEngine";
import { understand, detectLanguageCode } from "../src/server/services/queryUnderstanding";
import { evidenceService, type EvidenceContext } from "../src/server/services/evidenceService";
import type { WeatherObservation, WeatherForecast, Alert, ResolvedLocation, StructuredChatResponse } from "../src/server/core/models";

const LOCATION: ResolvedLocation = {
  name: "Pune",
  latitude: 18.52,
  longitude: 73.85,
  fullLabel: "Pune, Maharashtra, India",
  source: "test",
  isDemo: true,
};

function alert(severity: Alert["severity"], overrides: Partial<Alert> = {}): Alert {
  const now = Date.now();
  return {
    id: `a-${severity}`,
    source: "DEMO Fixture",
    sourceAlertId: `src-${severity}`,
    hazardType: "heavy_rain",
    severity,
    title: `Demo ${severity} rain alert`,
    description: "fixture",
    instructions: [],
    affectedAreas: ["Pune"],
    affectedDistricts: [],
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    language: "en",
    isActive: true,
    provenance: { provider: "demo", sourceLabel: "DEMO Fixture", retrievedAt: new Date().toISOString(), validFrom: new Date().toISOString(), isDemo: true },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function observation(overrides: Partial<WeatherObservation> = {}): WeatherObservation {
  return {
    location: LOCATION,
    timestamp: new Date().toISOString(),
    temperatureC: 26,
    feelsLikeC: 27,
    humidityPercent: 80,
    pressureHpa: 1008,
    windSpeedKmh: 12,
    windDirectionDeg: 240,
    precipitationMm: 0,
    precipitationProbability: 70,
    cloudCoverPercent: 85,
    uvIndex: 4,
    weatherText: "Overcast, rain likely",
    provenance: { provider: "demo", sourceLabel: "DEMO Fixture", retrievedAt: new Date().toISOString(), validFrom: new Date().toISOString(), isDemo: true },
    ...overrides,
  };
}

function forecast(pop: number, overrides: Partial<WeatherForecast> = {}): WeatherForecast {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return {
    location: LOCATION,
    generatedAt: new Date().toISOString(),
    hourly: Array.from({ length: 12 }, (_, i) => ({
      time: new Date(now.getTime() + (i + 1) * 3_600_000).toISOString(),
      temperatureC: 26,
      humidityPercent: 80,
      precipitationProbability: pop,
      precipitationMm: pop > 60 ? 1.2 : 0,
      weatherText: "Rain showers likely",
      cloudCoverPercent: 80,
      windSpeedKmh: 14,
    })),
    daily: [
      { date: new Date().toISOString().slice(0, 10), tempMaxC: 29, tempMinC: 22, precipitationProbabilityMax: pop, weatherText: "Rain likely" },
    ],
    provenance: { provider: "demo", sourceLabel: "DEMO Fixture", retrievedAt: new Date().toISOString(), validFrom: new Date().toISOString(), validUntil: new Date(now.getTime() + 12 * 3_600_000).toISOString(), isDemo: true },
    ...overrides,
  };
}

describe("queryUnderstanding", () => {
  it("routes precipitation intent with tomorrow-evening window", () => {
    const u = understand("Will it rain heavily in Pune tomorrow evening?");
    expect(u.intent).toBe("precipitation");
    expect(u.timeRange?.bucket).toBe("tomorrow_evening");
    expect((u.normalizedQuery ?? "").toLowerCase()).toContain("pune");
  });

  it("routes crop intent and detects the crop", () => {
    const u = understand("Should I spray pesticide on my soybean today?");
    expect(u.intent).toBe("agriculture");
    expect(u.cropHint).toBe("soybean");
  });

  it("detects Hinglish/Devanagari input", () => {
    expect(detectLanguageCode("बारिश कब होगी पुणे में?")).toBe("hi");
  });
});

describe("riskEngine.computeRisk", () => {
  it("combines ML calibrated probability with high rain probability into a high score", () => {
    const ctx: RiskEngineContext = {
      alerts: [],
      hazardType: "heavy_rain",
      weather: observation(),
      forecast: forecast(80),
      calibratedProbability: 0.9,
      modelVersion: "test-model-v1",
    };
    const risk = computeRisk(ctx);
    expect(risk.riskScore).toBeGreaterThanOrEqual(60);
    expect(risk.riskLevel).toBe("high");
    expect(risk.reasonCodes).toContain("high_precipitation_probability");
    expect(risk.reasonCodes).toContain("ml_probability_input");
    expect(risk.calibratedProbability).toBe(0.9);
  });

  it("a red official alert floors the risk level and cannot be downgraded", () => {
    const quiet: RiskEngineContext = {
      alerts: [alert("red")],
      hazardType: "heavy_rain",
      weather: observation({ precipitationProbability: 10, humidityPercent: 40 }),
      forecast: forecast(10),
    };
    const risk = computeRisk(quiet);
    expect(risk.riskScore).toBeGreaterThanOrEqual(90);
    expect(risk.officialAlertSeverity).toBe("red");
    expect(risk.reasonCodes).toContain("official_red_warning");
    expect(risk.riskLevel).toBe("extreme");
  });

  it("no alert and dry forecast stays low", () => {
    const risk = computeRisk({ alerts: [], hazardType: "heavy_rain", forecast: forecast(5) });
    expect(risk.riskLevel).toBe("low");
    expect(risk.reasonCodes).not.toContain("official_red_warning");
  });
});

describe("safetyValidator", () => {
  const validator = new SafetyValidator({ requireAlertEvidence: true });

  const validResponse = (answer: string): StructuredChatResponse => ({
    answer,
    language: "en",
    severity: "red",
    claims: ["Current humidity is high with rain probability of 80 percent."],
    evidenceIds: ["ev-1"],
    recommendations: ["Carry an umbrella."],
  });

  it("passes an evidence-backed answer with a red warning surfaced", () => {
    const ctx: EvidenceContext = {
      mode: "demo",
      location: "Pune",
      alerts: [{ severity: "red", title: "Heavy rain alert" } as unknown],
      sources: ["DEMO Fixture"],
      retrievedAt: new Date().toISOString(),
    };
    const v = validator.validate(validResponse("Heavy rain warning is active. Stay indoors this evening."), ctx, { mode: "demo" });
    expect(v.isValid).toBe(true);
    expect(v.sanitizedResponse.answer).toContain("Stay indoors");
    expect(v.issues).toEqual([]);
  });

  it("flags fabricated certainty and sanitizes it", () => {
    const v = validator.validate(validResponse("You are 100% safe today."), null);
    expect(v.issues.some((i) => i.type === "fabricated_certainty")).toBe(true);
    expect(v.sanitizedResponse.answer).not.toContain("100% safe");
  });

  it("fails when a response misses the StructuredChatResponse schema", () => {
    const v = validator.validate({ answer: "hello" }, null);
    expect(v.isValid).toBe(false);
    expect(v.issues.some((i) => i.type === "schema")).toBe(true);
  });

  it("hard-fails an answer that claims IMD in DEMO mode without IMD evidence", () => {
    const ctx: EvidenceContext = { mode: "demo", alerts: [], sources: ["Open-Meteo"] };
    const v = validator.validate(validResponse("IMD has issued a red warning for Pune."), ctx, { mode: "demo" });
    expect(v.issues.some((i) => i.type === "demo_mislabel")).toBe(true);
  });

  it("surfaces an active red warning as the top severity", async () => {
    const { severityFromEvidence } = await import("../src/server/safety/safetyValidator");
    const ctx: EvidenceContext = {
      mode: "demo",
      alerts: [
        { severity: "yellow", title: "Y" } as unknown,
        { severity: "red", title: "R" } as unknown,
      ],
      sources: ["DEMO Fixture"],
    };
    expect(severityFromEvidence(ctx)).toBe("red");
  });
});

describe("agricultureEngine", () => {
  it("evaluates numeric weather predicates", () => {
    expect(evalCondition("rain_sum_today_gt_15", { rainSum: 20, tempMax: 28, tempMin: 20, humidity: 70, popToday: 50, popTomorrow: 60, wind: 10 })).toBe(true);
    expect(evalCondition("rain_sum_today_gt_25", { rainSum: 20, tempMax: 28, tempMin: 20, humidity: 70, popToday: 50, popTomorrow: 60, wind: 10 })).toBe(false);
    expect(evalCondition("humidity_gt_and_pop_tomorrow_gt_75", { rainSum: 0, tempMax: 28, tempMin: 20, humidity: 90, popToday: 0, popTomorrow: 80, wind: 10 })).toBe(true);
  });

  it("advises advance_harvest for soybean flowering under heavy rain", () => {
    const advisory = agricultureEngine.compute(
      { crop: "soybean", stage: "flowering", location: LOCATION, irrigationAvailable: false },
      { observation: observation(), forecast: forecast(80) }
    );
    expect(advisory).not.toBeNull();
    expect(advisory!.action).toBe("advance_harvest");
    expect(advisory!.advisoryType).toBe("weather_derived");
    expect(advisory!.disclaimer).toBeTruthy();
  });

  it("returns null for unknown crops (no hallucination)", () => {
    expect(agricultureEngine.compute({ crop: "dragonfruit", stage: "flowering", location: LOCATION, irrigationAvailable: true }, {})).toBeNull();
  });
});

describe("evidenceService", () => {
  it("labels current, stale, and expired evidence by provenance", async () => {
    const fresh = evidenceService.buildObservation(observation());
    expect(fresh.quality).toBe("current");
    expect(fresh.sourceLabel).toBe("DEMO Fixture");
    expect(fresh.source).toBe("demo");

    const staleObs = observation({
      provenance: { provider: "demo", sourceLabel: "DEMO Fixture", retrievedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), validFrom: new Date(Date.now() - 2 * 3_600_000).toISOString(), isDemo: true },
    });
    expect(evidenceService.buildObservation(staleObs).quality).toBe("stale");

    const expiredObs = observation({
      provenance: {
        provider: "demo",
        sourceLabel: "DEMO Fixture",
        retrievedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        validFrom: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        validUntil: new Date(Date.now() - 60 * 1_000).toISOString(),
        isDemo: true,
      },
    });
    expect(evidenceService.buildObservation(expiredObs).quality).toBe("expired");
  });
});