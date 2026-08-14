import { describe, expect, it } from "vitest";
import {
  effectiveBaselineAt,
  effectiveLightCountAt,
  refuseRescale,
  rescaleBaseline,
  type RescaleEvent,
} from "@/lib/benchmark-rescale";

// FEAT-041 — 12-test-plan.md §3 assigns AC-1 and AC-5 to `unit` (CAP-02
// pure computation). AC-3's refusal rule is decidable purely too, so it is
// covered here as well as at the action level.

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function ev(partial: Partial<RescaleEvent> & { effectiveDate: Date; rescaledBaseline: number }): RescaleEvent {
  return {
    previousLightCount: 50,
    newLightCount: 54,
    previousBaseline: 100,
    ...partial,
  };
}

describe("TC-041-1 — rescaleBaseline (FEAT-041-AC-1)", () => {
  it("reproduces CON-10's worked example exactly: 100 ÷ 50 × 54 = 108", () => {
    expect(rescaleBaseline(100, 50, 54)).toBe(108);
  });

  it("scales down when lights are removed", () => {
    expect(rescaleBaseline(100, 50, 40)).toBe(80);
  });

  it("does not round — the baseline feeds a rupee figure the society is billed on (INV-02)", () => {
    // 1078 ÷ 60 × 64 = 1149.8666… — asserting the unrounded value on
    // purpose: rounding here would push error into the billed number.
    expect(rescaleBaseline(1078, 60, 64)).toBeCloseTo(1149.8666666666666, 10);
  });

  it("is proportional, so a doubled count doubles the baseline", () => {
    expect(rescaleBaseline(212.5, 50, 100)).toBe(425);
  });
});

describe("TC-041-3 — refuseRescale (FEAT-041-AC-3 and input rules)", () => {
  const ok = {
    commissionedBaseline: 100,
    currentLightCount: 50,
    newLightCount: 54,
    verificationNote: "Counted on site with the society's electrician; photo attached.",
    effectiveDate: d("2026-09-01"),
  };

  it("allows a fully verified change", () => {
    expect(refuseRescale(ok)).toBeNull();
  });

  it("refuses a count change with no supporting verification", () => {
    expect(refuseRescale({ ...ok, verificationNote: "   " })).toBe("unverified");
  });

  it("refuses when the circuit has no commissioned baseline yet", () => {
    expect(refuseRescale({ ...ok, commissionedBaseline: null })).toBe("no-baseline");
  });

  it("refuses a no-op change", () => {
    expect(refuseRescale({ ...ok, newLightCount: 50 })).toBe("same-count");
  });

  it("refuses a zero, negative, or fractional light count", () => {
    expect(refuseRescale({ ...ok, newLightCount: 0 })).toBe("invalid-count");
    expect(refuseRescale({ ...ok, newLightCount: -4 })).toBe("invalid-count");
    expect(refuseRescale({ ...ok, newLightCount: 54.5 })).toBe("invalid-count");
  });

  it("refuses a missing or unparseable effective date", () => {
    expect(refuseRescale({ ...ok, effectiveDate: null })).toBe("invalid-date");
    expect(refuseRescale({ ...ok, effectiveDate: new Date("nonsense") })).toBe("invalid-date");
  });
});

describe("TC-041-2 — effectiveBaselineAt with no events (FEAT-041-AC-2)", () => {
  it("returns the original commissioned baseline when nothing has ever changed", () => {
    expect(effectiveBaselineAt(100, [], d("2027-01-01"))).toBe(100);
  });

  it("returns the commissioned light count when nothing has ever changed", () => {
    expect(effectiveLightCountAt(50, [], d("2027-01-01"))).toBe(50);
  });

  it("returns null when there is no commissioned baseline at all", () => {
    expect(effectiveBaselineAt(null, [], d("2027-01-01"))).toBeNull();
  });
});

describe("TC-041-5 — effectiveBaselineAt applies forward only (FEAT-041-AC-5)", () => {
  const rescale = ev({ effectiveDate: d("2026-09-01"), rescaledBaseline: 108 });

  it("a month before the effective date still sees the pre-rescale baseline", () => {
    // The August invoice was raised against 100 and is never restated.
    expect(effectiveBaselineAt(100, [rescale], d("2026-08-31"))).toBe(100);
  });

  it("the effective date itself is inclusive", () => {
    expect(effectiveBaselineAt(100, [rescale], d("2026-09-01"))).toBe(108);
  });

  it("months after the effective date compare against the new baseline", () => {
    expect(effectiveBaselineAt(100, [rescale], d("2026-10-15"))).toBe(108);
  });

  it("a rescale backdated into an already-invoiced month does not change that month's figure", () => {
    // Recorded in October, dated 1 Aug. September's comparison — already
    // billed — must still resolve to the baseline in force at the time.
    const backdated = ev({ effectiveDate: d("2026-08-01"), rescaledBaseline: 108 });
    expect(effectiveBaselineAt(100, [backdated], d("2026-07-31"))).toBe(100);
    // and from the effective date forward it does apply
    expect(effectiveBaselineAt(100, [backdated], d("2026-09-30"))).toBe(108);
  });

  it("replays several rescales in effective-date order, not insertion order", () => {
    const events: RescaleEvent[] = [
      ev({ effectiveDate: d("2027-01-01"), previousBaseline: 108, rescaledBaseline: 120, previousLightCount: 54, newLightCount: 60 }),
      ev({ effectiveDate: d("2026-09-01"), rescaledBaseline: 108 }),
    ];
    expect(effectiveBaselineAt(100, events, d("2026-08-01"))).toBe(100);
    expect(effectiveBaselineAt(100, events, d("2026-12-01"))).toBe(108);
    expect(effectiveBaselineAt(100, events, d("2027-06-01"))).toBe(120);
    expect(effectiveLightCountAt(50, events, d("2027-06-01"))).toBe(60);
  });
});
