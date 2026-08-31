/**
 * WeatherGPT — typed API client (frontend).
 *
 * Talks to the v1 backend API and maps responses into the UI's view models.
 * The `mode` field (LIVE vs DEMO) from the server drives honest labeling.
 */
import type { AssistantStructuredData, LocationWeather, AlertItem, AQIData } from '../types';

export type DataMode = 'live' | 'demo';

export interface ApiMeta {
  mode: DataMode;
  sources: string[];
  retrievedAt?: string;
  model?: string;
  demoModeConfigured?: string;
}

// ─── server payloads (subset used by the UI) ─────────────────────────────────

export interface ServerLocation {
  name: string;
  district?: string;
  state?: string;
  country?: string;
  latitude: number;
  longitude: number;
  fullLabel: string;
  source: string;
  isDemo: boolean;
}

export interface ServerObservation {
  temperatureC?: number;
  feelsLikeC?: number;
  humidityPercent?: number;
  pressureHpa?: number;
  windSpeedKmh?: number;
  precipitationMm?: number;
  weatherText?: string;
  provenance: { sourceLabel: string; retrievedAt: string; validUntil?: string; isDemo: boolean };
}

export interface ServerDailyPoint {
  date: string;
  tempMaxC?: number;
  tempMinC?: number;
  precipitationProbabilityMax?: number;
}

export interface ServerForecast {
  daily: ServerDailyPoint[];
  provenance: { sourceLabel: string; retrievedAt: string; validUntil?: string; isDemo: boolean };
}

export interface ServerAqi {
  usAqi?: number;
  pm25?: number;
  pm10?: number;
  provenance: { sourceLabel: string; retrievedAt: string; isDemo: boolean };
}

export interface ServerAlert {
  id: string;
  severity: 'red' | 'orange' | 'yellow' | 'green';
  title: string;
  description: string;
  instructions?: string[];
  affectedAreas: string[];
  issuedAt: string;
  expiresAt: string;
  source: string;
  provenance: { isDemo: boolean };
}

export interface ServerRisk {
  riskScore: number;
  riskLevel: string;
  reasonCodes: string[];
  calibratedProbability?: number;
  officialAlertSeverity?: string;
  isDemo: boolean;
}

export interface WeatherDataPayload {
  mode: DataMode;
  location: ServerLocation;
  current?: ServerObservation;
  forecast?: ServerForecast;
  aqi?: ServerAqi;
  alerts: ServerAlert[];
  risk?: ServerRisk;
  sources: { label: string; retrievedAt?: string; validUntil?: string; isDemo: boolean }[];
}

export interface ChatDataPayload {
  query: string;
  understanding: { intent: string; language: string };
  location: ServerLocation;
  current?: ServerObservation;
  alerts: ServerAlert[];
  risk?: ServerRisk;
  chat: {
    answer: string;
    language: string;
    severity: string;
    recommendation: string;
    disclaimer?: string;
    followUpSuggestions: string[];
    statistics: {
      rainChance?: number; tempMax?: number; tempMin?: number; wind?: number;
      humidity?: number; cloudCover?: number; pressure?: number; uvIndex?: number;
    };
  };
  evidence: unknown[];
  sources: { label: string; retrievedAt?: string; validUntil?: string; isDemo: boolean }[];
  mode: DataMode;
  llmUsed: boolean;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const json = (await res.json()) as { data?: T; meta?: ApiMeta } & T;
  return (json?.data ?? json) as T;
}

async function post<T>(url: string, body: unknown): Promise<{ data: T; meta?: ApiMeta }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err.error?.message) message = err.error.message;
    } catch { /* fall back to status */ }
    throw new Error(`POST ${url} → ${message}`);
  }
  return (await res.json()) as { data: T; meta?: ApiMeta };
}

// ─── client ──────────────────────────────────────────────────────────────────

export const api = {
  meta(): Promise<ApiMeta> {
    return get(`/api/v1/meta`);
  },

  weather(location: string): Promise<WeatherDataPayload> {
    return get(`/api/v1/weather?location=${encodeURIComponent(location)}`);
  },

  chat(query: string, location: string, language = 'en'): Promise<{ data: ChatDataPayload; meta?: ApiMeta }> {
    return post(`/api/v1/chat`, { query, location, language });
  },

  alerts(location?: string): Promise<{ alerts: ServerAlert[]; mode: DataMode; officialWarningsConfigured: boolean }> {
    const q = location ? `?location=${encodeURIComponent(location)}` : '';
    return get(`/api/v1/alerts${q}`);
  },
};

// ─── mappers ─────────────────────────────────────────────────────────────────

export function mapWeatherToLocationWeather(data: WeatherDataPayload): LocationWeather {
  const cur = data.current;
  const daily = data.forecast?.daily?.[0];
  const aqi = data.aqi;
  const sourceLabel = data.sources.find((s) => !s.isDemo)?.label ?? data.sources[0]?.label ?? '—';
  let aqiLabel: LocationWeather['aqiLabel'] = 'Good';
  if ((aqi?.usAqi ?? 0) >= 301) aqiLabel = 'Severe';
  else if ((aqi?.usAqi ?? 0) >= 201) aqiLabel = 'Unhealthy';
  else if ((aqi?.usAqi ?? 0) >= 101) aqiLabel = 'Poor';
  else if ((aqi?.usAqi ?? 0) >= 51) aqiLabel = 'Moderate';

  return {
    city: data.location.name,
    state: data.location.state ?? '',
    country: data.location.country ?? 'India',
    temp: Math.round(cur?.temperatureC ?? 0),
    feelsLike: Math.round(cur?.feelsLikeC ?? cur?.temperatureC ?? 0),
    condition: cur?.weatherText ?? '—',
    high: Math.round(daily?.tempMaxC ?? cur?.temperatureC ?? 0),
    low: Math.round(daily?.tempMinC ?? cur?.temperatureC ?? 0),
    humidity: Math.round(cur?.humidityPercent ?? 0),
    windSpeed: Math.round(cur?.windSpeedKmh ?? 0),
    aqi: aqi?.usAqi ?? 0,
    aqiLabel,
    dataMode: data.mode,
    dataSourceLabel: sourceLabel,
  };
}

export function mapChatToStructured(data: ChatDataPayload): AssistantStructuredData {
  const src = data.sources[0];
  const mode = data.mode;
  const current = data.current;
  const stats = data.chat.statistics ?? {};
  const dailyMax = stats.tempMax;
  const relevantAlert = data.alerts.find((a) => a.severity === 'red' || a.severity === 'orange');
  return {
    summaryText: data.chat.answer,
    stats: {
      rainChance: stats.rainChance ?? 0,
      tempMax: stats.tempMax ?? dailyMax ?? 0,
      tempMin: stats.tempMin ?? 0,
      wind: stats.wind ?? 0,
      humidity: stats.humidity ?? 0,
      cloudCover: stats.cloudCover ?? 0,
      pressure: stats.pressure,
      uvIndex: stats.uvIndex,
    },
    recommendation: data.chat.recommendation,
    source: {
      name: src?.label ?? '—',
      updatedAt: src?.retrievedAt ? new Date(src.retrievedAt).toISOString() : '',
    },
    location: data.location.fullLabel,
    followUpSuggestions: data.chat.followUpSuggestions ?? [],
    mode,
    dataSourceLabel: src?.label,
    disclaimer: data.chat.disclaimer,
    evidenceCount: data.evidence?.length ?? 0,
    llmUsed: data.llmUsed,
    mapData: mode === 'demo'
      ? undefined
      : {
          title: 'Precipitation Outlook',
          timeBadge: current ? new Date(current.provenance.retrievedAt ?? Date.now()).toISOString() : '',
          location: data.location.fullLabel,
          precipitationType: (stats.rainChance ?? 0) >= 60 ? 'rain' : 'clouds',
        },
  };
}

const SEV_RANK: Record<string, AlertItem['severity']> = {
  red: 'critical',
  orange: 'warning',
  yellow: 'warning',
  green: 'advisory',
};

export function mapAlertsToItems(alerts: ServerAlert[]): AlertItem[] {
  return alerts.map((a) => ({
    id: a.id,
    severity: SEV_RANK[a.severity] ?? 'advisory',
    title: a.title,
    location: a.affectedAreas?.[0] ?? '',
    message: a.description,
    fullDetails: a.description,
    instructions: a.instructions,
    source: a.source,
    timestampRelative: timeAgo(a.issuedAt),
    issuedAt: a.issuedAt,
    expiresAt: a.expiresAt,
    affectedDistricts: a.affectedAreas,
  }));
}

export function mapAqi(aqi?: ServerAqi): AQIData | null {
  if (!aqi || aqi.usAqi === undefined) return null;
  let label: AQIData['label'] = 'Good';
  if (aqi.usAqi >= 301) label = 'Severe';
  else if (aqi.usAqi >= 201) label = 'Unhealthy';
  else if (aqi.usAqi >= 151) label = 'Poor';
  else if (aqi.usAqi >= 51) label = 'Moderate';
  return {
    value: aqi.usAqi,
    label,
    location: '—',
    updatedAt: aqi.provenance.retrievedAt,
    pm25: aqi.pm25 ?? 0,
    pm10: aqi.pm10 ?? 0,
    no2: 0, o3: 0, co: 0, so2: 0,
    advice: aqi.usAqi <= 100 ? 'Air quality is acceptable.' : 'Sensitive groups should limit outdoor exertion.',
  };
}

export function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}