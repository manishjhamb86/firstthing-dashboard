import { describe, expect, it } from "vitest";
import {
  completionBlockers,
  evaluateDayGate,
  refuseGateSkip,
  reviewDeadlineFor,
  type BatchGateInput,
} from "@/lib/installation-gate";

const START = new Date("2026-09-11T09:00:00Z"); // tomorrow's crew start
const DEADLINE = new Date("2026-09-11T06:00:00Z"); // 3 hours before

function batch(o: Partial<BatchGateInput> = {}): BatchGateInput {
  return {
    id: "b1",
    areaKey: "Tower A",
    state: "approved",
    submittedAt: new Date("2026-09-10T18:00:00Z"),
    reviewedAt: new Date("2026-09-10T19:12:00Z"),
    ...o,
  };
}

describe("TC-035-1 — the 3-hour deadline (CON-21, FEAT-035-AC-1)", () => {
  it("counts back 3 hours from the crew's actual planned start, not a fixed hour", () => {
    expect(reviewDeadlineFor(START).toISOString()).toBe(DEADLINE.toISOString());
    // a 07:00 start moves the deadline to 04:00 the same day
    expect(reviewDeadlineFor(new Date("2026-09-11T07:00:00Z")).toISOString()).toBe("2026-09-11T04:00:00.000Z");
  });

  it("unblocks the next day when approval landed before the deadline", () => {
    const g = evaluateDayGate({ previousBatches: [batch()], startAt: START, now: new Date("2026-09-11T05:00:00Z") });
    expect(g.status).toBe("clear");
    expect(g.canStart).toBe(true);
  });

  it("clears day 1, which has nothing behind it to approve", () => {
    const g = evaluateDayGate({ previousBatches: [], startAt: START, now: new Date("2026-09-11T05:00:00Z") });
    expect(g.status).toBe("clear");
    expect(g.canStart).toBe(true);
  });

  it("requires every area's batch, not just one of them", () => {
    const g = evaluateDayGate({
      previousBatches: [batch(), batch({ id: "b2", areaKey: "Tower B", state: "awaiting_review", reviewedAt: null })],
      startAt: START,
      now: new Date("2026-09-11T05:00:00Z"),
    });
    expect(g.canStart).toBe(true); // deadline not yet passed
    expect(g.outstanding.map((b) => b.areaKey)).toEqual(["Tower B"]);
  });
});

describe("TC-035-3 — blocked before the crew arrives (FEAT-035-AC-3)", () => {
  const unapproved = [batch({ state: "awaiting_review", reviewedAt: null })];

  it("blocks once the deadline passes with the previous day unapproved", () => {
    const g = evaluateDayGate({ previousBatches: unapproved, startAt: START, now: DEADLINE });
    expect(g.status).toBe("blocked");
    expect(g.canStart).toBe(false);
    expect(g.outstanding).toHaveLength(1);
  });

  it("warns inside the last 3 hours before the deadline, while it can still be saved", () => {
    const g = evaluateDayGate({
      previousBatches: unapproved,
      startAt: START,
      now: new Date("2026-09-11T04:00:00Z"), // 2h before the 06:00 deadline
    });
    expect(g.status).toBe("at_risk");
    expect(g.canStart).toBe(true);
    expect(g.reason).toContain("tomorrow's crew");
  });

  it("is merely pending well ahead of the deadline — not every unreviewed batch is an alarm", () => {
    const g = evaluateDayGate({
      previousBatches: unapproved,
      startAt: START,
      now: new Date("2026-09-10T20:00:00Z"),
    });
    expect(g.status).toBe("pending");
    expect(g.reason).toBeNull();
  });

  it("blocks on a dispute regardless of how early it was raised", () => {
    const g = evaluateDayGate({
      previousBatches: [batch({ state: "disputed", reviewedAt: new Date("2026-09-10T19:00:00Z") })],
      startAt: START,
      now: new Date("2026-09-10T19:30:00Z"), // hours before the deadline
    });
    expect(g.status).toBe("blocked");
    expect(g.canStart).toBe(false);
    expect(g.disputed).toHaveLength(1);
  });

  it("lets a late approval proceed but never reports it as clear", () => {
    const g = evaluateDayGate({
      previousBatches: [batch({ reviewedAt: new Date("2026-09-11T07:30:00Z") })], // after the 06:00 deadline
      startAt: START,
      now: new Date("2026-09-11T08:00:00Z"),
    });
    expect(g.status).toBe("late_approved");
    expect(g.canStart).toBe(true);
    expect(g.status).not.toBe("clear"); // the gate was missed, and stays visibly missed
  });
});

describe("TC-035-5 — the once-per-project skip (FEAT-035-AC-5, CON-21)", () => {
  it("clears a blocked gate when the skip is applied to that day", () => {
    const g = evaluateDayGate({
      previousBatches: [batch({ state: "awaiting_review", reviewedAt: null })],
      startAt: START,
      now: DEADLINE,
      skipUsedForDay: true,
    });
    expect(g.status).toBe("skipped");
    expect(g.canStart).toBe(true);
  });

  it("allows the first skip against a genuinely blocked gate", () => {
    expect(refuseGateSkip({ gateSkipUsedAt: null, reason: "Onlooker travelling; RWA confirmed by phone.", gateBlocked: true })).toBeNull();
  });

  it("refuses a second skip — a hard count, not a soft warning", () => {
    expect(
      refuseGateSkip({ gateSkipUsedAt: new Date("2026-09-05T10:00:00Z"), reason: "again", gateBlocked: true }),
    ).toBe("already-used");
  });

  it("refuses a skip with no recorded reason", () => {
    expect(refuseGateSkip({ gateSkipUsedAt: null, reason: "   ", gateBlocked: true })).toBe("no-reason");
  });

  it("refuses spending the allowance on a gate that isn't blocking anything", () => {
    expect(refuseGateSkip({ gateSkipUsedAt: null, reason: "just in case", gateBlocked: false })).toBe("not-blocked");
  });
});

describe("TC-037-3 — the completion gate lists everything outstanding (FEAT-037-AC-2/3)", () => {
  it("is clear when every batch is approved and nothing is open", () => {
    expect(
      completionBlockers({ batches: [batch(), batch({ id: "b2" })], openBlockerCount: 0, plannedDayCount: 2, daysWithBatches: 2 }),
    ).toEqual([]);
  });

  it("names every reason at once, not just the first", () => {
    const r = completionBlockers({
      batches: [batch({ state: "disputed" }), batch({ id: "b2", state: "awaiting_review", reviewedAt: null })],
      openBlockerCount: 2,
      plannedDayCount: 5,
      daysWithBatches: 2,
    });
    expect(r.map((x) => x.kind).sort()).toEqual([
      "disputed-batches",
      "open-blockers",
      "unapproved-batches",
      "unplanned-days",
    ]);
  });

  it("refuses completion with an open blocker (FEAT-037-AC-3)", () => {
    const r = completionBlockers({ batches: [batch()], openBlockerCount: 1, plannedDayCount: 1, daysWithBatches: 1 });
    expect(r).toEqual([{ kind: "open-blockers", count: 1 }]);
  });

  it("refuses completion when a planned day was never worked", () => {
    const r = completionBlockers({ batches: [batch()], openBlockerCount: 0, plannedDayCount: 4, daysWithBatches: 1 });
    expect(r).toEqual([{ kind: "unplanned-days", count: 3 }]);
  });

  it("refuses completion before any work is logged at all", () => {
    const r = completionBlockers({ batches: [], openBlockerCount: 0, plannedDayCount: 3, daysWithBatches: 0 });
    expect(r.map((x) => x.kind)).toContain("no-batches");
  });
});
