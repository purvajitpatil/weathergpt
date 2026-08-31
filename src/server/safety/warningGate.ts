/**
 * WeatherGPT — Warning Gate Middleware
 *
 * Every request, regardless of intent, checks warnings first.
 * Non-bypassable. This is middleware, not a feature.
 *
 * If a red/orange warning is active:
 *   - The answer MUST open with the warning
 *   - Casual tone is suppressed
 *   - The warning record ID is mandatory for safety validation
 */

import type { AnswerObject, WarningInfo } from "../../../shared/contracts/answer";
import type { Severity } from "../providers/imd/severity";

export interface WarningGateContext {
  districtId: number;
  warning: WarningInfo;
  forceWarningLead: boolean;
  suppressCasualTone: boolean;
}

/**
 * Apply warning gate to an AnswerObject.
 * This mutates the answer in-place to enforce warning precedence.
 */
export function applyWarningGate(
  answer: AnswerObject,
  activeWarning: WarningInfo | null
): void {
  if (!activeWarning) {
    answer.warning = {
      active: false,
      severity: "none",
      codes: [],
      warningRecordId: null,
      validUpto: null,
    };
    return;
  }

  answer.warning = activeWarning;

  if (activeWarning.active && activeWarning.severity === "warning") {
    // Red alert: force warning as lead, suppress casual tone
    answer.reasonCodes.push("IMD_RED_ACTIVE");
    answer.reasonCodes.push("FORCE_WARNING_LEAD");

    // Escalate risk to at least the warning severity
    if (answer.risk && severityRank(answer.risk.band) < severityRank("severe")) {
      answer.reasonCodes.push("IMD_WARNING_OVERRIDES_MODEL");
      answer.risk.band = "severe";
    }
  } else if (activeWarning.active && activeWarning.severity === "alert") {
    // Orange alert: force warning as lead
    answer.reasonCodes.push("IMD_ORANGE_ACTIVE");
    answer.reasonCodes.push("FORCE_WARNING_LEAD");

    if (answer.risk && severityRank(answer.risk.band) < severityRank("high")) {
      answer.reasonCodes.push("IMD_WARNING_OVERRIDES_MODEL");
      answer.risk.band = "high";
    }
  } else if (activeWarning.active && activeWarning.severity === "watch") {
    answer.reasonCodes.push("IMD_YELLOW_ACTIVE");
  }
}

/**
 * Check if the answer should lead with a warning.
 */
export function shouldLeadWithWarning(answer: AnswerObject): boolean {
  return answer.reasonCodes.includes("FORCE_WARNING_LEAD");
}

/**
 * Get the warning text that should appear at the top of the response.
 */
export function getWarningLeadText(answer: AnswerObject, lang: "en" | "hi" | "mr"): string {
  if (!answer.warning.active) return "";

  const severity = answer.warning.severity;
  const district = answer.location.districtName;

  const leads: Record<Severity, Record<string, string>> = {
    warning: {
      en: `🔴 EMERGENCY: ${district} is under a RED alert. `,
      hi: `🔴 आपातकाल: ${district} में लाल अलर्ट है। `,
      mr: `🔴 आणीबाणी: ${district}मध्ये लाल इशारा आहे। `,
    },
    alert: {
      en: `🟠 WARNING: Active orange alert for ${district}. `,
      hi: `🟠 चेतावनी: ${district} में ऑरेंज अलर्ट सक्रिय है। `,
      mr: `🟠 चेतावणी: ${district}साठी ऑरेंज अलर्ट सक्रिय आहे। `,
    },
    watch: {
      en: `🟡 WATCH: Weather watch active for ${district}. `,
      hi: `🟡 निगरानी: ${district} में मौसम निगरानी सक्रिय है। `,
      mr: `🟡 निरीक्षण: ${district}साठी हवामान निरीक्षण सक्रिय आहे। `,
    },
    none: { en: "", hi: "", mr: "" },
  };

  return leads[severity]?.[lang] ?? "";
}

function severityRank(band: string): number {
  const ranks: Record<string, number> = { low: 0, moderate: 1, high: 2, severe: 3 };
  return ranks[band] ?? 0;
}
