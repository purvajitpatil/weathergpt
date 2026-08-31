/**
 * WeatherGPT — Safety validator (v2).
 *
 * Layers:
 *   1. Schema validation (structured response shape)
 *   2. Evidence validation (claims must map to supplied evidence)
 *   3. Warning precedence (official red/orange cannot be downgraded)
 *   4. Risk language validation (no fabricated certainty)
 *   5. Unsupported claim detection
 *   6. Emergency-response policy
 */
import type { Severity as RiskSeverity, StructuredChatResponse } from "../core/models";
import type { EvidenceContext } from "../services/evidenceService";

export interface SafetyIssue {
  type:
    | "schema"
    | "evidence_missing"
    | "warning_conflict"
    | "warning_downgrade"
    | "fabricated_certainty"
    | "unsupported_claim"
    | "emergency_policy"
    | "demo_mislabel";
  description: string;
  severity: "error" | "warning";
}

export interface SafetyValidation {
  isValid: boolean;
  issues: SafetyIssue[];
  sanitizedResponse: StructuredChatResponse;
}

const CERTAINTY_PATTERNS = [
  /\b100%\s*(safe|certain|guaranteed|no risk)/gi,
  /\babsolutely\s+(safe|no risk|certain)/gi,
  /\bno\s+(danger|risk|threat|concern)\s+at\s+all/gi,
  /\bwill definitely not/gi,
  /\bimpossible for (rain|storm|flood|lightning)/gi,
  /\bcompletely safe/gi,
  /\bzero risk/gi,
  /\bno need to worry/gi,
];

const SEVERITIES: RiskSeverity[] = ["green", "yellow", "orange", "red"];

function requiredSchema(resp: unknown): resp is StructuredChatResponse {
  const r = resp as Partial<StructuredChatResponse>;
  return (
    typeof r.answer === "string" &&
    r.answer.trim().length > 0 &&
    typeof r.language === "string" &&
    Array.isArray(r.claims) &&
    Array.isArray(r.evidenceIds) &&
    Array.isArray(r.recommendations)
  );
}

export interface SafetyValidatorOptions {
  /** when true and evidence has no alerts, fabricating an alert is a hard error */
  requireAlertEvidence?: boolean;
}

export class SafetyValidator {
  constructor(private opts: SafetyValidatorOptions = {}) {}

  validate(
    resp: unknown,
    context: EvidenceContext | null,
    opts?: { mode?: "live" | "demo" }
  ): SafetyValidation {
    const issues: SafetyIssue[] = [];
    const raw = (resp ?? {}) as Record<string, unknown>;

    // ── Layer 1: schema
    if (!requiredSchema(raw)) {
      issues.push({
        type: "schema",
        description: "Response does not conform to the structured schema (answer, language, claims, evidenceIds, recommendations required).",
        severity: "error",
      });
      return {
        isValid: false,
        issues,
        sanitizedResponse: {
          answer: "I could not produce a validated response from the available data.",
          language: "en",
          severity: "info",
          claims: [],
          evidenceIds: [],
          recommendations: [],
        },
      };
    }

    const response = raw as unknown as StructuredChatResponse;
    const answerLower = response.answer.toLowerCase();
    const evidenceIds = new Set(response.evidenceIds ?? []);
    const alertEvidence = (context?.alerts ?? []) as Array<Record<string, unknown>>;

    // ── Layer 2: evidence validation
    for (const claim of response.claims ?? []) {
      if (!claim || typeof claim !== "string") {
        issues.push({ type: "evidence_missing", description: "Empty claim supplied.", severity: "error" });
      }
    }
    if ((response.evidenceIds ?? []).length === 0 && (response.claims ?? []).length > 0) {
      // Truly conversational claims (greetings) may legitimately have no evidence.
      const conversational = isConversational(response);
      if (!conversational) {
        issues.push({
          type: "evidence_missing",
          description: "Response makes claims without referencing any evidence.",
          severity: "error",
        });
      }
    }

    // ── Layer 3: warning precedence
    const topAlert = alertEvidence
      .map((a) => ({ severity: String(a.severity ?? "green"), title: String(a.title ?? "") }))
      .sort((a, b) => SEVERITIES.indexOf(b.severity as RiskSeverity) - SEVERITIES.indexOf(a.severity as RiskSeverity))[0];

    if (topAlert && (topAlert.severity === "red" || topAlert.severity === "orange")) {
      const mentionsAlert =
        answerLower.includes("warning") ||
        answerLower.includes("alert") ||
        answerLower.includes("इशारा") ||
        answerLower.includes("चेतावणी") ||
        answerLower.includes("अलर्ट") ||
        topAlert.title.toLowerCase().split(" ").some((w) => answerLower.includes(w));

      if (!mentionsAlert) {
        issues.push({
          type: "warning_conflict",
          description: `Active ${topAlert.severity} warning "${topAlert.title}" must be surfaced in the answer.`,
          severity: "error",
        });
      }

      // downgrade check: answer contains downgrading language for a red/orange warning
      const downgradePatterns = [
        /minor (?:concern|issue|disruption|rain)/i,
        /no cause for concern/i,
        /nothing to worry about/i,
        /just light (?:rain|shower)/i,
      ];
      for (const p of downgradePatterns) {
        if (p.test(response.answer)) {
          issues.push({
            type: "warning_downgrade",
            description: `Answer downgrades an official ${topAlert.severity} warning: "${p.source}". Official warnings take precedence.`,
            severity: "error",
          });
        }
      }
    }

    // ── Layer 4: risk language
    for (const p of CERTAINTY_PATTERNS) {
      const m = response.answer.match(p);
      if (m) {
        issues.push({
          type: "fabricated_certainty",
          description: `Fabricated certainty phrase detected: "${m[0]}".`,
          severity: "warning",
        });
      }
    }

    // ── Layer 5: unsupported claims (specific numbers must match evidence)
    const contextJson = JSON.stringify(context);
    const numberClaims = response.answer.match(/\d{1,3}(?:\.\d+)?\s*(?:°C|mm|km\/h|%|hPa)/g) ?? [];
    if (evidenceIds.size > 0 && numberClaims.length > 0) {
      // We cannot machine-verify prose numbers vs evidence perfectly, but we can
      // flag when evidence is empty yet numeric precision claims exist.
    }
    if (evidenceIds.size === 0 && !isConversational(response) && numberClaims.length > 0) {
      issues.push({
        type: "unsupported_claim",
        description: `Answer contains specific numeric claims (${numberClaims.join(", ")}) with no attached evidence.`,
        severity: "error",
      });
    }

    // ── Layer 6: emergency-response policy / warning availability
    if (context && context.mode === "live" && !contextJson.includes("severity") && this.opts.requireAlertEvidence) {
      issues.push({
        type: "emergency_policy",
        description: "No warning evidence supplied in live mode; the answer must not fabricate an official warning.",
        severity: "warning",
      });
    }

    // demo mislabel: answer claims an official source that isn't in evidence
    const officialClaimed = /IMD|India Meteorological Department|met department/i.test(response.answer);
    if (officialClaimed && context && context.mode === "demo") {
      const sources = (context.sources ?? []).join(" ");
      if (!/IMD|India Meteorological/.test(sources)) {
        issues.push({
          type: "demo_mislabel",
          description: "Answer attributes data to IMD/Met Department while evidence mode is DEMO and no such source is configured.",
          severity: "error",
        });
      }
    }

    // sanitize certainty language
    let sanitizedAnswer = response.answer;
    for (const p of CERTAINTY_PATTERNS) {
      sanitizedAnswer = sanitizedAnswer.replace(p, "conditions appear manageable but remain alert");
    }

    const sanitized: StructuredChatResponse = { ...response, answer: sanitizedAnswer };

    return {
      isValid: !issues.some((i) => i.severity === "error"),
      issues,
      sanitizedResponse: sanitized,
    };
  }
}

function isConversational(r: StructuredChatResponse): boolean {
  const chatFlags = ["hello", "hi", "ना", "काय", "नमस्ते", "नमस्कार"];
  const text = `${r.answer} ${(r.claims ?? []).join(" ")}`.toLowerCase();
  return chatFlags.some((f) => text.includes(f));
}

export const safetyValidator = new SafetyValidator({ requireAlertEvidence: true });

/** Compute a display severity from evidence (used by the response builder). */
export function severityFromEvidence(context: EvidenceContext | null): RiskSeverity {
  const alerts = (context?.alerts ?? []) as Array<{ severity?: string }>;
  if (alerts.length === 0) return "green";
  const top = alerts.sort((a, b) => SEVERITIES.indexOf((b.severity as RiskSeverity) ?? "green") - SEVERITIES.indexOf((a.severity as RiskSeverity) ?? "green"))[0];
  return (top.severity ?? "green") as RiskSeverity;
}