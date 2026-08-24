import { describe, expect, it } from "vitest";
import {
  DECISION_REFUSALS,
  ROOT_CAUSES,
  billingConsequence,
  queueRank,
  refuseDecision,
  rootCauseMeta,
} from "@/lib/deviation-review";

const base = {
  rootCause: "firsthing_attributable" as const,
  correctedAtNoCost: false,
  decision: "Driver failure on two fittings, replaced 12 Aug.",
  societyExplanation: "",
  ownerId: "admin-1",
};

describe("CON-01b's exclusion list", () => {
  it("counts exactly one cause against the guarantee", () => {
    const against = ROOT_CAUSES.filter((r) => r.countsAgainstGuarantee);
    expect(against.map((r) => r.id)).toEqual(["firsthing_attributable"]);
  });

  it("names all five excluded causes from the constraint", () => {
    // CON-01b: "changes in lighting layout, blocked sensors, usage-pattern
    // changes, external electrical issues, or lack of society-side
    // maintenance". A cause missing here is a shortfall silently charged to
    // FirsThing that the contract excludes.
    expect(ROOT_CAUSES.filter((r) => !r.countsAgainstGuarantee).map((r) => r.id).sort()).toEqual([
      "blocked_sensors",
      "external_electrical",
      "lighting_layout_change",
      "society_maintenance",
      "usage_pattern_change",
    ]);
  });

  it("rejects an unknown cause rather than treating it as excluded", () => {
    // Defaulting an unrecognised cause to "excluded" would silently protect
    // the wrong party.
    expect(() => rootCauseMeta("not_a_cause" as never)).toThrow();
  });
});

describe("INV-03 — a decision is a classification with an owner, not a flag", () => {
  it("refuses a decision with no root cause", () => {
    expect(refuseDecision({ ...base, rootCause: null })).toBe(DECISION_REFUSALS.noRootCause);
  });

  it("refuses a decision with no owner", () => {
    expect(refuseDecision({ ...base, ownerId: null })).toBe(DECISION_REFUSALS.noOwner);
  });

  it("refuses a classification with no reasoning behind it", () => {
    expect(refuseDecision({ ...base, decision: "   " })).toBe(DECISION_REFUSALS.noReasoning);
  });

  it("refuses an excluded cause with nothing to tell the society", () => {
    expect(
      refuseDecision({ ...base, rootCause: "blocked_sensors", societyExplanation: " " }),
    ).toBe(DECISION_REFUSALS.noSocietyExplanation);
  });

  it("does not demand a society explanation when the cause is ours", () => {
    // The society is not owed an explanation for a shortfall FirsThing is
    // absorbing — it costs them nothing.
    expect(refuseDecision(base)).toBeNull();
  });

  it("accepts an excluded cause once the society has been given a reason", () => {
    expect(
      refuseDecision({
        ...base,
        rootCause: "society_maintenance",
        societyExplanation: "Common-area fittings were painted over during block repairs.",
      }),
    ).toBeNull();
  });
});

describe("CON-01b/c — what a decision does to money", () => {
  it("an excluded cause never exposes the next month", () => {
    for (const cause of ROOT_CAUSES.filter((r) => !r.countsAgainstGuarantee)) {
      const c = billingConsequence({ rootCause: cause.id, correctedAtNoCost: false });
      expect(c.exposesNextMonth).toBe(false);
    }
  });

  it("an attributable cause corrected at no cost does not either", () => {
    // CON-01b's own wording: "must be corrected within a month at no cost,
    // or the invoice is adjusted". Corrected, there is nothing to adjust.
    const c = billingConsequence({ rootCause: "firsthing_attributable", correctedAtNoCost: true });
    expect(c.exposesNextMonth).toBe(false);
  });

  it("an attributable, uncorrected cause exposes the next out-of-band month", () => {
    const c = billingConsequence({ rootCause: "firsthing_attributable", correctedAtNoCost: false });
    expect(c.exposesNextMonth).toBe(true);
  });

  it("never claims THIS month adjusts — CON-01c says month 1 never does", () => {
    const c = billingConsequence({ rootCause: "firsthing_attributable", correctedAtNoCost: false });
    expect(c.detail).toMatch(/month 1 never adjusts/i);
    expect(c.headline).toMatch(/next month/i);
  });
});

describe("queue order — the cheapest resolution is the easiest to reach", () => {
  const now = new Date("2026-08-21T00:00:00Z");
  const raised = new Date("2026-08-18T00:00:00Z");

  it("puts an undecided review above a decided one", () => {
    const undecided = queueRank({ state: "raised", coverageDays: 30, daysInMonth: 30, raisedAt: raised, now });
    const decided = queueRank({ state: "decided", coverageDays: 30, daysInMonth: 30, raisedAt: raised, now });
    expect(undecided).toBeLessThan(decided);
  });

  it("puts a deviation a coverage gap could explain above one that needs a site visit", () => {
    // FEAT-055-AC-5 — resolving it as a data issue costs nobody a journey.
    const gap = queueRank({ state: "raised", coverageDays: 22, daysInMonth: 31, raisedAt: raised, now });
    const full = queueRank({ state: "raised", coverageDays: 31, daysInMonth: 31, raisedAt: raised, now });
    expect(gap).toBeLessThan(full);
  });

  it("breaks ties by age, oldest first", () => {
    const old = queueRank({ state: "raised", coverageDays: 30, daysInMonth: 30, raisedAt: new Date("2026-08-01T00:00:00Z"), now });
    const fresh = queueRank({ state: "raised", coverageDays: 30, daysInMonth: 30, raisedAt: raised, now });
    expect(old).toBeLessThan(fresh);
  });

  it("does not let age outrank an undecided review", () => {
    // A month-old decided review must never sit above a fresh undecided one.
    const oldDecided = queueRank({ state: "decided", coverageDays: 30, daysInMonth: 30, raisedAt: new Date("2026-06-01T00:00:00Z"), now });
    const freshRaised = queueRank({ state: "raised", coverageDays: 31, daysInMonth: 31, raisedAt: now, now });
    expect(freshRaised).toBeLessThan(oldDecided);
  });
});
