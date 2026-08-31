import { beforeAll, describe, it, expect } from "vitest";
import { loadConfig } from "../src/server/config";
import { createProviderRegistry, getRegistry } from "../src/server/providers";
import { CacheService } from "../src/server/cache";
import { LocationService } from "../src/server/services/locationService";
import { AlertService } from "../src/server/services/alertsService";
import { WeatherGPTEngine } from "../src/server/engine";
import { understand } from "../src/server/services/queryUnderstanding";

/**
 * End-to-end engine pipeline tests (DEMO fixture mode, determinism guaranteed).
 *
 * Verifies the honest, evidence-grounded decision path used in production:
 *   query → resolve location → gather data (routed) → risk → evidence
 *   → deterministic chat answer (no LLM) with demo labeling.
 */

let engine: WeatherGPTEngine;

beforeAll(async () => {
  const cfg = loadConfig({ DEMO_MODE: "on" });
  await createProviderRegistry(cfg);

  const cache = new CacheService();
  const alerts = new AlertService();
  alerts.registerSource(getRegistry().demo!.alertSource);
  await alerts.ingest();

  engine = new WeatherGPTEngine(
    { cache, alerts, llm: null, config: { modelVersion: "rule-engine" } },
    new LocationService(cache)
  );
});

describe("Engine pipeline (demo mode)", () => {
  it("resolves Pune to a usable location", async () => {
    const loc = await engine.resolveLocation("Pune");
    expect(loc).not.toBeNull();
    expect(loc!.name.toLowerCase()).toContain("pune");
  });

  it("answers a heavy-rain question deterministically with evidence and no LLM", async () => {
    const u = understand("Will it rain heavily in Pune tomorrow evening?");
    const loc = (await engine.resolveLocation("Pune"))!;
    const data = await engine.gatherData(loc, u.intent);
    const { evidence, evidenceContext } = engine.buildEvidence(data);
    const out = await engine.chat(u, data, evidence, evidenceContext);

    expect(data.mode).toBe("demo");
    expect(evidence.length).toBeGreaterThan(0);
    // Every piece of evidence must be traced to a demo/local source, never IMD.
    expect(evidence.every((e) => !e.sourceLabel.toLowerCase().includes("imd"))).toBe(true);
    expect(evidenceContext.mode).toBe("demo");
    expect(evidenceContext.sources.length).toBeGreaterThan(0);

    expect(out.llmUsed).toBe(false);
    expect(out.validationIssues).toEqual([]);
    expect(out.chat.answer).toMatch(/rain/i);
    // Demo fixture sources must never be presented as official.
    expect(out.chat.answer).not.toMatch(/IMD|India Meteorological Department/i);
    expect(out.chat.severity).toBe("red");
  });

  it("surfaces a live-mode mislabel as invalid via the safety validator", async () => {
    const { SafetyValidator } = await import("../src/server/safety/safetyValidator");
    const validator = new SafetyValidator({ requireAlertEvidence: true });
    const resp = {
      answer: "IMD has issued a red warning for Pune.",
      language: "en",
      severity: "red",
      claims: ["IMD issued a red warning."],
      evidenceIds: ["ev-x"],
      recommendations: [],
    };
    const v = validator.validate(resp, { mode: "demo", alerts: [], sources: ["Open-Meteo (demo fixture)"] }, { mode: "demo" });
    expect(v.issues.some((i) => i.type === "demo_mislabel")).toBe(true);
    expect(v.isValid).toBe(false);
  });

  it("reports a coherent agriculture advisory end-to-end", async () => {
    const loc = (await engine.resolveLocation("Pune"))!;
    const u = understand("Should I spray pesticides on my soybean today?");
    const data = await engine.gatherData(loc, u.intent);
    const { evidenceContext } = engine.buildEvidence(data);
    const { agricultureEngine } = await import("../src/server/services/agricultureEngine");

    const advisory = agricultureEngine.compute(
      { crop: "soybean", stage: "flowering", location: loc, irrigationAvailable: false },
      { observation: data.current, forecast: data.forecast }
    );
    expect(advisory).not.toBeNull();
    expect(advisory!.advisoryType).toBe("weather_derived");
    expect(advisory!.disclaimer).toBeTruthy();
    expect(evidenceContext.mode).toBe("demo");
  });
});