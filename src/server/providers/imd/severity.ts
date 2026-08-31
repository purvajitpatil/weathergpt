/**
 * WeatherGPT — IMD Severity Normalisation
 *
 * CRITICAL: IMD colour codes are INVERTED between endpoints:
 *
 *   districtwarning:   1=Red    2=Orange  3=Yellow  4=Green
 *   districtnowcast:   1=Green  2=Yellow  3=Orange  4=Red   ← REVERSED
 *   stationnowcast:    1=Green  2=Yellow  3=Orange  4=Red   ← REVERSED
 *
 * A shared colourCodeToSeverity() would silently show GREEN during a RED alert.
 * This adapter normalises at the boundary, per endpoint, and never lets a raw
 * IMD colour integer past the ingestion layer.
 */

export type Severity = "none" | "watch" | "alert" | "warning";

// districtwarning: Red=1, Orange=2, Yellow=3, Green=4
const WARNING_MAP: Record<number, Severity> = {
  1: "warning",  // Red
  2: "alert",    // Orange
  3: "watch",    // Yellow
  4: "none",     // Green / No Warning
};

// districtnowcast & stationnowcast: Green=1, Yellow=2, Orange=3, Red=4
const NOWCAST_MAP: Record<number, Severity> = {
  1: "none",     // Green
  2: "watch",    // Yellow
  3: "alert",    // Orange
  4: "warning",  // Red
};

/**
 * Normalise an IMD colour code to our canonical severity.
 *
 * @param source - which endpoint the code came from
 * @param code   - the raw integer colour code from IMD
 * @returns normalised severity (never silently defaults to 'none')
 * @throws if the code is unmapped — fail loud, never default
 */
export function normaliseSeverity(
  source: "districtwarning" | "districtnowcast" | "stationnowcast",
  code: number
): Severity {
  const map =
    source === "districtwarning" ? WARNING_MAP : NOWCAST_MAP;

  const severity = map[code];
  if (severity === undefined) {
    throw new Error(
      `Unmapped IMD colour code ${code} from ${source}. ` +
      `This is a safety-critical bug — aborting to prevent false green.`
    );
  }
  return severity;
}

/**
 * Map IMD colour code to our Severity for alert objects.
 * Used when creating Alert records from IMD data.
 */
export function imdColourToAlertSeverity(
  source: "districtwarning" | "districtnowcast" | "stationnowcast",
  code: number
): "green" | "yellow" | "orange" | "red" {
  const severity = normaliseSeverity(source, code);
  const map: Record<Severity, "green" | "yellow" | "orange" | "red"> = {
    none: "green",
    watch: "yellow",
    alert: "orange",
    warning: "red",
  };
  return map[severity];
}

/**
 * Map IMD warning code (1-17) to human-readable hazard type.
 */
export function imdWarningCodeToHazardType(code: number): string {
  const map: Record<number, string> = {
    1: "none",
    2: "heavy_rain",
    3: "heavy_snow",
    4: "thunderstorm",
    5: "hailstorm",
    6: "dust_storm",
    7: "dust_raising_winds",
    8: "strong_surface_winds",
    9: "extreme_heat",
    10: "hot_day",
    11: "warm_night",
    12: "cold_wave",
    13: "cold_day",
    14: "ground_frost",
    15: "fog",
    16: "very_heavy_rain",
    17: "extremely_heavy_rain",
  };
  return map[code] ?? "other";
}
