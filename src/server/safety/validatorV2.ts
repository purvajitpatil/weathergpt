/**
 * WeatherGPT — Safety Validator v2
 *
 * Four locks that prevent the most dangerous failure modes:
 *
 * 1. NUMBER LOCK — every number in output must exist in facts
 * 2. WARNING LOCK — alert vocabulary unreachable without warningRecordId
 * 3. CERTAINTY LOCK — fabricated certainty blocked
 * 4. SOURCE LOCK — facts present but no sources → violation
 *
 * Run EVERY check; collect all violations before deciding.
 * On violation: regenerate once with violations fed back.
 * Still failing → emit the raw slot template. Ugly beats wrong.
 */

import type { AnswerObject, Fact, Source } from "../../../shared/contracts/answer";

export interface ValidationResult {
  ok: boolean;
  violations: string[];
}

const WARNING_LEXICON =
  /red alert|orange alert|yellow alert|\u0930\u0947\u0921\s*\u0905\u0932\u0930\u094d\u091f|\u0932\u093e\u0932\s*\u0907\u0936\u093e\u0930\u093e|warning issued|\u0907\u0936\u093e\u0930\u093e.*\u091c\u093e\u0930\u0940|\u0938\u0942\u091a\u0928\u093e.*\u091c\u093e\u0930\u0940|\u091a\u0947\u0924\u093e\u0935\u0923\u0940.*\u091c\u093e\u0930\u0940/i;

const CERTAINTY_PATTERNS = [
  /definitely|guaranteed|completely safe|no risk|100% sure|impossible|never will|absolutely safe/i,
  /\u092a\u0915\u094d\u0915\u093e|\u092c\u093f\u0932\u094d\u0915\u0941\u0932\s*\u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924|\u0915\u094b\u0908\s*\u0916\u0924\u0930\u093e\s*\u0928\u0939\u0940\u0902/i,
  /\u0928\u0915\u094d\u0915\u0940\u091a|\u0916\u093e\u0924\u094d\u0930\u0940\u0936\u0940\u0930/i,
];

/**
 * Validate an AnswerObject against the four safety locks.
 */
export function validateAnswer(
  text: string,
  answer: AnswerObject
): ValidationResult {
  const v: string[] = [];

  // ── Lock 1: NUMBER LOCK ──────────────────────────────────────────────────
  // Every number in output must exist in facts[].
  const allowedNumbers = new Set<string>();
  for (const fact of answer.facts) {
    if (typeof fact.value === "number") {
      allowedNumbers.add(String(fact.value));
      // Also allow common formatting variants
      allowedNumbers.add(fact.value.toFixed(0));
      allowedNumbers.add(fact.value.toFixed(1));
    }
  }
  // Allow the district ID and valid-for timestamps
  allowedNumbers.add(String(answer.location.districtId));

  const numbersInText = text.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const n of numbersInText) {
    // Skip years (2024, 2025, 2026) and ordinals
    if (/^(19|20)\d{2}$/.test(n)) continue;
    if (!allowedNumbers.has(n)) {
      v.push(`UNGROUNDED_NUMBER:${n}`);
    }
  }

  // ── Lock 2: WARNING LOCK ─────────────────────────────────────────────────
  // Alert vocabulary is unreachable without a warningRecordId.
  if (WARNING_LEXICON.test(text) && !answer.warning.warningRecordId) {
    v.push("WARNING_CLAIM_WITHOUT_RECORD");
  }

  // ── Lock 3: CERTAINTY LOCK ───────────────────────────────────────────────
  for (const pattern of CERTAINTY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      v.push(`OVERCONFIDENT_LANGUAGE:${match[0]}`);
    }
  }

  // ── Lock 4: SOURCE LOCK ──────────────────────────────────────────────────
  // If there are facts but no sources, that's a violation.
  if (answer.facts.length > 0 && answer.sources.length === 0) {
    v.push("NO_SOURCE_ATTRIBUTION");
  }

  return {
    ok: v.length === 0,
    violations: v,
  };
}

/**
 * Validate and get a count for metrics logging.
 * Returns the validation result plus a structured log entry.
 */
export function validateAndLog(
  text: string,
  answer: AnswerObject,
  context: { requestId?: string; prompt?: string }
): ValidationResult & { logEntry: Record<string, unknown> } {
  const result = validateAnswer(text, answer);
  return {
    ...result,
    logEntry: {
      requestId: context.requestId,
      intent: answer.intent,
      district: answer.location.districtName,
      violations: result.violations,
      ok: result.ok,
      prompt: context.prompt?.slice(0, 100),
    },
  };
}
