import { describe, expect, it } from "vitest";
import { motorOnFromProperties, motorStatusFromProperties } from "@/lib/tuya";

describe("motorOnFromProperties — the real on/off reading (switch_6, named \"Motor\" by the device's own model)", () => {
  it("reads true when the controller's own switch_6 is on", () => {
    expect(
      motorOnFromProperties([
        { code: "liquid_level_percent", value: 45, time: 1 },
        { code: "switch_6", value: true, time: 1 },
      ]),
    ).toBe(true);
  });

  it("reads false when switch_6 is off — distinct from motor_status, which can disagree", () => {
    // Confirmed live (2026-10-16): a real device read switch_6: false while
    // motor_status: "Dryrun" — the fault flag is independent of on/off.
    expect(
      motorOnFromProperties([
        { code: "switch_6", value: false, time: 1 },
        { code: "motor_status", value: "Dryrun", time: 1 },
      ]),
    ).toBe(false);
  });

  it("is null for a device with no switch_6 on its shadow at all", () => {
    expect(motorOnFromProperties([{ code: "liquid_level_percent", value: 45, time: 1 }])).toBeNull();
  });

  it("is null when the datapoint is present but not a boolean (a malformed read)", () => {
    expect(motorOnFromProperties([{ code: "switch_6", value: "true", time: 1 }])).toBeNull();
  });
});

describe("motorStatusFromProperties — the controller's own fault/health flag, verbatim (NOT on/off)", () => {
  it("reads the real motor_status datapoint, as observed on the account's own IT56WLCW controllers", () => {
    expect(
      motorStatusFromProperties([
        { code: "liquid_level_percent", value: 45, time: 1 },
        { code: "motor_status", value: "Normal", time: 1 },
      ]),
    ).toBe("Normal");
  });

  it("is null for a plain level sensor with no motor output on its shadow at all", () => {
    expect(motorStatusFromProperties([{ code: "liquid_level_percent", value: 45, time: 1 }])).toBeNull();
  });

  it("is null for a blank string rather than reporting an empty status", () => {
    expect(motorStatusFromProperties([{ code: "motor_status", value: "   ", time: 1 }])).toBeNull();
  });

  it("is null when the datapoint is present but not a string (a malformed read)", () => {
    expect(motorStatusFromProperties([{ code: "motor_status", value: 1, time: 1 }])).toBeNull();
  });

  it("passes through whatever string Tuya reports, never translating it", () => {
    expect(motorStatusFromProperties([{ code: "motor_status", value: "Dry Run", time: 1 }])).toBe("Dry Run");
  });
});
