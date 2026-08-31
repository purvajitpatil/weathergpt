import { describe, it, expect } from "vitest";
import { validateAnswer } from "../src/server/safety/validatorV2";
import type { AnswerObject } from "../shared/contracts/answer";

function makeAnswer(overrides: Partial<AnswerObject> = {}): AnswerObject {
  return {
    intent: "current",
    location: { districtId: 573, districtName: "Pune", state: "Maharashtra", lat: 18.52, lon: 73.86 },
    validFor: { from: "2026-08-31T06:00:00+05:30", to: "2026-08-31T18:00:00+05:30" },
    facts: [
      { key: "temperature", value: 28, unit: "°C", sourceId: "open-meteo" },
      { key: "humidity", value: 85, unit: "%", sourceId: "open-meteo" },
    ],
    warning: { active: false, severity: "none", codes: [], warningRecordId: null, validUpto: null },
    risk: null,
    reasonCodes: [],
    sources: [{ id: "open-meteo", name: "Open-Meteo", url: "https://open-meteo.com", fetchedAt: new Date().toISOString(), stale: false }],
    confidence: "high",
    ...overrides,
  };
}

describe("Validator v2 — four locks", () => {
  describe("Lock 1: NUMBER LOCK", () => {
    it("passes when all numbers exist in facts", () => {
      const answer = makeAnswer();
      const result = validateAnswer("Temperature is 28 degrees with 85% humidity.", answer);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("catches ungrounded numbers", () => {
      const answer = makeAnswer();
      const result = validateAnswer("Temperature is 42 degrees Celsius.", answer);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.includes("UNGROUNDED_NUMBER:42"))).toBe(true);
    });

    it("allows district ID in text", () => {
      const answer = makeAnswer();
      const result = validateAnswer("District 573 has 28°C temperature.", answer);
      expect(result.violations.filter((v) => v.includes("UNGROUNDED_NUMBER:573"))).toHaveLength(0);
    });

    it("allows years", () => {
      const answer = makeAnswer();
      const result = validateAnswer("In 2026, Pune recorded 28°C.", answer);
      expect(result.violations.filter((v) => v.includes("UNGROUNDED_NUMBER:2026"))).toHaveLength(0);
    });
  });

  describe("Lock 2: WARNING LOCK", () => {
    it("passes when warning text matches a warningRecordId", () => {
      const answer = makeAnswer({
        warning: {
          active: true,
          severity: "warning",
          codes: [2],
          warningRecordId: "imd-warn-573-2026",
          validUpto: "2026-09-01T06:00:00+05:30",
        },
      });
      const result = validateAnswer("Red alert for Pune: Heavy Rain Warning issued.", answer);
      expect(result.ok).toBe(true);
    });

    it("blocks warning text without a warningRecordId", () => {
      const answer = makeAnswer();
      const result = validateAnswer("Red alert is active for Pune.", answer);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain("WARNING_CLAIM_WITHOUT_RECORD");
    });

    it("blocks Hindi warning text without record", () => {
      const answer = makeAnswer();
      const result = validateAnswer("पुणे के लिए लाल इशारा जारी किया गया है।", answer);
      expect(result.violations).toContain("WARNING_CLAIM_WITHOUT_RECORD");
    });

    it("blocks Marathi warning text without record", () => {
      const answer = makeAnswer();
      const result = validateAnswer("पुण्यासाठी चेतावणी जारी केली आहे.", answer);
      expect(result.violations).toContain("WARNING_CLAIM_WITHOUT_RECORD");
    });
  });

  describe("Lock 3: CERTAINTY LOCK", () => {
    it("blocks 'definitely safe'", () => {
      const answer = makeAnswer();
      const result = validateAnswer("You are definitely safe today.", answer);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.includes("OVERCONFIDENT_LANGUAGE"))).toBe(true);
    });

    it("blocks '100% sure'", () => {
      const answer = makeAnswer();
      const result = validateAnswer("I am 100% sure it will not rain.", answer);
      expect(result.violations.some((v) => v.includes("OVERCONFIDENT_LANGUAGE"))).toBe(true);
    });

    it("blocks Hindi certainty", () => {
      const answer = makeAnswer();
      const result = validateAnswer("आज बिल्कुल सुरक्षित है।", answer);
      expect(result.violations.some((v) => v.includes("OVERCONFIDENT_LANGUAGE"))).toBe(true);
    });

    it("allows probabilistic language", () => {
      const answer = makeAnswer();
      const result = validateAnswer("There is a moderate chance of rain (72% probability).", answer);
      expect(result.violations.filter((v) => v.includes("OVERCONFIDENT"))).toHaveLength(0);
    });
  });

  describe("Lock 4: SOURCE LOCK", () => {
    it("passes when facts have sources", () => {
      const answer = makeAnswer();
      const result = validateAnswer("Temperature is 28°C from Open-Meteo data.", answer);
      expect(result.ok).toBe(true);
    });

    it("blocks when facts exist but no sources", () => {
      const answer = makeAnswer({ sources: [] });
      const result = validateAnswer("Temperature is 28°C.", answer);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain("NO_SOURCE_ATTRIBUTION");
    });

    it("passes when no facts (conversational)", () => {
      const answer = makeAnswer({ facts: [], sources: [] });
      const result = validateAnswer("Hello! Ask me about weather.", answer);
      expect(result.ok).toBe(true);
    });
  });

  describe("combined validation", () => {
    it("catches multiple violations at once", () => {
      const answer = makeAnswer({ sources: [], warning: { active: false, severity: "none", codes: [], warningRecordId: null, validUpto: null } });
      const result = validateAnswer(
        "42°C is definitely safe. Red alert for Pune.",
        answer
      );
      expect(result.ok).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });
});
