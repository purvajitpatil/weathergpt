/**
 * WeatherGPT — AnswerObject Contract
 *
 * The pivot of the entire architecture. Define it once, render everywhere.
 *
 * EVERYTHING after this is rendering. Multilingual, voice, caching, safety —
 * all transport concerns over the same object.
 *
 * The LLM's only jobs:
 *   (a) parse query → intent JSON
 *   (b) turn reasonCodes + facts into a fluent sentence
 *   It never invents a fact, picks a number, or decides an action.
 */

import type { Severity } from "../../src/server/providers/imd/severity";

// ─── Core Types ─────────────────────────────────────────────────────────────

export type Intent =
  | "current"
  | "forecast"
  | "warning"
  | "risk"
  | "climate"
  | "advisory"
  | "aviation";

export type RiskBand = "low" | "moderate" | "high" | "severe";

export type Confidence = "high" | "medium" | "low";

export type ResponseLang = "en" | "hi" | "mr";

// ─── Fact ───────────────────────────────────────────────────────────────────
// A single, sourced, numeric or textual fact.
// Every number in the final output MUST appear in facts[].

export interface Fact {
  /** Unique key identifying this fact, e.g. 'rain_probability', 'temp_max' */
  key: string;
  /** The value — always numeric when possible, string for descriptions */
  value: number | string;
  /** Unit of measurement, e.g. '%', 'mm', '°C', 'km/h' */
  unit?: string;
  /** FK → sources[].id — the authoritative source for this fact */
  sourceId: string;
}

// ─── Source ─────────────────────────────────────────────────────────────────
// Every fact must be attributable.

export interface Source {
  id: string;
  name: string;
  url: string;
  fetchedAt: string; // ISO 8601
  stale: boolean;
}

// ─── Warning ────────────────────────────────────────────────────────────────
// IMD warning state. The warningRecordId is the anchor for safety validation.

export interface WarningInfo {
  active: boolean;
  severity: Severity;
  /** IMD warning codes (1-17) */
  codes: number[];
  /** REQUIRED if active — anchors the warning to an authoritative record */
  warningRecordId: string | null;
  /** ISO 8601 expiry time */
  validUpto: string | null;
}

// ─── Risk ───────────────────────────────────────────────────────────────────
// ML + rule engine output. May be null if ML is unavailable.

export interface RiskInfo {
  score: number; // 0-100
  band: RiskBand;
  model: string;
  version: string;
}

// ─── Location ───────────────────────────────────────────────────────────────
// IMD district-level location (Obj_id matches IMD API).

export interface AnswerLocation {
  districtId: number;
  districtName: string;
  state: string;
  lat: number;
  lon: number;
}

// ─── AnswerObject ───────────────────────────────────────────────────────────
// THE contract. Everything downstream consumes this.

export interface AnswerObject {
  /** What the user asked about */
  intent: Intent;

  /** IMD district-level location */
  location: AnswerLocation;

  /** Time window this answer covers */
  validFor: {
    from: string; // ISO 8601, IST-aware
    to: string;
  };

  /** Sourced, numeric facts — the single source of truth for all numbers */
  facts: Fact[];

  /** IMD warning state */
  warning: WarningInfo;

  /** ML + rule engine risk assessment (null if unavailable) */
  risk: RiskInfo | null;

  /** Decision/reasoning codes — machine-readable, human-verifiable */
  reasonCodes: string[];

  /** All data sources used to build this answer */
  sources: Source[];

  /** Overall confidence based on data freshness and completeness */
  confidence: Confidence;
}

// ─── Intent Extraction (Gemini responseSchema) ─────────────────────────────

export const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["current", "forecast", "warning", "risk", "climate", "advisory", "aviation"],
    },
    locationText: { type: "string" },
    timeRef: {
      type: "string",
      enum: ["now", "today", "tomorrow", "this_week", "weekend", "custom"],
    },
    customDate: { type: "string" },
    parameter: {
      type: "string",
      enum: ["rain", "temperature", "wind", "humidity", "aqi", "general"],
    },
    responseLang: {
      type: "string",
      enum: ["en", "hi", "mr"],
    },
    activity: { type: "string" },
  },
  required: ["intent", "locationText", "timeRef", "responseLang"],
} as const;

// ─── Reason Codes ───────────────────────────────────────────────────────────

export const REASON_CODES = {
  RAIN_PROB_GT_70: "Rain probability exceeds 70%",
  RAIN_PROB_GT_50: "Rain probability exceeds 50%",
  IMD_RED_ACTIVE: "IMD red alert is active for this district",
  IMD_ORANGE_ACTIVE: "IMD orange alert is active for this district",
  IMD_YELLOW_ACTIVE: "IMD yellow watch is active for this district",
  IMD_WARNING_OVERRIDES_MODEL: "IMD official warning overrides ML model prediction",
  ML_UNAVAILABLE: "ML risk model unavailable — using rule-based assessment",
  STALE_DATA: "Data is older than 30 minutes",
  LOW_CONFIDENCE: "Low confidence due to missing or stale data",
  IRRIGATE_NOW: "Soil moisture depletion exceeds readily available water",
  IRRIGATE_DEFER: "Adequate moisture or rain expected within 72h",
  SPRAY_WINDOW_OPEN: "Conditions suitable for pesticide spraying",
  SPRAY_WINDOW_CLOSED: "Unsuitable conditions for spraying",
  HARVEST_RISK: "Heavy rain warning during remaining days to maturity",
} as const;
