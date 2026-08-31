import { describe, it, expect } from "vitest";
import {
  normaliseSeverity,
  imdColourToAlertSeverity,
  imdWarningCodeToHazardType,
} from "../src/server/providers/imd/severity";

/**
 * SAFETY-CRITICAL TEST
 *
 * IMD colour codes are inverted between endpoints:
 *   districtwarning: 1=Red, 2=Orange, 3=Yellow, 4=Green
 *   districtnowcast: 1=Green, 2=Yellow, 3=Orange, 4=Red
 *
 * A bug here would show GREEN during a RED alert.
 * This test asserts both directions.
 */

describe("IMD severity normalisation", () => {
  describe("districtwarning (1=Red → warning)", () => {
    it("maps code 1 (Red) to 'warning'", () => {
      expect(normaliseSeverity("districtwarning", 1)).toBe("warning");
    });

    it("maps code 2 (Orange) to 'alert'", () => {
      expect(normaliseSeverity("districtwarning", 2)).toBe("alert");
    });

    it("maps code 3 (Yellow) to 'watch'", () => {
      expect(normaliseSeverity("districtwarning", 3)).toBe("watch");
    });

    it("maps code 4 (Green) to 'none'", () => {
      expect(normaliseSeverity("districtwarning", 4)).toBe("none");
    });

    it("throws on unmapped code", () => {
      expect(() => normaliseSeverity("districtwarning", 99)).toThrow("Unmapped");
    });
  });

  describe("districtnowcast (1=Green → none, INVERTED)", () => {
    it("maps code 1 (Green) to 'none'", () => {
      expect(normaliseSeverity("districtnowcast", 1)).toBe("none");
    });

    it("maps code 2 (Yellow) to 'watch'", () => {
      expect(normaliseSeverity("districtnowcast", 2)).toBe("watch");
    });

    it("maps code 3 (Orange) to 'alert'", () => {
      expect(normaliseSeverity("districtnowcast", 3)).toBe("alert");
    });

    it("maps code 4 (Red) to 'warning'", () => {
      expect(normaliseSeverity("districtnowcast", 4)).toBe("warning");
    });
  });

  describe("stationnowcast (same as districtnowcast)", () => {
    it("maps code 1 (Green) to 'none'", () => {
      expect(normaliseSeverity("stationnowcast", 1)).toBe("none");
    });

    it("maps code 4 (Red) to 'warning'", () => {
      expect(normaliseSeverity("stationnowcast", 4)).toBe("warning");
    });
  });

  describe("CRITICAL: inversion correctness", () => {
    it("districtwarning code 1 = Red = worst", () => {
      const w = normaliseSeverity("districtwarning", 1);
      const n = normaliseSeverity("districtnowcast", 1);
      // WARNING endpoint: 1 is worst (Red)
      expect(w).toBe("warning");
      // NOWCAST endpoint: 1 is best (Green)
      expect(n).toBe("none");
      // They must NOT be equal — this is the inversion
      expect(w).not.toBe(n);
    });

    it("districtnowcast code 4 = Red = worst", () => {
      const w = normaliseSeverity("districtwarning", 4);
      const n = normaliseSeverity("districtnowcast", 4);
      // WARNING endpoint: 4 is best (Green)
      expect(w).toBe("none");
      // NOWCAST endpoint: 4 is worst (Red)
      expect(n).toBe("warning");
      expect(w).not.toBe(n);
    });
  });

  describe("alert severity mapping", () => {
    it("maps to correct alert severity strings", () => {
      expect(imdColourToAlertSeverity("districtwarning", 1)).toBe("red");
      expect(imdColourToAlertSeverity("districtwarning", 2)).toBe("orange");
      expect(imdColourToAlertSeverity("districtwarning", 3)).toBe("yellow");
      expect(imdColourToAlertSeverity("districtwarning", 4)).toBe("green");

      expect(imdColourToAlertSeverity("districtnowcast", 4)).toBe("red");
      expect(imdColourToAlertSeverity("districtnowcast", 1)).toBe("green");
    });
  });

  describe("warning code to hazard type", () => {
    it("maps IMD warning codes to hazard types", () => {
      expect(imdWarningCodeToHazardType(1)).toBe("none");
      expect(imdWarningCodeToHazardType(2)).toBe("heavy_rain");
      expect(imdWarningCodeToHazardType(9)).toBe("extreme_heat");
      expect(imdWarningCodeToHazardType(16)).toBe("very_heavy_rain");
      expect(imdWarningCodeToHazardType(17)).toBe("extremely_heavy_rain");
    });
  });
});
