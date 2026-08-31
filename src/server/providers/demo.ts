/**
 * WeatherGPT — Demo provider.
 *
 * Serves deterministic fixture data for development and SIH demos.
 * Every returned object carries `isDemo: true` provenance so the UI can
 * always distinguish LIVE from DEMO data. This provider NEVER masquerades
 * as IMD or as a live sensor/radar feed.
 */
import {
  DEMO_CITIES,
  DEMO_ALERTS,
  DEMO_SOURCE_LABEL,
} from "../../../demo/weatherFixture";
import type {
  ResolvedLocation,
  WeatherObservation,
  WeatherForecast,
  HourlyForecastPoint,
  DailyForecastPoint,
  AirQualityObservation,
  Alert,
  Provenance,
} from "../core/models";
import { WeatherProvider, AlertIngestionSource, AlertIngestionRecord, GeolocationProvider } from "./types";

function nowISO(): string {
  return new Date().toISOString();
}

function provenance(validForMinutes: number): Provenance {
  const n = new Date();
  return {
    provider: "demo",
    sourceLabel: DEMO_SOURCE_LABEL,
    sourceUrl: undefined,
    retrievedAt: n.toISOString(),
    validFrom: n.toISOString(),
    validUntil: new Date(n.getTime() + validForMinutes * 60_000).toISOString(),
    dataVersion: "demo-fixture-v1",
    isDemo: true,
  };
}

function findCity(location: ResolvedLocation) {
  const city = DEMO_CITIES.find(
    (c) =>
      c.location.name.toLowerCase() === location.name.toLowerCase() ||
      c.location.fullLabel.toLowerCase() === location.fullLabel.toLowerCase()
  );
  // default to Pune so demo mode is always deterministic
  return city ?? DEMO_CITIES[0];
}

/** Deterministic function of the hour so demo mode feels alive but is never random. */
function driftFor(hour: number, base: number, amplitude: number): number {
  return Math.round((base + Math.sin((hour + base) / 5) * amplitude + Math.cos(hour / 3) * amplitude * 0.5) * 10) / 10;
}

const AQI_BY_CITY: Record<string, number> = {
  pune: 42,
  mumbai: 68,
  manali: 18,
  kochi: 28,
  delhi: 142,
  bengaluru: 35,
};

export class DemoWeatherProvider implements WeatherProvider {
  readonly id = "demo";
  readonly label = DEMO_SOURCE_LABEL;
  readonly isDemo = true;
  readonly capabilities = {
    current: true,
    forecast: true,
    hourly: true,
    historical: true,
    airQuality: true,
    alerts: true, // enabled ONLY because the demo alert ingestion source is demo
  } as const;

  async getCurrent(location: ResolvedLocation): Promise<WeatherObservation> {
    const city = findCity(location);
    const c = city.current;
    const hour = new Date().getHours();
    return {
      location: city.location,
      timestamp: nowISO(),
      temperatureC: driftFor(hour, c.tempC, 1.2),
      feelsLikeC: driftFor(hour, c.feelsLikeC, 1.2),
      humidityPercent: Math.round(driftFor(hour, c.humidityPct, 4)),
      pressureHpa: Math.round(driftFor(hour, c.pressureHpa, 2)),
      windSpeedKmh: Math.round(driftFor(hour, c.windKmh, 3)),
      windDirectionDeg: c.windDeg,
      precipitationMm: c.precipMm,
      precipitationProbability: c.popPct,
      cloudCoverPercent: Math.round(driftFor(hour, c.cloudPct, 8)),
      uvIndex: c.uv,
      weatherText: c.weatherText,
      provenance: provenance(30),
    };
  }

  async getForecast(location: ResolvedLocation): Promise<WeatherForecast> {
    const city = findCity(location);
    const baseHour = new Date().getHours();
    const start = new Date();
    start.setMinutes(0, 0, 0);

    const hourly: HourlyForecastPoint[] = Array.from({ length: 12 }, (_, i) => {
      const t = new Date(start.getTime() + (i + 1) * 3600_000);
      const isEveningPeak = t.getHours() >= 16 && t.getHours() <= 20 && city.slug === "pune";
      const pop = city.slug === "pune" && t.getHours() >= 16 && t.getHours() <= 20
        ? Math.min(96, city.current.popPct + 10)
        : Math.max(5, city.current.popPct - 10);
      return {
        time: t.toISOString(),
        temperatureC: driftFor(t.getHours(), city.current.tempC, 1.5) + (isEveningPeak ? -1 : 0),
        humidityPercent: Math.round(driftFor(t.getHours(), city.current.humidityPct, 5)),
        precipitationProbability: pop,
        precipitationMm: isEveningPeak ? 2.4 : pop > 60 ? 0.8 : 0,
        weatherText: isEveningPeak ? "Moderate rain" : pop > 60 ? "Rain showers likely" : "Partly cloudy",
        cloudCoverPercent: Math.round(driftFor(t.getHours(), city.current.cloudPct, 10)),
        windSpeedKmh: Math.round(driftFor(t.getHours(), city.current.windKmh, 4)),
      };
    });

    const daily: DailyForecastPoint[] = city.daily.map((d) => {
      const date = new Date();
      date.setDate(date.getDate() + d.dateOffset);
      return {
        date: date.toISOString().slice(0, 10),
        tempMaxC: d.tempMaxC,
        tempMinC: d.tempMinC,
        precipitationProbabilityMax: d.popPct,
        weatherText: d.weatherText,
        sunrise: undefined,
        sunset: undefined,
      };
    });

    return {
      location: city.location,
      generatedAt: nowISO(),
      hourly,
      daily,
      provenance: { ...provenance(60), validUntil: hourly[hourly.length - 1]?.time },
    };
  }

  async getAirQuality(location: ResolvedLocation): Promise<AirQualityObservation> {
    const city = findCity(location);
    const aqi = AQI_BY_CITY[city.slug] ?? 40;
    return {
      location: city.location,
      timestamp: nowISO(),
      usAqi: aqi,
      pm25: aqi <= 50 ? 12 : aqi <= 100 ? 38 : 78,
      pm10: aqi <= 50 ? 28 : aqi <= 100 ? 65 : 124,
      provenance: provenance(90),
    };
  }

  getWarnings(): Promise<unknown> {
    const alerts = buildDemoAlerts();
    return Promise.resolve(alerts);
  }

  async health(): Promise<boolean> {
    return true; // demo provider is always "available" (it is local deterministic data)
  }
}

function buildDemoAlerts(): Alert[] {
  const now = new Date();
  return DEMO_ALERTS.map((a, idx) => {
    const issuedAt = new Date(now.getTime() + a.issuedOffsetMinutes * 60_000);
    const expiresAt = new Date(now.getTime() + a.expiresInMinutes * 60_000);
    return {
      id: a.id,
      source: DEMO_SOURCE_LABEL,
      sourceAlertId: a.id,
      hazardType: a.hazardType,
      severity: a.severity,
      title: a.title,
      description: a.description,
      instructions: a.instructions,
      affectedAreas: a.affectedAreas,
      affectedDistricts: a.affectedDistricts,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      language: "en",
      isActive: expiresAt.getTime() > now.getTime(),
      provenance: provenance(30),
      createdAt: now.toISOString(),
    };
  });
}

export class DemoAlertSource implements AlertIngestionSource {
  readonly id = "demo-alert-source";
  readonly label = DEMO_SOURCE_LABEL;
  readonly isDemo = true;

  async fetchAlerts(): Promise<AlertIngestionRecord[]> {
    return DEMO_ALERTS.map((a, idx) => {
      const now = new Date();
      return {
        sourceAlertId: a.id,
        hazardType: a.hazardType,
        severity: a.severity,
        title: a.title,
        description: a.description,
        instructions: a.instructions,
        affectedAreas: a.affectedAreas,
        affectedDistricts: a.affectedDistricts,
        issuedAt: new Date(now.getTime() + a.issuedOffsetMinutes * 60_000).toISOString(),
        expiresAt: new Date(now.getTime() + a.expiresInMinutes * 60_000).toISOString(),
        language: "en",
        geometry: undefined,
        meta: { fixtureId: idx },
      };
    });
  }
}

export class DemoGeolocationProvider implements GeolocationProvider {
  readonly id = "demo-geocoding";
  readonly isDemo = true;

  async search(query: string): Promise<ResolvedLocation[]> {
    const q = query.toLowerCase().trim();
    return DEMO_CITIES
      .filter((c) => c.slug.includes(q) || c.location.name.toLowerCase().includes(q) || c.location.fullLabel.toLowerCase().includes(q))
      .map((c) => c.location);
  }

  async reverse(lat: number, lon: number): Promise<ResolvedLocation | null> {
    // coarse nearest-city match on fixture coordinates (demo only)
    let best: ResolvedLocation | null = null;
    let bestDist = Infinity;
    for (const c of DEMO_CITIES) {
      const d = (c.location.latitude - lat) ** 2 + (c.location.longitude - lon) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = c.location;
      }
    }
    return best;
  }
}

export interface DemoProviderFactory {
  weather: DemoWeatherProvider;
  alertSource: DemoAlertSource;
  geocoding: GeolocationProvider;
}

export function createDemoProviders(): DemoProviderFactory {
  return { weather: new DemoWeatherProvider(), alertSource: new DemoAlertSource(), geocoding: new DemoGeolocationProvider() };
}