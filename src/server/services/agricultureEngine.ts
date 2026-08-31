/**
 * WeatherGPT — Agriculture Advisory Engine.
 *
 * Deterministic rule engine over (crop, stage, weather, forecast, soil/context).
 * The crop list & rules are loaded from backend config (crops.json).
 * The LLM never invents agronomic decisions; it only explains engine output.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgricultureAdvisory,
  CropContext,
  RiskLevel,
  WeatherForecast,
  WeatherObservation,
} from "../core/models";

interface CropStage {
  id: string;
  label: string;
}

interface CropRule {
  reasonCode: string;
  condition: string;
  riskLevel: RiskLevel;
  action: string;
  window?: string;
  message: string;
}

interface CropConfig {
  id: string;
  name: string;
  aliases: string[];
  season: string;
  stages: CropStage[];
  rules: CropRule[];
}

interface CropsFile {
  crops: CropConfig[];
}

export interface AgriWeatherContext {
  observation?: WeatherObservation;
  forecast?: WeatherForecast;
}

export interface AgriResult {
  advisory: AgricultureAdvisory;
  matchedRule?: CropRule;
  crop: CropConfig;
  stage: CropStage;
}

function loadCrops(): CropConfig[] {
  const path = join(process.cwd(), "src", "server", "config", "crops.json");
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as CropsFile;
  return parsed.crops;
}

function dayMaxTemp(fc: WeatherForecast | undefined): number | undefined {
  return fc?.daily?.[0]?.tempMaxC;
}

function dayMinTemp(fc: WeatherForecast | undefined): number | undefined {
  return fc?.daily?.[0]?.tempMinC;
}

function rainSumToday(fc: WeatherForecast | undefined, obs: WeatherObservation | undefined): number {
  let sum = obs?.precipitationMm ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const h of fc?.hourly ?? []) {
    if (h.time.startsWith(today)) sum += h.precipitationMm ?? 0;
  }
  return Math.round(sum * 10) / 10;
}

function maxPopForDay(fc: WeatherForecast | undefined, dayOffset: number): number {
  if (!fc) return 0;
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const dstr = date.toISOString().slice(0, 10);
  return fc.hourly
    .filter((h) => h.time.startsWith(dstr))
    .reduce((acc, h) => Math.max(acc, h.precipitationProbability ?? 0), 0);
}

function maxWind(fc: WeatherForecast | undefined, obs: WeatherObservation | undefined): number {
  return Math.max(
    obs?.windSpeedKmh ?? 0,
    fc?.hourly?.reduce((acc, h) => Math.max(acc, h.windSpeedKmh ?? 0), 0) ?? 0
  );
}

function humidity(obs: WeatherObservation | undefined, fc: WeatherForecast | undefined): number {
  return obs?.humidityPercent ?? fc?.hourly?.[0]?.humidityPercent ?? 0;
}

interface ConditionEnv {
  rainSum: number;
  tempMax: number;
  tempMin: number;
  humidity: number;
  popToday: number;
  popTomorrow: number;
  wind: number;
}

function buildEnv(obs?: WeatherObservation, fc?: WeatherForecast): ConditionEnv {
  return {
    rainSum: rainSumToday(fc, obs),
    tempMax: dayMaxTemp(fc) ?? 0,
    tempMin: dayMinTemp(fc) ?? 0,
    humidity: humidity(obs, fc),
    popToday: maxPopForDay(fc, 0),
    popTomorrow: maxPopForDay(fc, 1),
    wind: maxWind(fc, obs),
  };
}

const NUMERIC_CONDITIONS: Record<string, (env: ConditionEnv, limit: number) => boolean> = {
  rain_sum_today_gt: (e, n) => e.rainSum > n,
  temp_max_gt: (e, n) => e.tempMax > n,
  temp_min_lt: (e, n) => e.tempMin < n,
  pop_tomorrow_gt: (e, n) => e.popTomorrow > n,
  wind_gt: (e, n) => e.wind > n,
  humidity_gt_and_pop_tomorrow_gt: (e, n) => e.humidity > n && e.popTomorrow > 60,
};

export function evalCondition(condition: string, env: ConditionEnv): boolean {
  const c = condition.trim();
  const dryAndMild = c === "dry_and_mild";
  if (dryAndMild) {
    return env.rainSum < 1 && env.popTomorrow < 40 && env.tempMax <= 35 && env.tempMax >= 15;
  }
  for (const [base, fn] of Object.entries(NUMERIC_CONDITIONS)) {
    const re = new RegExp(`^${base.replace(/_/g, "_")}_(\\d+(?:\\.\\d+)?)$`);
    const m = c.match(re);
    if (m) return fn(env, Number(m[1]));
  }
  return false;
}

export class AgricultureEngine {
  private crops: CropConfig[];

  constructor(crops?: CropConfig[]) {
    this.crops = crops ?? loadCrops();
  }

  listCrops(): { id: string; name: string; season: string; stages: CropStage[] }[] {
    return this.crops.map((c) => ({ id: c.id, name: c.name, season: c.season, stages: c.stages }));
  }

  findCrop(hint?: string): CropConfig | undefined {
    if (!hint) return undefined;
    const q = hint.toLowerCase().trim();
    return this.crops.find(
      (c) =>
        c.id === q ||
        c.name.toLowerCase() === q ||
        c.aliases.some((a) => a.toLowerCase() === q)
    );
  }

  /** core advisory computation — deterministic, prior to any LLM explanation */
  compute(ctx: CropContext, weather: AgriWeatherContext): AgricultureAdvisory | null {
    const crop = this.findCrop(ctx.crop);
    if (!crop) return null;

    const stage = crop.stages.find((s) => s.id === ctx.stage) ?? crop.stages[0];
    const env = buildEnv(weather.observation, weather.forecast);

    let matched: CropRule | null = null;
    for (const rule of crop.rules) {
      if (evalCondition(rule.condition, env)) {
        matched = rule;
        break;
      }
    }

    const fallback: CropRule = {
      reasonCode: "no_weather_trigger",
      condition: "n/a",
      riskLevel: "low",
      action: "monitor_conditions",
      window: "next_48h",
      message: `No immediate weather trigger identified for ${crop.name} at the ${stage.label} stage. Continue routine monitoring and follow local agronomic guidance.`,
    };
    const rule = matched ?? fallback;

    const advisory: AgricultureAdvisory = {
      crop: crop.id,
      stage: stage.id,
      action: rule.action,
      actionReason: rule.message,
      reasonCodes: [rule.reasonCode, env.popTomorrow >= 60 ? "rain_expected_soon" : undefined].filter(Boolean) as string[],
      riskLevel: rule.riskLevel,
      window: rule.window ?? "next_48h",
      advisoryType: "weather_derived",
      evidenceRefs: [],
      disclaimer:
        "This is a weather-derived recommendation from regional weather data, not professional agronomic advice. " +
        "Conditions may change; consult local agricultural extension services before significant decisions.",
    };

    return advisory;
  }
}

export const agricultureEngine = new AgricultureEngine();