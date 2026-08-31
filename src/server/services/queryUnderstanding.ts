/**
 * WeatherGPT — Query understanding (deterministic).
 *
 * Converts natural-language / code-mixed queries into a structured intent
 * WITHOUT calling an LLM. The LLM is only used later, for explanation.
 */
import type { Intent, TimeBucket, QueryUnderstanding } from "../core/models";

const AGRI_TERMS = [
  "crop", "crops", "farmer", "sowing", "harvest", "irrigate", "irrigation",
  "pesticide", "spraying", "fertilizer", "soybean", "cotton", "wheat", "rice",
  "sugarcane", "onion", "फसल", "पिक", "शेती", "पेरणी", "सिंचन", "कीटकनाशक",
  "खते", "बीज", "किसान", "सोयाबीन", "कापूस", "गहू", "तांदूळ", "ऊस", "कांदा",
];

const DISASTER_TERMS = [
  "cyclone", "flood", "flooding", "landslide", "अतिवृष्टी", "पूर", "बाढ", "चक्रीवादळ",
  "वादळ", "भुस्कंपन", "त्सुनामी",
];

const WARNING_TERMS = [
  "warning", "alert", "alerts", "danger", "advisory", "evacuate", "इशारा", "चेतावणी",
  "सूचना", "सतर्क", "अलर्ट", "आपत्ती", "red alert", "orange alert",
];

const RAIN_TERMS = ["rain", "rainfall", "paus", "baarish", "precipitation", "पाऊस", "बारिश", "वर्षा", "भिजणार", "padel"];
const TEMP_TERMS = ["temperature", "temperatures", "hot", "cold", "heat", "गरम", "थंड", "तापमान", "उष्णता", "गार"];
const WIND_TERMS = ["wind", "winds", "windy", "वारा", "वाऱ्याचा", "हवा"];
const HUMIDITY_TERMS = ["humidity", "humid", "आर्द्रता", "दमट"];
const AQI_TERMS = ["aqi", "air quality", "pollution", "poor air", "pm2.5", "pm10", "हवेची गुणवत्ता", "प्रदूषण", "वायू प्रदूषण"];
const FORECAST_TERMS = ["forecast", "weather for", "outlook", "बदल", "अंदाज", "हवामान", "pradarshan"];
const CURRENT_TERMS = ["current", "right now", "now", "आत्ता", "आज", "सध्या", "अभी"];
const GREETING_TERMS = ["hi", "hello", "hey", "namaste", "नमस्ते", "नमस्कार", "काय", "cha"];
const HISTORICAL_TERMS = ["yesterday", "last week", "last month", "काल", "मागील"];
const COMPARISON_TERMS = [" vs ", "vs ", "compare", "comparison", "better", "difference", "तुलना"];

const TOMORROW_RE = /\b(?:tomorrow|tmrw|उद्या|उदयाकडे)\b/i;
const TONIGHT_RE = /\b(?:tonight|रात्री|आज रात्री)\b/i;
const THIS_WEEKEND_RE = /\b(?:this weekend|weekend|शनिवार|रविवार)\b/i;
const NEXT_WEEK_RE = /\b(?:next week|coming week|पुढील आठवडा|आठवडा)\b/i;
const EVENING_RE = /\b(?:evening|संध्याकाळी|सायंकाळी|शाम)\b/i;
const TOMORROW_EVENING_RE = /\b(?:tomorrow evening|काल शाम|उद्या संध्याकाळी|उद्या सायंकाळी)\b/i;
const NEXT_HOURS_RE = /\b(?:next \d+ hours?|coming hours|next few hours)\b/i;

export type QueryLanguage = "en" | "hi" | "mr" | "code-mixed" | "unknown";

export function detectLanguage(raw: string): QueryLanguage {
  const s = raw.trim();
  if (!s) return "unknown";
  const devanagari = /[\u0900-\u097F]/.test(s);
  if (!devanagari) {
    // latin script — english, possibly with code-mixed tokens
    const codeMixCount = RAIN_TERMS.concat(["paus", "baarish", "pradarshan"]).filter((t) => /^[a-z]+$/.test(t) && s.toLowerCase().includes(t)).length;
    return codeMixCount > 0 ? "code-mixed" : "en";
  }
  // Devanagari scripts: Marathi vs Hindi heuristics
  const mrMarkers = ["पाऊस", "उद्या", "एकटे", "असल्यास", "संध्याकाळी", "सायंकाळी", "आहे का", "पुण्यात"];
  const hiMarkers = ["बारिश", "कल", "होगी", "होगा", "बारिश", "क्या", "में", "रखना"];
  const mrHits = mrMarkers.filter((m) => s.includes(m)).length;
  const hiHits = hiMarkers.filter((m) => s.includes(m)).length;
  if (mrHits > hiHits) return "mr";
  if (hiHits > mrHits) return "hi";
  return "hi"; // neutral Devanagari defaults to Hindi
}

export function detectLanguageCode(raw: string): string {
  const lang = detectLanguage(raw);
  if (lang === "mr") return "mr";
  if (lang === "hi") return "hi";
  if (lang === "en") return "en";
  return "en";
}

export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();

  const hasAny = (terms: string[]) => terms.some((t) => s.includes(t.toLowerCase()));

  if (hasAny(AGRI_TERMS)) return "agriculture";
  if (hasAny(DISASTER_TERMS)) return "disaster";
  if (hasAny(WARNING_TERMS)) return "warning";
  if (hasAny(AQI_TERMS)) return "aqi";
  if (hasAny(COMPARISON_TERMS)) return "comparison";
  if (hasAny(HISTORICAL_TERMS)) return "historical";
  if (hasAny(RAIN_TERMS)) return "precipitation";
  if (hasAny(TEMP_TERMS)) return "temperature";
  if (hasAny(WIND_TERMS)) return "wind";
  if (hasAny(HUMIDITY_TERMS)) return "current_weather";
  if (hasAny(FORECAST_TERMS)) return "forecast";
  if (TOMORROW_RE.test(s)) return "forecast";
  if (hasAny(CURRENT_TERMS)) return "current_weather";
  if (hasAny(GREETING_TERMS)) return "greeting";

  return "current_weather";
}

export interface DetectedTime {
  bucket: TimeBucket;
  label: string;
}

export function detectTime(q: string): DetectedTime {
  const s = q.toLowerCase();
  if (TOMORROW_EVENING_RE.test(s)) return { bucket: "tomorrow_evening", label: "tomorrow evening" };
  if (THIS_WEEKEND_RE.test(s) && TOMORROW_RE.test(s)) return { bucket: "weekend", label: "this weekend" };
  if (NEXT_WEEK_RE.test(s)) return { bucket: "week", label: "next week" };
  if (TOMORROW_RE.test(s)) return { bucket: "tomorrow", label: "tomorrow" };
  if (NEXT_HOURS_RE.test(s)) return { bucket: "next_hours", label: "next hours" };
  if (TONIGHT_RE.test(s)) return { bucket: "tonight", label: "tonight" };
  if (EVENING_RE.test(s)) return { bucket: "tomorrow_evening", label: "evening" };
  if (THIS_WEEKEND_RE.test(s)) return { bucket: "weekend", label: "this weekend" };
  if (HISTORICAL_TERMS.some((t) => s.includes(t.toLowerCase()))) return { bucket: "now", label: "now" };
  return { bucket: "now", label: "now" };
}

export function detectVariables(q: string): string[] {
  const s = q.toLowerCase();
  const vars: string[] = [];
  if (RAIN_TERMS.some((t) => s.includes(t.toLowerCase()))) vars.push("precipitation");
  if (TEMP_TERMS.some((t) => s.includes(t.toLowerCase()))) vars.push("temperature");
  if (WIND_TERMS.some((t) => s.includes(t.toLowerCase()))) vars.push("wind");
  if (HUMIDITY_TERMS.some((t) => s.includes(t.toLowerCase()))) vars.push("humidity");
  if (AQI_TERMS.some((t) => s.includes(t.toLowerCase()))) vars.push("aqi");
  if (/(uv|ultraviolet)/.test(s)) vars.push("uv");
  if (vars.length === 0) vars.push("overall");
  return vars;
}

export function detectCrop(q: string): string | undefined {
  const cropMap: [string, string][] = [
    ["soybean", "soybean"], ["सोयाबीन", "soybean"],
    ["cotton", "cotton"], ["कापूस", "cotton"],
    ["wheat", "wheat"], ["गहू", "wheat"],
    ["rice", "rice"], ["तांदूळ", "rice"], ["paddy", "rice"],
    ["sugarcane", "sugarcane"], ["ऊस", "sugarcane"],
    ["onion", "onion"], ["कांदा", "onion"],
  ];
  const s = q.toLowerCase();
  const found = cropMap.find(([token]) => s.includes(token.toLowerCase()));
  return found?.[1];
}

/** Normalize the query for downstream use (keeps Devanagari intact). */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function understand(raw: string): QueryUnderstanding {
  const normalizedQuery = normalizeQuery(raw);
  const intent = detectIntent(normalizedQuery);
  const detected = detectTime(normalizedQuery);

  return {
    rawQuery: raw,
    intent,
    locationHint: normalizedQuery,
    variables: detectVariables(normalizedQuery),
    timeRange: { bucket: detected.bucket, label: detected.label },
    language: detectLanguageCode(normalizedQuery),
    cropHint: detectCrop(normalizedQuery),
    resolution: "resolved",
    normalizedQuery,
  };
}