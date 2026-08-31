/**
 * WeatherGPT — Location intelligence.
 *
 * Turns free-text place input ("Udya Pune la", "delhi", "पुणे", "13.08,80.27")
 * into a ResolvedLocation using, in priority order:
 *   1. coordinate pairs
 *   2. cache
 *   3. built-in multilingual alias map (offline, fast)
 *   4. real geocoding provider (Open-Meteo)
 * with fallback under demo/auto modes.
 */
import { CacheService } from "../cache";
import { getRegistry } from "../providers";
import type { GeolocationProvider } from "../providers/types";
import type { ResolvedLocation } from "../core/models";

interface AliasEntry {
  name: string;
  state?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  aliases: string[];
}

/**
 * India-focused multilingual alias map. Coordinates are real, well-known
 * city coordinates (facts). These provide instant offline resolution and
 * multilingual/code-mixed matching; geocoding remains the authoritative path.
 */
const CITY_ALIASES: AliasEntry[] = [
  { name: "Pune", state: "Maharashtra", country: "India", countryCode: "IN", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata", aliases: ["pune", "poonie", "पुणे", "पुना", "पूना"] },
  { name: "Mumbai", state: "Maharashtra", country: "India", countryCode: "IN", latitude: 19.076, longitude: 72.8777, timezone: "Asia/Kolkata", aliases: ["mumbai", "bombay", "मुंबई", "बॉम्बे"] },
  { name: "Nagpur", state: "Maharashtra", country: "India", countryCode: "IN", latitude: 21.1458, longitude: 79.0882, timezone: "Asia/Kolkata", aliases: ["nagpur", "नागपूर", "नागपुर"] },
  { name: "New Delhi", state: "Delhi", country: "India", countryCode: "IN", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata", aliases: ["delhi", "new delhi", "दिल्ली", "नई दिल्ली"] },
  { name: "Bengaluru", state: "Karnataka", country: "India", countryCode: "IN", latitude: 12.9716, longitude: 77.5946, timezone: "Asia/Kolkata", aliases: ["bengaluru", "bengalooru", "bangalore", "बेंगलुरु", "बेंगळूरू", "ಬೆಂಗಳೂರು"] },
  { name: "Chennai", state: "Tamil Nadu", country: "India", countryCode: "IN", latitude: 13.0827, longitude: 80.2707, timezone: "Asia/Kolkata", aliases: ["chennai", "madras", "चेन्नई", "சென்னை"] },
  { name: "Hyderabad", state: "Telangana", country: "India", countryCode: "IN", latitude: 17.385, longitude: 78.4867, timezone: "Asia/Kolkata", aliases: ["hyderabad", "हैदराबाद", "హైదరాబాద్"] },
  { name: "Kolkata", state: "West Bengal", country: "India", countryCode: "IN", latitude: 22.5726, longitude: 88.3639, timezone: "Asia/Kolkata", aliases: ["kolkata", "calcutta", "कोलकाता", "কলকাতা"] },
  { name: "Kochi", state: "Kerala", country: "India", countryCode: "IN", latitude: 9.9312, longitude: 76.2673, timezone: "Asia/Kolkata", aliases: ["kochi", "cochin", "केंच", "കൊച്ചി"] },
  { name: "Trivandrum", state: "Kerala", country: "India", countryCode: "IN", latitude: 8.5241, longitude: 76.9366, timezone: "Asia/Kolkata", aliases: ["trivandrum", "thiruvananthapuram", "तिरुवनंतपुरम"] },
  { name: "Manali", state: "Himachal Pradesh", country: "India", countryCode: "IN", latitude: 32.2396, longitude: 77.1887, timezone: "Asia/Kolkata", aliases: ["manali", "मनाली"] },
  { name: "Jaipur", state: "Rajasthan", country: "India", countryCode: "IN", latitude: 26.9124, longitude: 75.7873, timezone: "Asia/Kolkata", aliases: ["jaipur", "जयपुर"] },
  { name: "Lucknow", state: "Uttar Pradesh", country: "India", countryCode: "IN", latitude: 26.8467, longitude: 80.9462, timezone: "Asia/Kolkata", aliases: ["lucknow", "लखनऊ"] },
  { name: "Agra", state: "Uttar Pradesh", country: "India", countryCode: "IN", latitude: 27.1767, longitude: 78.0081, timezone: "Asia/Kolkata", aliases: ["agra", "आगरा"] },
  { name: "Varanasi", state: "Uttar Pradesh", country: "India", countryCode: "IN", latitude: 25.3176, longitude: 82.9739, timezone: "Asia/Kolkata", aliases: ["varanasi", "benares", "kashi", "वाराणसी", "काशी"] },
  { name: "Ahmedabad", state: "Gujarat", country: "India", countryCode: "IN", latitude: 23.0225, longitude: 72.5714, timezone: "Asia/Kolkata", aliases: ["ahmedabad", "अहमदाबाद", "અમદાવાદ"] },
  { name: "Surat", state: "Gujarat", country: "India", countryCode: "IN", latitude: 21.1702, longitude: 72.8311, timezone: "Asia/Kolkata", aliases: ["surat", "सूरत", "સુરત"] },
  { name: "Bhopal", state: "Madhya Pradesh", country: "India", countryCode: "IN", latitude: 23.2599, longitude: 77.4126, timezone: "Asia/Kolkata", aliases: ["bhopal", "भोपाल"] },
  { name: "Indore", state: "Madhya Pradesh", country: "India", countryCode: "IN", latitude: 22.7196, longitude: 75.8577, timezone: "Asia/Kolkata", aliases: ["indore", "इंदौर", "इंदूर"] },
  { name: "Patna", state: "Bihar", country: "India", countryCode: "IN", latitude: 25.5941, longitude: 85.1376, timezone: "Asia/Kolkata", aliases: ["patna", "पटना"] },
  { name: "Guwahati", state: "Assam", country: "India", countryCode: "IN", latitude: 26.1445, longitude: 91.7362, timezone: "Asia/Kolkata", aliases: ["guwahati", "गुवाहाटी"] },
  { name: "Panaji", state: "Goa", country: "India", countryCode: "IN", latitude: 15.4909, longitude: 73.8278, timezone: "Asia/Kolkata", aliases: ["panaji", "panjim", "goa", "पणजी"] },
  { name: "Jodhpur", state: "Rajasthan", country: "India", countryCode: "IN", latitude: 26.2389, longitude: 73.0243, timezone: "Asia/Kolkata", aliases: ["jodhpur", "जोधपुर"] },
  { name: "Mysuru", state: "Karnataka", country: "India", countryCode: "IN", latitude: 12.2958, longitude: 76.6394, timezone: "Asia/Kolkata", aliases: ["mysuru", "mysore", "ಮೈಸೂರು"] },
];

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\,\;\:\?\.\!_\-\+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliasIndex(): { alias: string; entry: AliasEntry }[] {
  const index: { alias: string; entry: AliasEntry }[] = [];
  for (const entry of CITY_ALIASES) {
    for (const alias of entry.aliases) {
      index.push({ alias: normalizeText(alias), entry });
    }
    index.push({ alias: normalizeText(entry.name), entry });
  }
  return index;
}

const ALIAS_INDEX = buildAliasIndex();

function findInAliasIndex(query: string): ResolvedLocation | null {
  const q = normalizeText(query);
  // exact alias match
  const exact = ALIAS_INDEX.find((i) => i.alias === q);
  if (exact) return toResolved(exact.entry, "alias-map");
  // containment match (e.g. "it will rain in पुणे" → "पुणे")
  let best: { alias: string; entry: AliasEntry } | null = null;
  for (const item of ALIAS_INDEX) {
    if (q.includes(item.alias) && item.alias.length >= 2) {
      if (!best || item.alias.length > best.alias.length) best = item;
    }
  }
  return best ? toResolved(best.entry, "alias-map") : null;
}

function toResolved(entry: AliasEntry, source: string): ResolvedLocation {
  return {
    name: entry.name,
    state: entry.state,
    country: entry.country,
    countryCode: entry.countryCode,
    latitude: entry.latitude,
    longitude: entry.longitude,
    timezone: entry.timezone,
    fullLabel: [entry.name, entry.state, entry.country].filter(Boolean).join(", "),
    source,
    isDemo: false,
  };
}

const COORD_RE = /^([+-]?\d{1,2}\.\d{3,}),\s*([+-]?\d{1,3}\.\d{3,})$/;

function parseCoordinates(query: string): { lat: number; lon: number } | null {
  const m = query.trim().match(COORD_RE);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export class LocationService {
  constructor(private cache: CacheService, private geocoder?: GeolocationProvider) {}

  /**
   * Resolve arbitrary text to a location.
   * Returns null when nothing can be resolved (caller must respond honestly).
   */
  async resolve(rawQuery: string, opts?: { timeoutMs?: number }): Promise<ResolvedLocation | null> {
    const query = rawQuery.trim();
    if (!query) return null;

    // 1. coordinates
    const coords = parseCoordinates(query);
    if (coords) {
      return {
        name: `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`,
        latitude: coords.lat,
        longitude: coords.lon,
        fullLabel: `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`,
        source: "user-coordinates",
        isDemo: false,
      };
    }

    // 2. cache
    const cacheKey = this.cache.key.geo(query);
    const cached = await this.cache.get<ResolvedLocation>(cacheKey);
    if (cached) return cached;

    // 3. offline alias map (multilingual, instant)
    const aliasHit = findInAliasIndex(query);
    if (aliasHit) {
      await this.cache.set(cacheKey, aliasHit, this.cacheTtl.geo);
      return aliasHit;
    }

    // 4. real geocoding provider (when live mode)
    const geocoder = this.geocoder ?? getRegistry().geocoding;
    if (!geocoder.isDemo) {
      try {
        const results = await geocoder.search(query, { timeoutMs: opts?.timeoutMs ?? 8_000 });
        if (results.length > 0) {
          await this.cache.set(cacheKey, results[0], this.cacheTtl.geo);
          return results[0];
        }
      } catch {
        // fall through to demo registry fallback below
      }
    }

    // 5. demo geocoder (fixture cities) — only reachable in demo/auto mode
    try {
      const demoResults = await getRegistry().demo!.geocoding.search(query);
      if (demoResults.length > 0) {
        const demo = demoResults[0];
        await this.cache.set(cacheKey, demo, this.cacheTtl.geo);
        return demo;
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  private cacheTtl = { geo: 86_400 }; // 24h in seconds
}

/** Given the raw query text, try to find a location mention. Returns null if none. */
export { findInAliasIndex };

/** @internal for tests */
export { CITY_ALIASES, normalizeText };