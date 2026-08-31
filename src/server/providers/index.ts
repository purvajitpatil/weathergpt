/**
 * WeatherGPT — Provider registry & data-mode resolution.
 *
 * mode resolution:
 *   on   => always demo fixture data (development/demonstration)
 *   off  => always real provider data; fail if unavailable
 *   auto => try live provider; fall back to demo only if live is unreachable,
 *           and surface `mode: "demo"` to the caller so the UI can label it.
 *
 * Provider architecture (as recommended):
 *   FRONTEND → YOUR API → Services → Providers
 *   This gives provider independence — if Open-Meteo changes, swap providers.
 */
import type { AppConfig } from "../config";
import { logger } from "../logger";
import { OpenMeteoProvider } from "./openMeteo";
import { OpenMeteoGeocodingProvider } from "./geocoding";
import { OpenAqProvider } from "./openAq";
import { NasaPowerProvider } from "./nasaPower";
import { FloodApiProvider } from "./floodApi";
import { ElevationApiProvider } from "./elevationApi";
import { createDemoProviders, DemoProviderFactory } from "./demo";
import type { WeatherProvider, GeolocationProvider } from "./types";

export type DataMode = "live" | "demo";

export interface ProviderRegistry {
  mode: DataMode;
  weather: WeatherProvider;
  geocoding: GeolocationProvider;
  airQuality: OpenAqProvider;
  historical: NasaPowerProvider;
  flood: FloodApiProvider;
  elevation: ElevationApiProvider;
  demo: DemoProviderFactory | null;
  /** switch the whole stack to demo mode (used by auto-fallback) */
  switchToDemo(): void;
}

let registry: ProviderRegistry | null = null;

async function liveHealthOk(weather: OpenMeteoProvider, timeoutMs: number): Promise<boolean> {
  try {
    return await weather.health();
  } catch {
    return false;
  }
}

export async function createProviderRegistry(cfg: AppConfig): Promise<ProviderRegistry> {
  const demo = createDemoProviders();

  if (cfg.demoMode === "on") {
    logger.info("Data mode: DEMO (explicit)");
    return makeRegistry("demo", demo.weather, demo.geocoding);
  }

  const liveWeather = new OpenMeteoProvider();
  const liveGeo = new OpenMeteoGeocodingProvider();
  const openAq = new OpenAqProvider();
  const nasaPower = new NasaPowerProvider();
  const flood = new FloodApiProvider();
  const elevation = new ElevationApiProvider();

  if (cfg.demoMode === "off") {
    logger.info("Data mode: LIVE (explicit, no fallback)");
    return makeRegistry("live", liveWeather, liveGeo, openAq, nasaPower, flood, elevation);
  }

  // auto mode
  const ok = await liveHealthOk(liveWeather, 5_000);
  if (ok) {
    logger.info("Data mode: LIVE (auto-detected, Open-Meteo reachable)");
    return makeRegistry("live", liveWeather, liveGeo, openAq, nasaPower, flood, elevation);
  }

  logger.warn("Open-Meteo unreachable — falling back to DEMO fixture data (clearly labeled)");
  return makeRegistry("demo", demo.weather, demo.geocoding);
}

function makeRegistry(
  mode: DataMode,
  weather: WeatherProvider,
  geocoding: GeolocationProvider,
  airQuality?: OpenAqProvider,
  historical?: NasaPowerProvider,
  flood?: FloodApiProvider,
  elevation?: ElevationApiProvider
): ProviderRegistry {
  const demo = createDemoProviders();
  registry = {
    mode,
    weather,
    geocoding,
    airQuality: airQuality ?? new OpenAqProvider(),
    historical: historical ?? new NasaPowerProvider(),
    flood: flood ?? new FloodApiProvider(),
    elevation: elevation ?? new ElevationApiProvider(),
    demo,
    switchToDemo() {
      if (this.mode === "demo") return;
      logger.warn("Switching data mode to DEMO (live provider became unavailable at runtime)");
      this.mode = "demo";
      this.weather = demo.weather;
      this.geocoding = demo.geocoding;
    },
  };
  return registry;
}

export function getRegistry(): ProviderRegistry {
  if (!registry) {
    throw new Error("Provider registry not initialized. Call createProviderRegistry() at boot.");
  }
  return registry;
}
