import { describe, it, expect } from "vitest";
import { eligibilityVerdict, MIN_METERED_LIGHTS } from "@/lib/circuit-eligibility";

describe("CON-16's verdict names what ruled a candidate out", () => {
  it("names the hard criterion, and offers no exception for it", () => {
    // KW Srishti's own row on stage, 2026-09-08: the surveyor answered no to
    // the driveway/ramp question AND the circuit holds 49 lights, so the
    // operator went looking for the exception approval that never applies.
    const v = eligibilityVerdict({
      eligibilityChecklist: {
        wifiReachable: true,
        fixturesUnder15ft: true,
        notOnDrivewayOrRamp: false,
        lightCountMinMet: false,
      },
      meteredLightCount: 49,
    });
    expect(v.failedHard.map((k) => k.name)).toEqual(["notOnDrivewayOrRamp"]);
    expect(v.lightCountShort).toBe(true);
    // …and this is the half that matters: short on lights, but NOT
    // exception-able, because a hard criterion decided it first.
    expect(v.exceptionable).toBe(false);
  });

  it("offers the exception when the light count is the only thing in the way", () => {
    const v = eligibilityVerdict({
      eligibilityChecklist: {
        wifiReachable: true,
        fixturesUnder15ft: true,
        notOnDrivewayOrRamp: true,
      },
      meteredLightCount: MIN_METERED_LIGHTS - 1,
    });
    expect(v.failedHard).toEqual([]);
    expect(v.exceptionable).toBe(true);
  });

  it("a criterion nobody answered reads as failed, never as passed", () => {
    const v = eligibilityVerdict({ eligibilityChecklist: null, meteredLightCount: 200 });
    expect(v.failedHard).toHaveLength(3);
    expect(v.lightCountShort).toBe(false);
    expect(v.exceptionable).toBe(false);
  });

  it("ignores the criterion CON-16 retired rather than failing on it", () => {
    // noSharedAppliances was removed 2026-08-26; a circuit recorded before
    // that still carries it and must not be re-judged against it.
    const v = eligibilityVerdict({
      eligibilityChecklist: {
        wifiReachable: true,
        fixturesUnder15ft: true,
        notOnDrivewayOrRamp: true,
        noSharedAppliances: false,
      },
      meteredLightCount: 96,
    });
    expect(v.failedHard).toEqual([]);
  });
});
