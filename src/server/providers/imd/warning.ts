/**
 * WeatherGPT — IMD District Warning Provider
 *
 * Fetches official district-level warnings from IMD's API gateway.
 * API: https://api.imd.gov.in/api/v1/districtwarning?id={districtId}
 *
 * WARNING: Requires IP whitelisting. Contact IMD nodal officers.
 * Falls back gracefully when IMD is unavailable.
 *
 * Attribution: India Meteorological Department (IMD)
 * Reference: https://mausam.imd.gov.in/responsive/apis.php
 */

import type { ResolvedLocation } from "../../core/models";
import { providerError, type FetchLike } from "../types";
import { normaliseSeverity, type Severity } from "./severity";
import { getHazardType, getWarningText } from "./warningCodes";

export interface ImdWarningRecord {
  id: string;
  districtId: number;
  districtName: string;
  state: string;
  severity: Severity;
  hazardType: string;
  warningCode: number;
  title: string;
  description: string;
  instructions: string[];
  issuedAt: string;
  expiresAt: string;
  language: string;
  isActive: boolean;
  raw: unknown;
}

interface ImdWarningResponse {
  type?: string;
  name?: string;
  parent?: string;
  state?: string;
  id?: number;
  warnings?: Array<{
    type?: string;
    code?: string;
    date?: string;
    validfrom?: string;
    validto?: string;
    area?: string;
  }>;
  more?: Array<{
    type?: string;
    code?: string;
    date?: string;
    validfrom?: string;
    validto?: string;
  }>;
}

export interface ImdWarningProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
}

export class ImdWarningProvider {
  readonly id = "imd-warning";
  readonly label = "IMD District Warning";
  readonly isDemo = false;

  private fetchImpl: FetchLike;
  private baseUrl: string;
  private apiKey?: string;

  constructor(opts: ImdWarningProviderOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://api.imd.gov.in/api/v1";
    this.apiKey = opts.apiKey;
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "WeatherGPT/1.0 (SIH; IMD attribution)",
    };
    if (this.apiKey) {
      headers["apikey"] = this.apiKey;
    }
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        headers,
      });
      if (!res.ok) {
        throw providerError(this.id, `IMD returned HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw providerError(this.id, `IMD request timed out`, { retryable: true, cause: err });
      }
      if ((err as { name?: string }).name === "ProviderError") throw err;
      throw providerError(this.id, `IMD request failed: ${(err as Error).message}`, {
        retryable: true, cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch warnings for a district by IMD district ID.
   * Returns normalised ImdWarningRecord[] with severity already mapped.
   */
  async getDistrictWarnings(
    districtId: number,
    opts?: { timeoutMs?: number }
  ): Promise<ImdWarningRecord[]> {
    const timeout = opts?.timeoutMs ?? 10_000;
    const url = `${this.baseUrl}/districtwarning?id=${districtId}`;

    try {
      const data = await this.getJson<ImdWarningResponse>(url, timeout);
      const now = new Date();
      const records: ImdWarningRecord[] = [];

      // Process main warning
      if (data.warnings && data.warnings.length > 0) {
        for (const w of data.warnings) {
          const code = parseInt(w.code ?? "1", 10);
          // CRITICAL: normalise with the "districtwarning" source
          const severity = normaliseSeverity("districtwarning", code);
          const hazardType = getHazardType(code);
          const validTo = w.validto ? new Date(w.validto) : new Date(now.getTime() + 24 * 3600_000);

          records.push({
            id: `imd-warn-${districtId}-${w.date ?? now.toISOString()}`,
            districtId,
            districtName: data.name ?? `District ${districtId}`,
            state: data.state ?? "",
            severity,
            hazardType,
            warningCode: code,
            title: getWarningText(code, "en"),
            description: w.area ?? `IMD warning for district ${districtId}`,
            instructions: this.getInstructions(code),
            issuedAt: w.validfrom ?? now.toISOString(),
            expiresAt: validTo.toISOString(),
            language: "en",
            isActive: validTo.getTime() > now.getTime() && severity !== "none",
            raw: data,
          });
        }
      }

      // Process "more" warnings (additional hazard types)
      if (data.more && data.more.length > 0) {
        for (const m of data.more) {
          const code = parseInt(m.code ?? "1", 10);
          const severity = normaliseSeverity("districtwarning", code);
          const hazardType = getHazardType(code);
          const validTo = m.validto ? new Date(m.validto) : new Date(now.getTime() + 24 * 3600_000);

          records.push({
            id: `imd-more-${districtId}-${m.date ?? now.toISOString()}`,
            districtId,
            districtName: data.name ?? `District ${districtId}`,
            state: data.state ?? "",
            severity,
            hazardType,
            warningCode: code,
            title: getWarningText(code, "en"),
            description: `Additional: ${getWarningText(code, "en")}`,
            instructions: this.getInstructions(code),
            issuedAt: m.validfrom ?? now.toISOString(),
            expiresAt: validTo.toISOString(),
            language: "en",
            isActive: validTo.getTime() > now.getTime() && severity !== "none",
            raw: data,
          });
        }
      }

      return records;
    } catch (err) {
      if ((err as { name?: string }).name === "ProviderError") throw err;
      // IMD may be unreachable — return empty, never fabricate
      return [];
    }
  }

  /**
   * Safety instructions per warning code.
   */
  private getInstructions(code: number): string[] {
    const instructions: Record<number, string[]> = {
      2: ["Avoid low-lying areas", "Stay indoors during peak rain", "Keep emergency numbers reachable"],
      4: ["Seek shelter indoors", "Avoid open areas and tall trees", "Disconnect electrical appliances"],
      5: ["Protect vehicles and crops", "Stay away from windows", "Seek indoor shelter"],
      6: ["Close all windows and doors", "Cover face when outdoors", "Avoid driving"],
      8: ["Secure loose roofing and objects", "Avoid outdoor activities", "Stay away from trees"],
      9: ["Avoid sun exposure 12:00-15:30", "Stay hydrated", "Check on vulnerable people"],
      12: ["Dress warmly", "Avoid prolonged outdoor exposure", "Protect crops from frost"],
      15: ["Drive slowly with fog lights", "Maintain safe distance", "Avoid unnecessary travel"],
      16: ["Evacuate low-lying areas", "Avoid all travel", "Follow local authority instructions"],
      17: ["Evacuate immediately if instructed", "Move to higher ground", "Emergency services only"],
    };
    return instructions[code] ?? ["Stay informed", "Follow local authority guidance"];
  }

  async health(): Promise<boolean> {
    try {
      // Test with Pune district (ID 573 from IMD)
      const url = `${this.baseUrl}/districtwarning?id=573`;
      const data = await this.getJson<ImdWarningResponse>(url, 5_000);
      return !!data;
    } catch {
      return false;
    }
  }
}
