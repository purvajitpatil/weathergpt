/**
 * WeatherGPT — IMD Warning Codes
 *
 * The 17 IMD warning codes with per-language display strings.
 * This is the authoritative spine for multilingual warning text.
 * Matches what IMD itself publishes, so Hindi/Marathi warning text
 * agrees with the official bulletin.
 */

export interface WarningCodeInfo {
  code: number;
  hazardType: string;
  en: string;
  hi: string;
  mr: string;
}

export const IMD_WARNING_CODES: Record<number, WarningCodeInfo> = {
  1: {
    code: 1,
    hazardType: "none",
    en: "No Warning",
    hi: "कोई चेतावनी नहीं",
    mr: "कोणतीही चेतावणी नाही",
  },
  2: {
    code: 2,
    hazardType: "heavy_rain",
    en: "Heavy Rain",
    hi: "भारी वर्षा",
    mr: "मोठा पाऊस",
  },
  3: {
    code: 3,
    hazardType: "heavy_snow",
    en: "Heavy Snow",
    hi: "भारी बर्फबारी",
    mr: "मोठा हिमपात",
  },
  4: {
    code: 4,
    hazardType: "thunderstorm",
    en: "Thunderstorm / Lightning / Squall",
    hi: "तूफान / बिजली / आंधी",
    mr: "वादळ / विज / गंजाळा",
  },
  5: {
    code: 5,
    hazardType: "hailstorm",
    en: "Hailstorm",
    hi: "ओलावड़",
    mr: "आंबोळ",
  },
  6: {
    code: 6,
    hazardType: "dust_storm",
    en: "Dust Storm",
    hi: "धूल भरी आंधी",
    mr: "धूळचे वादळ",
  },
  7: {
    code: 7,
    hazardType: "dust_raising_winds",
    en: "Dust Raising Winds",
    hi: "धूल उठाने वाली हवाएं",
    mr: "धूळ उचलणारे वारे",
  },
  8: {
    code: 8,
    hazardType: "strong_surface_winds",
    en: "Strong Surface Winds",
    hi: "तेज सतही हवाएं",
    mr: "जोरदार पृष्ठभागाचे वारे",
  },
  9: {
    code: 9,
    hazardType: "extreme_heat",
    en: "Heat Wave",
    hi: "लू",
    mr: "लू (उष्णता लहर)",
  },
  10: {
    code: 10,
    hazardType: "hot_day",
    en: "Hot Day",
    hi: "गर्म दिन",
    mr: "गरम दिवस",
  },
  11: {
    code: 11,
    hazardType: "warm_night",
    en: "Warm Night",
    hi: "गर्म रात",
    mr: "गरम रात्र",
  },
  12: {
    code: 12,
    hazardType: "cold_wave",
    en: "Cold Wave",
    hi: "शीत लहर",
    mr: "थंडी लहर",
  },
  13: {
    code: 13,
    hazardType: "cold_day",
    en: "Cold Day",
    hi: "ठंडा दिन",
    mr: "थंड दिवस",
  },
  14: {
    code: 14,
    hazardType: "ground_frost",
    en: "Ground Frost",
    hi: "पाला",
    mr: "पाऊस विझलेला (फ्रॉस्ट)",
  },
  15: {
    code: 15,
    hazardType: "fog",
    en: "Fog",
    hi: "कोहरा",
    mr: "धुके",
  },
  16: {
    code: 16,
    hazardType: "very_heavy_rain",
    en: "Very Heavy Rain",
    hi: "अति भारी वर्षा",
    mr: "अति मोठा पाऊस",
  },
  17: {
    code: 17,
    hazardType: "extremely_heavy_rain",
    en: "Extremely Heavy Rain",
    hi: "अत्यंत भारी वर्षा",
    mr: "अत्यंत मोठा पाऊस",
  },
};

/**
 * Get warning display text in the requested language.
 */
export function getWarningText(code: number, lang: "en" | "hi" | "mr"): string {
  const info = IMD_WARNING_CODES[code];
  if (!info) return IMD_WARNING_CODES[1][lang]; // default to "No Warning"
  return info[lang];
}

/**
 * Get hazard type from warning code.
 */
export function getHazardType(code: number): string {
  return IMD_WARNING_CODES[code]?.hazardType ?? "other";
}

/**
 * Check if a warning code represents a severe hazard.
 */
export function isSevereWarning(code: number): boolean {
  return [2, 9, 12, 16, 17].includes(code);
}
