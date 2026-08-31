/**
 * WeatherGPT — DEMO FIXTURE DATA.
 *
 * IMPORTANT POLICY: Everything in /demo is deterministic fixture data used ONLY
 * for development and SIH demonstrations. It is NEVER labeled as live data,
 * IMD, radar, or official. Consumers must propagate `isDemo: true`.
 *
 * All temperatures/forecasts here are illustrative and NOT real observations.
 */
import type {
  ResolvedLocation,
  Severity,
  HazardType,
} from "../src/server/core/models";

export interface DemoCityWeather {
  slug: string;
  location: ResolvedLocation;
  current: {
    tempC: number;
    feelsLikeC: number;
    humidityPct: number;
    pressureHpa: number;
    windKmh: number;
    windDeg: number;
    precipMm: number;
    popPct: number;
    cloudPct: number;
    uv: number;
    weatherText: string;
  };
  daily: { dateOffset: number; tempMaxC: number; tempMinC: number; popPct: number; weatherText: string }[];
}

export interface DemoAlertFixture {
  id: string;
  hazardType: HazardType;
  severity: Severity;
  title: string;
  description: string;
  instructions: string[];
  affectedAreas: string[];
  affectedDistricts?: string[];
  /** minutes until expiry from fixture creation */
  expiresInMinutes: number;
  issuedOffsetMinutes: number;
}

export const DEMO_SOURCE_LABEL = "Demo Provider (deterministic fixture)";

export const DEMO_CITIES: DemoCityWeather[] = [
  {
    slug: "pune",
    location: {
      name: "Pune",
      state: "Maharashtra",
      country: "India",
      countryCode: "IN",
      latitude: 18.5204,
      longitude: 73.8567,
      timezone: "Asia/Kolkata",
      fullLabel: "Pune, Maharashtra, India",
      source: "demo",
      isDemo: true,
    },
    current: {
      tempC: 26, feelsLikeC: 28, humidityPct: 65, pressureHpa: 1008,
      windKmh: 14, windDeg: 270, precipMm: 0.2, popPct: 72, cloudPct: 85,
      uv: 3, weatherText: "Partly cloudy",
    },
    daily: [
      { dateOffset: 0, tempMaxC: 29, tempMinC: 21, popPct: 70, weatherText: "Rain in the evening" },
      { dateOffset: 1, tempMaxC: 28, tempMinC: 21, popPct: 85, weatherText: "Heavy rain expected evening" },
      { dateOffset: 2, tempMaxC: 30, tempMinC: 22, popPct: 40, weatherText: "Thundery showers" },
    ],
  },
  {
    slug: "mumbai",
    location: {
      name: "Mumbai",
      state: "Maharashtra",
      country: "India",
      countryCode: "IN",
      latitude: 19.076,
      longitude: 72.8777,
      timezone: "Asia/Kolkata",
      fullLabel: "Mumbai, Maharashtra, India",
      source: "demo",
      isDemo: true,
    },
    current: {
      tempC: 31, feelsLikeC: 36, humidityPct: 82, pressureHpa: 1009,
      windKmh: 21, windDeg: 240, precipMm: 1.5, popPct: 65, cloudPct: 75,
      uv: 5, weatherText: "Humid and overcast",
    },
    daily: [
      { dateOffset: 0, tempMaxC: 33, tempMinC: 26, popPct: 65, weatherText: "Humid, evening showers" },
      { dateOffset: 1, tempMaxC: 32, tempMinC: 26, popPct: 70, weatherText: "Coastal showers" },
      { dateOffset: 2, tempMaxC: 33, tempMinC: 26, popPct: 55, weatherText: "Partly cloudy, thundery" },
    ],
  },
  {
    slug: "manali",
    location: {
      name: "Manali",
      state: "Himachal Pradesh",
      country: "India",
      countryCode: "IN",
      latitude: 32.2396,
      longitude: 77.1887,
      timezone: "Asia/Kolkata",
      fullLabel: "Manali, Himachal Pradesh, India",
      source: "demo",
      isDemo: true,
    },
    current: {
      tempC: 14, feelsLikeC: 12, humidityPct: 48, pressureHpa: 1018,
      windKmh: 10, windDeg: 200, precipMm: 0, popPct: 10, cloudPct: 15,
      uv: 6, weatherText: "Clear and crisp",
    },
    daily: [
      { dateOffset: 0, tempMaxC: 17, tempMinC: 8, popPct: 10, weatherText: "Clear" },
      { dateOffset: 1, tempMaxC: 16, tempMinC: 7, popPct: 20, weatherText: "Partly cloudy" },
      { dateOffset: 2, tempMaxC: 15, tempMinC: 6, popPct: 30, weatherText: "Cloudy, possible snow" },
    ],
  },
  {
    slug: "kochi",
    location: {
      name: "Kochi",
      state: "Kerala",
      country: "India",
      countryCode: "IN",
      latitude: 9.9312,
      longitude: 76.2673,
      timezone: "Asia/Kolkata",
      fullLabel: "Kochi, Kerala, India",
      source: "demo",
      isDemo: true,
    },
    current: {
      tempC: 29, feelsLikeC: 33, humidityPct: 88, pressureHpa: 1010,
      windKmh: 16, windDeg: 200, precipMm: 3.2, popPct: 75, cloudPct: 85,
      uv: 4, weatherText: "Tropical showers",
    },
    daily: [
      { dateOffset: 0, tempMaxC: 31, tempMinC: 24, popPct: 75, weatherText: "Rain spells" },
      { dateOffset: 1, tempMaxC: 30, tempMinC: 24, popPct: 80, weatherText: "Heavy monsoon rain" },
      { dateOffset: 2, tempMaxC: 31, tempMinC: 25, popPct: 70, weatherText: "Thundery showers" },
    ],
  },
  {
    slug: "delhi",
    location: {
      name: "New Delhi",
      state: "Delhi",
      country: "India",
      countryCode: "IN",
      latitude: 28.6139,
      longitude: 77.209,
      timezone: "Asia/Kolkata",
      fullLabel: "New Delhi, Delhi, India",
      source: "demo",
      isDemo: true,
    },
    current: {
      tempC: 34, feelsLikeC: 37, humidityPct: 52, pressureHpa: 1005,
      windKmh: 12, windDeg: 250, precipMm: 0, popPct: 5, cloudPct: 20,
      uv: 7, weatherText: "Hazy sunshine",
    },
    daily: [
      { dateOffset: 0, tempMaxC: 37, tempMinC: 27, popPct: 5, weatherText: "Hazy sunshine" },
      { dateOffset: 1, tempMaxC: 36, tempMinC: 26, popPct: 15, weatherText: "Partly cloudy" },
      { dateOffset: 2, tempMaxC: 35, tempMinC: 25, popPct: 30, weatherText: "Thundery development" },
    ],
  },
  {
    slug: "bengaluru",
    location: {
      name: "Bengaluru",
      state: "Karnataka",
      country: "India",
      countryCode: "IN",
      latitude: 12.9716,
      longitude: 77.5946,
      timezone: "Asia/Kolkata",
      fullLabel: "Bengaluru, Karnataka, India",
      source: "demo",
      isDemo: true,
    },
    current: {
      tempC: 24, feelsLikeC: 24, humidityPct: 58, pressureHpa: 1014,
      windKmh: 18, windDeg: 260, precipMm: 0.8, popPct: 35, cloudPct: 45,
      uv: 5, weatherText: "Breezy and pleasant",
    },
    daily: [
      { dateOffset: 0, tempMaxC: 27, tempMinC: 19, popPct: 35, weatherText: "Breezy, possible shower" },
      { dateOffset: 1, tempMaxC: 28, tempMinC: 19, popPct: 40, weatherText: "Partly cloudy" },
      { dateOffset: 2, tempMaxC: 27, tempMinC: 19, popPct: 55, weatherText: "Thundery showers" },
    ],
  },
];

export const DEMO_ALERTS: DemoAlertFixture[] = [
  {
    id: "demo-alert-1",
    hazardType: "heavy_rain",
    severity: "red",
    title: "Heavy to Very Heavy Rainfall",
    description:
      "Demonstration alert: heavy rainfall expected over Pune urban and adjoining talukas. This is fixture data for the SIH demo and does not replace official IMD bulletins.",
    instructions: [
      "Stay indoors during peak precipitation.",
      "Avoid low-lying nullah and underpass crossings.",
      "Keep emergency numbers reachable.",
    ],
    affectedAreas: ["Pune Urban", "Haveli", "Pimpri-Chinchwad"],
    affectedDistricts: ["Pune Urban", "Haveli", "Pimpri-Chinchwad", "Mulshi", "Maval"],
    issuedOffsetMinutes: -90,
    expiresInMinutes: 600,
  },
  {
    id: "demo-alert-2",
    hazardType: "extreme_heat",
    severity: "orange",
    title: "Heatwave Conditions",
    description:
      "Demonstration alert: heatwave conditions likely in parts of Vidarbha. Fixture data for the SIH demo, not an official IMD bulletin.",
    instructions: ["Avoid sun exposure between 12:00 and 15:30.", "Stay hydrated."],
    affectedAreas: ["Nagpur", "Akola"],
    affectedDistricts: ["Nagpur", "Akola", "Chandrapur", "Wardha", "Amravati"],
    issuedOffsetMinutes: -210,
    expiresInMinutes: 2880,
  },
  {
    id: "demo-alert-3",
    hazardType: "strong_wind",
    severity: "orange",
    title: "Squally Winds over Coastal Konkan",
    description:
      "Demonstration alert: gusty winds along the Konkan coastline. Fixture data for the SIH demo, not an official IMD bulletin.",
    instructions: ["Fishermen advised to avoid deep-sea venturing.", "Secure loose roofing."],
    affectedAreas: ["Ratnagiri", "Sindhudurg", "Raigad"],
    affectedDistricts: ["Ratnagiri", "Sindhudurg", "Raigad"],
    issuedOffsetMinutes: -300,
    expiresInMinutes: 1440,
  },
];