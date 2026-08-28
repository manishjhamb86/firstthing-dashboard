import { describe, it, expect } from "vitest";
import {
  readElectrical,
  scaleDivisorFor,
  mainsPlausible,
  LIVE_PARAM_KEYS,
} from "@/lib/ewelink-scale";

// The three devices as they actually answered on 2026-08-28. Keeping the
// real payloads means a firmware change that moves the scale breaks a test
// rather than quietly moving every figure on the screen.
const LANDCRAFT = { current: 460, dayKwh: 673, monthKwh: 29696, power: 91267, voltage: 22945 };
const AIPL = { current: 144, dayKwh: 430, monthKwh: 56742, power: 31481, voltage: 24224 };
const GALAXY = { current: 137, dayKwh: 417, monthKwh: 19583, power: 26198, voltage: 25034 };

describe("readElectrical", () => {
  it("reads UIID 190 hundredths at their true scale", () => {
    const r = readElectrical(190, LANDCRAFT);
    expect(r.scaleKnown).toBe(true);
    expect(r.voltageV).toBe(229.45);
    expect(r.currentA).toBe(4.6);
    expect(r.powerW).toBe(912.67);
    expect(r.dayKwh).toBe(6.73);
    expect(r.monthKwh).toBe(296.96);
  });

  it("does not store the raw figure as watts — the bug this exists for", () => {
    // 91267 W would be a 91 kW lighting circuit. Assert the wrong value is
    // gone, not merely that the right one is present.
    expect(readElectrical(190, LANDCRAFT).powerW).not.toBe(91267);
    expect(readElectrical(190, GALAXY).powerW).not.toBe(26198);
  });

  it("lands every device on a believable mains voltage — the scale's own proof", () => {
    for (const p of [LANDCRAFT, AIPL, GALAXY]) {
      expect(mainsPlausible(readElectrical(190, p).voltageV)).toBe(true);
    }
  });

  it("reconciles power against V x I at a sane power factor", () => {
    for (const p of [LANDCRAFT, AIPL, GALAXY]) {
      const r = readElectrical(190, p);
      const va = r.voltageV! * r.currentA!;
      const pf = r.powerW! / va;
      expect(pf).toBeGreaterThan(0.7);
      expect(pf).toBeLessThanOrEqual(1.02);
    }
  });

  it("divides exactly, leaving no floating-point tail", () => {
    // 22945 / 100 is 229.45000000000002 in binary floating point.
    expect(String(readElectrical(190, LANDCRAFT).voltageV)).toBe("229.45");
  });

  it("returns nulls, never raw figures, for a device type of unknown scale", () => {
    const r = readElectrical(5, LANDCRAFT);
    expect(r.scaleKnown).toBe(false);
    expect(r.powerW).toBeNull();
    expect(r.dayKwh).toBeNull();
    expect(r.voltageV).toBeNull();
    expect(scaleDivisorFor(5)).toBeNull();
  });

  it("treats a missing datapoint as absent, not as zero", () => {
    const r = readElectrical(190, { power: 91267 });
    expect(r.powerW).toBe(912.67);
    expect(r.dayKwh).toBeNull();
    expect(r.monthKwh).toBeNull();
  });

  it("reads numeric strings, which the vendor sometimes sends", () => {
    expect(readElectrical(190, { power: "91267" }).powerW).toBe(912.67);
    expect(readElectrical(190, { power: "n/a" }).powerW).toBeNull();
  });

  it("asks only for parameters the device actually answers with", () => {
    // getHoursKwh is a descriptor, not readable content — see the module note.
    expect(LIVE_PARAM_KEYS).not.toContain("getHoursKwh");
    expect(LIVE_PARAM_KEYS).not.toContain("oneKwhData");
    expect(LIVE_PARAM_KEYS).toContain("dayKwh");
    expect(LIVE_PARAM_KEYS).toContain("monthKwh");
  });
});

describe("mainsPlausible", () => {
  it("rejects the unscaled reading, which is how a scale error is caught", () => {
    expect(mainsPlausible(22945)).toBe(false);
    expect(mainsPlausible(2.2945)).toBe(false);
  });

  it("has no opinion when there is no reading, or the circuit is dead", () => {
    expect(mainsPlausible(null)).toBeNull();
    expect(mainsPlausible(0)).toBeNull();
  });
});
