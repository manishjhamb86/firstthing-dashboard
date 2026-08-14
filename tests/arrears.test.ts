import { describe, expect, it } from "vitest";
import {
  addDays,
  arrearsStateOf,
  refuseExtension,
  releaseBlockers,
  shouldFireSuspension,
  triage,
} from "../src/lib/arrears";

const RELEASED = new Date("2026-09-01T00:00:00.000Z");

function stateAt(now: Date, over: Partial<Parameters<typeof arrearsStateOf>[0]> = {}) {
  return arrearsStateOf({
    releasedAt: RELEASED,
    amountPaid: 0,
    invoiceAmount: 10_000,
    paymentConfirmedAsOf: null,
    extensionDaysGranted: 0,
    alreadySuspendedAt: null,
    now,
    ...over,
  });
}

describe("CON-13 — the arrears clock", () => {
  it("keys off release, not generation: an unreleased invoice has no clock at all", () => {
    const s = stateAt(new Date("2026-10-01T00:00:00.000Z"), { releasedAt: null });
    expect(s.phase).toBe("not_released");
    expect(s.suspendDueAt).toBeNull();
    // A society cannot be late paying an invoice it has not been shown.
  });

  it("starts tracking 2 days after release, warns at +10, suspends 5 days later", () => {
    const s = stateAt(new Date("2026-09-01T12:00:00.000Z"));
    expect(s.overdueTrackingFrom).toEqual(new Date("2026-09-03T00:00:00.000Z"));
    expect(s.warningFrom).toEqual(new Date("2026-09-13T00:00:00.000Z"));
    expect(s.suspendDueAt).toEqual(new Date("2026-09-18T00:00:00.000Z"));
  });

  it("walks current → overdue → warning as the days pass", () => {
    expect(stateAt(new Date("2026-09-02T00:00:00.000Z")).phase).toBe("current");
    expect(stateAt(new Date("2026-09-03T00:00:00.000Z")).phase).toBe("overdue");
    expect(stateAt(new Date("2026-09-12T23:59:59.000Z")).phase).toBe("overdue");
    expect(stateAt(new Date("2026-09-13T00:00:00.000Z")).phase).toBe("warning");
  });

  it("counts the remaining days down to suspension during the warning window", () => {
    expect(stateAt(new Date("2026-09-13T00:00:00.000Z")).daysUntilSuspension).toBe(5);
    expect(stateAt(new Date("2026-09-17T00:00:00.000Z")).daysUntilSuspension).toBe(1);
  });

  it("pushes the suspension date out by the days granted, and only by those", () => {
    const s = stateAt(new Date("2026-09-13T00:00:00.000Z"), { extensionDaysGranted: 5 });
    expect(s.suspendDueAt).toEqual(new Date("2026-09-23T00:00:00.000Z"));
    // The warning itself does not move — the countdown is longer, not later.
    expect(s.warningFrom).toEqual(new Date("2026-09-13T00:00:00.000Z"));
  });

  it("treats a paid invoice as paid even after suspension has fired", () => {
    const s = stateAt(new Date("2026-09-20T00:00:00.000Z"), {
      amountPaid: 10_000,
      alreadySuspendedAt: new Date("2026-09-18T00:00:00.000Z"),
    });
    expect(s.phase).toBe("paid");
  });

  it("treats a part payment as not paid", () => {
    expect(stateAt(new Date("2026-09-14T00:00:00.000Z"), { amountPaid: 9_999 }).phase).toBe("warning");
  });
});

describe("CON-13 — the stale-payment safety rule (TC-087-3)", () => {
  const NOW = new Date("2026-09-18T09:00:00.000Z");
  const state = stateAt(NOW);

  function verdict(over: Partial<Parameters<typeof shouldFireSuspension>[0]> = {}) {
    return shouldFireSuspension({
      state,
      amountPaid: 0,
      invoiceAmount: 10_000,
      paymentStatusConfirmedAt: NOW,
      alreadySuspendedAt: null,
      now: NOW,
      ...over,
    });
  }

  it("fires automatically once due, with nobody's approval", () => {
    expect(verdict()).toEqual({ fire: true });
    // CON-13's design: every human touchpoint is a brake, never a trigger.
  });

  it("REFUSES on payment data confirmed yesterday, not today", () => {
    // The case the invariant exists to prevent. "No record of payment" can
    // mean "nobody has checked since Tuesday" — and suspending on that halts
    // real field servicing at a society that may well have paid.
    expect(verdict({ paymentStatusConfirmedAt: new Date("2026-09-17T23:59:59.000Z") })).toEqual({
      fire: false,
      reason: "stale_payment_data",
    });
  });

  it("REFUSES when payment status has never been confirmed", () => {
    expect(verdict({ paymentStatusConfirmedAt: null })).toEqual({
      fire: false,
      reason: "stale_payment_data",
    });
  });

  it("accepts a confirmation from earlier the same day", () => {
    expect(verdict({ paymentStatusConfirmedAt: new Date("2026-09-18T00:00:01.000Z") })).toEqual({
      fire: true,
    });
  });

  it("does not fire before the due date, however fresh the data", () => {
    const early = new Date("2026-09-17T09:00:00.000Z");
    expect(
      shouldFireSuspension({
        state: stateAt(early),
        amountPaid: 0,
        invoiceAmount: 10_000,
        paymentStatusConfirmedAt: early,
        alreadySuspendedAt: null,
        now: early,
      }),
    ).toEqual({ fire: false, reason: "not_due" });
  });

  it("does not fire twice", () => {
    expect(verdict({ alreadySuspendedAt: new Date("2026-09-18T00:00:00.000Z") })).toEqual({
      fire: false,
      reason: "already_suspended",
    });
  });

  it("does not fire on a paid invoice", () => {
    expect(verdict({ amountPaid: 10_000 })).toEqual({ fire: false, reason: "paid" });
  });
});

describe("CON-13 — extension limits", () => {
  it("allows up to 5 days per request", () => {
    expect(refuseExtension(1)).toBeNull();
    expect(refuseExtension(5)).toBeNull();
  });

  it("refuses more than 5 days in a single grant", () => {
    expect(refuseExtension(6)).toMatch(/up to 5 days per request/);
  });

  it("refuses a zero, negative or fractional grant", () => {
    expect(refuseExtension(0)).not.toBeNull();
    expect(refuseExtension(-3)).not.toBeNull();
    expect(refuseExtension(2.5)).not.toBeNull();
  });
});

describe("SCR-092 — release-queue triage", () => {
  const routine = {
    anyOutOfBand: false,
    basisChangedSinceLastMonth: false,
    total: 100_000,
    trailingMean: 100_000,
    hasOpenDispute: false,
    coverageDays: 31,
    unacknowledgedInvoiceMismatch: false,
    invoiceAttached: true,
  };

  it("calls a clean month routine", () => {
    expect(triage(routine)).toEqual({ routine: true, reasons: [] });
  });

  it("needs review when any circuit is out of band", () => {
    const t = triage({ ...routine, anyOutOfBand: true });
    expect(t.routine).toBe(false);
    expect(t.reasons).toContain("A circuit is outside its contracted band");
  });

  it("needs review when a circuit changed pricing basis", () => {
    expect(triage({ ...routine, basisChangedSinceLastMonth: true }).routine).toBe(false);
  });

  it("needs review when the total moves more than 10% from the 3-month mean", () => {
    expect(triage({ ...routine, total: 110_001 }).reasons[0]).toMatch(/above the 3-month average/);
    expect(triage({ ...routine, total: 89_999 }).reasons[0]).toMatch(/below the 3-month average/);
  });

  it("accepts a total exactly 10% away — the rule is 'more than'", () => {
    expect(triage({ ...routine, total: 110_000 }).routine).toBe(true);
    expect(triage({ ...routine, total: 90_000 }).routine).toBe(true);
  });

  it("states the variance in the accountant's language, with a real number", () => {
    // "Total is 34% above the 3-month average", never "anomaly".
    expect(triage({ ...routine, total: 134_000 }).reasons).toContain(
      "Total is 34% above the 3-month average",
    );
  });

  it("does not judge variance for a society with no billing history", () => {
    expect(triage({ ...routine, trailingMean: null, total: 999_999 }).routine).toBe(true);
  });

  it("needs review below 28 days of coverage, and says how many there are", () => {
    expect(triage({ ...routine, coverageDays: 27 }).reasons).toContain("Only 27 days of readings");
    expect(triage({ ...routine, coverageDays: 28 }).routine).toBe(true);
  });

  it("needs review on an open dispute or a missing/mismatched invoice", () => {
    expect(triage({ ...routine, hasOpenDispute: true }).routine).toBe(false);
    expect(triage({ ...routine, invoiceAttached: false }).routine).toBe(false);
    expect(triage({ ...routine, unacknowledgedInvoiceMismatch: true }).routine).toBe(false);
  });

  it("reports every failing condition, not just the first", () => {
    const t = triage({ ...routine, anyOutOfBand: true, hasOpenDispute: true, coverageDays: 10 });
    expect(t.reasons).toHaveLength(3);
  });
});

describe("FEAT-054-AC-3 — hard release blockers", () => {
  const ok = {
    status: "calculated",
    invoiceAttached: true,
    unacknowledgedInvoiceMismatch: false,
    openBlockingAnomalies: 0,
    reportGenerated: true,
  };

  it("permits a complete month", () => {
    expect(releaseBlockers(ok)).toEqual([]);
  });

  it("blocks on unresolved reading flags (INV-09), and counts them", () => {
    expect(releaseBlockers({ ...ok, openBlockingAnomalies: 3 })[0]).toMatch(/3 reading flag/);
  });

  it("blocks a held month, a missing invoice, a missing report, and a re-release", () => {
    expect(releaseBlockers({ ...ok, status: "held" })).toHaveLength(1);
    expect(releaseBlockers({ ...ok, invoiceAttached: false })).toHaveLength(1);
    expect(releaseBlockers({ ...ok, reportGenerated: false })).toHaveLength(1);
    expect(releaseBlockers({ ...ok, status: "released" })).toHaveLength(1);
  });
});

describe("addDays", () => {
  it("crosses a month boundary without drifting", () => {
    expect(addDays(new Date("2026-08-30T00:00:00.000Z"), 3)).toEqual(
      new Date("2026-09-02T00:00:00.000Z"),
    );
  });
});
