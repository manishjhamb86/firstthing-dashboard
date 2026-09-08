import { describe, it, expect } from "vitest";
import {
  CRITERION_WAIVER_NOTE,
  eligibilityState,
  eligibilityVerdict,
  MIN_METERED_LIGHTS,
  outstandingCriteria,
} from "@/lib/circuit-eligibility";

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

describe("operations' two ways past a failed checklist", () => {
  const drivewayFail = {
    eligibilityChecklist: {
      wifiReachable: true,
      fixturesUnder15ft: true,
      notOnDrivewayOrRamp: false,
    },
    meteredLightCount: 50,
  };

  it("a hard criterion is ineligible until something is done about it", () => {
    expect(eligibilityState(drivewayFail)).toBe("ineligible");
    expect(outstandingCriteria(drivewayFail)).toEqual(["notOnDrivewayOrRamp"]);
  });

  it("waiving that criterion makes it eligible, with the answers untouched", () => {
    // The waiver sits BESIDE the checklist — the surveyor said the fixtures
    // are on a ramp and that stays said. Only the verdict changes.
    const waived = { ...drivewayFail, waived: ["notOnDrivewayOrRamp"] };
    expect(eligibilityState(waived)).toBe("eligible");
    expect(outstandingCriteria(waived)).toEqual([]);
    expect((drivewayFail.eligibilityChecklist as Record<string, boolean>).notOnDrivewayOrRamp).toBe(false);
  });

  it("waiving one criterion does not let a second one through", () => {
    const two = {
      eligibilityChecklist: { wifiReachable: false, fixturesUnder15ft: true, notOnDrivewayOrRamp: false },
      meteredLightCount: 50,
    };
    expect(outstandingCriteria(two)).toEqual(["wifiReachable", "notOnDrivewayOrRamp"]);
    expect(eligibilityState({ ...two, waived: ["wifiReachable"] })).toBe("ineligible");
    expect(eligibilityState({ ...two, waived: ["wifiReachable", "notOnDrivewayOrRamp"] })).toBe("eligible");
  });

  it("a short light count on top of a hard failure is waived in the same act", () => {
    // KW Srishti: 49 lights AND on a ramp. Both are outstanding, so both are
    // what the approval covers — leaving the count behind would move the
    // circuit from ineligible to still-not-eligible, which is not a route.
    const both = { ...drivewayFail, meteredLightCount: 49 };
    expect(outstandingCriteria(both)).toEqual(["notOnDrivewayOrRamp", "lightCount"]);
    expect(eligibilityState({ ...both, waived: outstandingCriteria(both) })).toBe("eligible");
  });

  it("correcting the answer needs no waiver at all", () => {
    const corrected = {
      eligibilityChecklist: { ...drivewayFail.eligibilityChecklist, notOnDrivewayOrRamp: true },
      meteredLightCount: 50,
    };
    expect(eligibilityState(corrected)).toBe("eligible");
    expect(outstandingCriteria(corrected)).toEqual([]);
  });

  it("a corrected answer on a short circuit lands on the exception decision, not past it", () => {
    const corrected = {
      eligibilityChecklist: { ...drivewayFail.eligibilityChecklist, notOnDrivewayOrRamp: true },
      meteredLightCount: 49,
    };
    expect(eligibilityState(corrected)).toBe("surveyed");
    expect(outstandingCriteria(corrected)).toEqual(["lightCount"]);
  });

  it("waiving WiFi states what it commits the crew to", () => {
    // The user's own resolution of the one criterion that looked like it could
    // strand a commissioning: a router goes out with the crew.
    expect(CRITERION_WAIVER_NOTE.wifiReachable).toMatch(/4G router/i);
    expect(CRITERION_WAIVER_NOTE.notOnDrivewayOrRamp).toBeUndefined();
  });
});
