export interface WeatherStats {
  rainChance: number;
  tempMax: number;
  tempMin: number;
  wind: number;
  humidity: number;
  cloudCover: number;
  pressure?: number;
  uvIndex?: number;
  visibility?: string;
}

export interface SourceInfo {
  name: string;
  updatedAt: string;
  reliabilityScore?: number;
}

export interface MapThumbnailData {
  title: string;
  timeBadge: string;
  location: string;
  zoom?: number;
  imageUrl?: string;
  precipitationType?: "rain" | "storm" | "clear" | "clouds";
}

export interface AssistantStructuredData {
  summaryText: string;
  stats: WeatherStats;
  recommendation: string;
  source: SourceInfo;
  location: string;
  mapData?: MapThumbnailData;
  followUpSuggestions?: string[];
  /** LIVE vs DEMO — drives honest UI labeling (never pretend DEMO is real) */
  mode?: 'live' | 'demo';
  /** e.g. "Open-Meteo (GFS/ICON based)" or "Demo Provider (deterministic fixture)" */
  dataSourceLabel?: string;
  disclaimer?: string;
  /** count of evidence items backing this answer */
  evidenceCount?: number;
  llmUsed?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text?: string;
  structuredData?: AssistantStructuredData;
  timestamp: string;
}

export interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "advisory";
  title: string;
  location: string;
  message: string;
  fullDetails?: string;
  instructions?: string[];
  source: string;
  timestampRelative: string;
  issuedAt?: string;
  expiresAt?: string;
  affectedDistricts?: string[];
}

export interface AQIData {
  value: number;
  label: "Good" | "Moderate" | "Poor" | "Unhealthy" | "Severe";
  location: string;
  updatedAt: string;
  pm25: number;
  pm10: number;
  no2: number;
  o3: number;
  co: number;
  so2: number;
  advice: string;
}

export interface LocationWeather {
  city: string;
  state: string;
  country: string;
  temp: number;
  feelsLike: number;
  condition: string;
  high: number;
  low: number;
  humidity: number;
  windSpeed: number;
  aqi: number;
  aqiLabel: "Good" | "Moderate" | "Poor" | "Unhealthy" | "Severe";
  banner?: string;
  bgImage?: string;
  forecastHourly?: Array<{ time: string; temp: number; icon: string; pop: number }>;
  /** LIVE vs DEMO — drives honest labeling */
  dataMode?: 'live' | 'demo';
  dataSourceLabel?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag?: string;
}
