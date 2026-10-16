import { describe, expect, it } from "vitest";
import { motorStatusFromProperties } from "@/lib/tuya";

describe("motorStatusFromProperties — the controller's own valve/motor status, verbatim", () => {
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
