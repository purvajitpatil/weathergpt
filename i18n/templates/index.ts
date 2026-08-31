/**
 * WeatherGPT — Slot Templates
 *
 * Numbers never pass through a language model.
 * They're formatted by code and injected into per-language templates.
 * The LLM receives the rendered template and is asked only to make it
 * conversational, with an explicit instruction that numbers, place names
 * and times are immutable.
 */

import type { ResponseLang, AnswerObject, Fact } from "../../shared/contracts/answer";
import { getWarningText } from "../../src/server/providers/imd/warningCodes";

// ─── Number Formatting ──────────────────────────────────────────────────────

const LOCALE_MAP: Record<ResponseLang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};

export function fmtNum(n: number, lang: ResponseLang, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE_MAP[lang], {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

export function fmtTime(iso: string, lang: ResponseLang): string {
  return new Date(iso).toLocaleTimeString(LOCALE_MAP[lang], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: lang === "en",
  });
}

// ─── Fact Lookup ────────────────────────────────────────────────────────────

function getFact(facts: Fact[], key: string): number | string | undefined {
  return facts.find((f) => f.key === key)?.value;
}

function getFactNum(facts: Fact[], key: string): number | undefined {
  const v = getFact(facts, key);
  return typeof v === "number" ? v : undefined;
}

// ─── Templates ──────────────────────────────────────────────────────────────

interface TemplateSet {
  en: string;
  hi: string;
  mr: string;
}

function render(template: TemplateSet, lang: ResponseLang, vars: Record<string, string>): string {
  let text = template[lang] ?? template.en;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, value);
  }
  return text;
}

// ─── Forecast Template ──────────────────────────────────────────────────────

const FORECAST_TEMPLATES: TemplateSet = {
  en: "{district}: {rainProb}% chance of rain between {from} and {to}. Max {tmax}°C, min {tmin}°C.",
  hi: "{district}: {from} से {to} के बीच बारिश की {rainProb}% संभावना। अधिकतम {tmax}°C, न्यूनतम {tmin}°C।",
  mr: "{district}: {from} ते {to} दरम्यान पावसाची {rainProb}% शक्यता. कमाल {tmax}°C, किमान {tmin}°C.",
};

// ─── Current Weather Template ───────────────────────────────────────────────

const CURRENT_TEMPLATES: TemplateSet = {
  en: "{district}: Currently {temp}°C, feels like {feelsLike}°C. {condition}. Humidity {humidity}%, wind {wind} km/h.",
  hi: "{district}: अभी {temp}°C, महसूस {feelsLike}°C। {condition}। नमी {humidity}%, हवा {wind} km/h।",
  mr: "{district}: आत्ता {temp}°C, जाणवते {feelsLike}°C। {condition}। दमट {humidity}%, वारा {wind} km/h।",
};

// ─── Warning Template ───────────────────────────────────────────────────────

const WARNING_TEMPLATES: TemplateSet = {
  en: "⚠️ {severityLabel} WARNING for {district}: {warningText}. Valid until {validUpto}.",
  hi: "⚠️ {district} के लिए {severityLabel} चेतावनी: {warningText}। {validUpto} तक मान्य।",
  mr: "⚠️ {district}साठी {severityLabel} चेतावणी: {warningText}। {validUpto} पर्यंत मान्य।",
};

// ─── Agriculture Template ───────────────────────────────────────────────────

const AGRI_TEMPLATES: TemplateSet = {
  en: "{district}: For {crop} ({stage}): {action}. Reason: {reason}.",
  hi: "{district}: {crop} ({stage}) के लिए: {action}। कारण: {reason}।",
  mr: "{district}: {crop} ({stage}) साठी: {action}। कारण: {reason}।",
};

// ─── Flood Risk Template ────────────────────────────────────────────────────

const FLOOD_TEMPLATES: TemplateSet = {
  en: "{district}: Flood risk {floodLevel}. River discharge: {discharge} m³/s (mean: {mean} m³/s).",
  hi: "{district}: बाढ़ का जोखिम {floodLevel}। नदी प्रवाह: {discharge} m³/s (औसत: {mean} m³/s)।",
  mr: "{district}: पूरचा धोका {floodLevel}। नदी प्रवाह: {discharge} m³/s (सरासरी: {mean} m³/s)।",
};

// ─── Main Render Function ───────────────────────────────────────────────────

/**
 * Render an AnswerObject into a slot-template text.
 * Numbers are formatted by code, never by LLM.
 * The LLM will receive this and only make it conversational.
 */
export function renderSlotTemplate(answer: AnswerObject, lang: ResponseLang): string {
  const { intent, location, facts, warning, risk } = answer;
  const district = location.districtName;

  switch (intent) {
    case "forecast": {
      const rainProb = getFactNum(facts, "rain_probability") ?? 0;
      const tmax = getFactNum(facts, "temp_max") ?? 0;
      const tmin = getFactNum(facts, "temp_min") ?? 0;
      return render(FORECAST_TEMPLATES, lang, {
        district,
        rainProb: fmtNum(rainProb, lang),
        from: "6:00 AM",
        to: "6:00 PM",
        tmax: fmtNum(tmax, lang),
        tmin: fmtNum(tmin, lang),
      });
    }

    case "current": {
      const temp = getFactNum(facts, "temperature") ?? 0;
      const feelsLike = getFactNum(facts, "feels_like") ?? temp;
      const humidity = getFactNum(facts, "humidity") ?? 0;
      const wind = getFactNum(facts, "wind_speed") ?? 0;
      const condition = String(getFact(facts, "condition") ?? "—");
      return render(CURRENT_TEMPLATES, lang, {
        district,
        temp: fmtNum(temp, lang),
        feelsLike: fmtNum(feelsLike, lang),
        condition,
        humidity: fmtNum(humidity, lang),
        wind: fmtNum(wind, lang),
      });
    }

    case "warning": {
      const severityLabel = warning.severity.toUpperCase();
      const warningText = warning.active
        ? getWarningText(warning.codes[0] ?? 1, lang === "mr" ? "mr" : lang === "hi" ? "hi" : "en")
        : lang === "hi"
        ? "कोई सक्रिय चेतावनी नहीं"
        : lang === "mr"
        ? "कोणतीही सक्रिय चेतावणी नाही"
        : "No active warning";
      const validUpto = warning.validUpto ? fmtTime(warning.validUpto, lang) : "—";
      return render(WARNING_TEMPLATES, lang, {
        district,
        severityLabel,
        warningText,
        validUpto,
      });
    }

    case "risk": {
      const score = risk?.score ?? 0;
      const band = risk?.band ?? "unknown";
      const floodLevel = band === "severe" ? "HIGH" : band === "high" ? "ELEVATED" : "LOW";
      const discharge = String(getFact(facts, "river_discharge") ?? "—");
      const mean = String(getFact(facts, "river_discharge_mean") ?? "—");
      return render(FLOOD_TEMPLATES, lang, {
        district,
        floodLevel,
        discharge,
        mean,
      });
    }

    case "advisory": {
      const crop = String(getFact(facts, "crop") ?? "crop");
      const stage = String(getFact(facts, "stage") ?? "unknown");
      const action = String(getFact(facts, "action") ?? "Monitor conditions");
      const reason = String(getFact(facts, "reason") ?? "Weather conditions");
      return render(AGRI_TEMPLATES, lang, {
        district,
        crop,
        stage,
        action,
        reason,
      });
    }

    default: {
      // Generic fallback — use facts to build a sentence
      const factTexts = facts
        .slice(0, 3)
        .map((f) => `${f.key}: ${f.value}${f.unit ? f.unit : ""}`)
        .join(", ");
      return `${district}: ${factTexts || "Data available"}`;
    }
  }
}
