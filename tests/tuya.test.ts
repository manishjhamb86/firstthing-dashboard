import { describe, expect, it } from "vitest";
import { levelFromFloatSwitches, levelFromProperties, motorOnFromProperties, motorStatusFromProperties } from "@/lib/tuya";

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

describe("levelFromProperties — float switches vs the analogue channel", () => {
  const t = (iso: string) => Date.parse(iso);
  // Palm Drive S6's real shadow, 2026-11-21: analogue stuck at 0 since May,
  // floats live — Level 1 and 2 wet, 3 just dropped, 4 dry → 50%.
  const palm = [
    { code: "switch_2", value: false, time: t("2026-11-21T01:35:20Z") },
    { code: "switch_3", value: true, time: t("2026-11-20T07:17:08Z") },
    { code: "switch_4", value: true, time: t("2026-11-20T07:17:08Z") },
    { code: "switch_5", value: false, time: t("2026-11-21T02:55:30Z") },
    { code: "liquid_level_percent", value: 0, time: t("2026-05-27T06:59:20Z") },
  ];
  it("reads the float switches when they reported after the analogue channel", () => {
    expect(levelFromProperties(palm, 60)).toEqual({ level: 50, raw: 50, time: t("2026-11-21T02:55:30Z") });
  });
  // Tower B RG Residency's shadow: analogue live (45/60 = 75%) and newer than the floats.
  it("keeps the analogue reading when it is the newer one", () => {
    const rg = [
      { code: "switch_2", value: false, time: t("2026-09-28T07:45:21Z") },
      { code: "switch_3", value: true, time: t("2026-10-11T13:49:06Z") },
      { code: "switch_4", value: true, time: t("2026-10-11T13:49:06Z") },
      { code: "switch_5", value: true, time: t("2026-11-16T14:05:27Z") },
      { code: "liquid_level_percent", value: 45, time: t("2026-11-17T08:12:21Z") },
    ];
    expect(levelFromProperties(rg, 60)?.level).toBe(75);
  });
  it("all floats dry reads 0%, all wet 100%", () => {
    const all = (v: boolean) => ["switch_2", "switch_3", "switch_4", "switch_5"].map((code) => ({ code, value: v, time: 2 }));
    expect(levelFromFloatSwitches(all(false))?.level).toBe(0);
    expect(levelFromFloatSwitches(all(true))?.level).toBe(100);
  });
  it("a device without all four floats falls back to the analogue channel", () => {
    expect(levelFromProperties([{ code: "liquid_level_percent", value: 30, time: 1 }, { code: "switch_2", value: true, time: 9 }], 60)?.level).toBe(50);
  });
});
