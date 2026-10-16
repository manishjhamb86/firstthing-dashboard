import { describe, expect, it } from "vitest";
import {
  completionBlockers,
  partialCompletionBlockers,
  evaluateDayGate,
  evaluateDayGateChain,
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

describe("partialCompletionBlockers — the exceptional-billing exemption (2026-10-14, user-asked)", () => {
  it("clears unplanned-days alone — more planned days still to come is exactly the exception being made", () => {
    const r = partialCompletionBlockers({ batches: [batch()], openBlockerCount: 0, plannedDayCount: 4, daysWithBatches: 1 });
    expect(r).toEqual([]);
  });

  it("still refuses on a disputed batch — the exception is for incompleteness, not a data-integrity problem", () => {
    const r = partialCompletionBlockers({
      batches: [batch({ state: "disputed" })],
      openBlockerCount: 0,
      plannedDayCount: 4,
      daysWithBatches: 1,
    });
    expect(r.map((x) => x.kind)).toEqual(["disputed-batches"]);
  });

  it("still refuses on an open blocker", () => {
    const r = partialCompletionBlockers({ batches: [batch()], openBlockerCount: 1, plannedDayCount: 4, daysWithBatches: 1 });
    expect(r).toEqual([{ kind: "open-blockers", count: 1 }]);
  });

  it("still refuses on a batch genuinely submitted and awaiting the society's sign-off", () => {
    const r = partialCompletionBlockers({
      batches: [batch({ state: "awaiting_review" })],
      openBlockerCount: 0,
      plannedDayCount: 4,
      daysWithBatches: 1,
    });
    expect(r.map((x) => x.kind)).toEqual(["unapproved-batches"]);
  });

  it("clears an untouched draft batch too — a crew that started a day's row but never submitted it is the same fact as no batch at all (2026-10-14, user-caught on Prateek Laurel: a 5th, draft, un-submitted batch for a day with no planned-day row hid the option entirely)", () => {
    const r = partialCompletionBlockers({
      batches: [batch(), batch({ id: "b2", state: "draft", submittedAt: null, reviewedAt: null })],
      openBlockerCount: 0,
      plannedDayCount: 1,
      daysWithBatches: 2,
    });
    expect(r).toEqual([]);
  });

  it("still refuses when even one unapproved batch has actually been submitted, alongside an untouched one", () => {
    const r = partialCompletionBlockers({
      batches: [
        batch({ state: "draft", submittedAt: null, reviewedAt: null }),
        batch({ id: "b2", state: "awaiting_review" }),
      ],
      openBlockerCount: 0,
      plannedDayCount: 1,
      daysWithBatches: 2,
    });
    expect(r.map((x) => x.kind)).toEqual(["unapproved-batches"]);
  });

  it("still refuses with nothing logged at all", () => {
    const r = partialCompletionBlockers({ batches: [], openBlockerCount: 0, plannedDayCount: 4, daysWithBatches: 0 });
    expect(r.map((x) => x.kind)).toEqual(["no-batches"]);
  });
});

describe("evaluateDayGate — 'never submitted' reads differently from 'awaiting review' (2026-10-17, user-caught)", () => {
  // Aditya Urban Casa, production: day 1's batch sat in draft (the crew
  // opened it, never submitted) while the admin screen said "unapproved,"
  // which reads as "the society hasn't acted" — but the portal correctly
  // showed nothing to review, because nothing had actually been sent to
  // them. The reason text has to say which one is true.
  it("names a never-submitted batch, not 'unapproved'", () => {
    const g = evaluateDayGate({
      previousBatches: [batch({ state: "draft", submittedAt: null, reviewedAt: null })],
      startAt: START,
      now: DEADLINE,
    });
    expect(g.status).toBe("blocked");
    expect(g.reason).toContain("never submitted");
    expect(g.reason).not.toContain("awaiting the society's approval");
  });

  it("names a submitted-but-unreviewed batch distinctly", () => {
    const g = evaluateDayGate({
      previousBatches: [batch({ state: "awaiting_review", reviewedAt: null })],
      startAt: START,
      now: DEADLINE,
    });
    expect(g.status).toBe("blocked");
    expect(g.reason).toContain("awaiting the society's approval");
    expect(g.reason).not.toContain("never submitted");
  });

  it("names both counts when the areas are a mix of the two", () => {
    const g = evaluateDayGate({
      previousBatches: [
        batch({ id: "b1", state: "draft", submittedAt: null, reviewedAt: null }),
        batch({ id: "b2", areaKey: "Tower B", state: "awaiting_review", reviewedAt: null }),
      ],
      startAt: START,
      now: DEADLINE,
    });
    expect(g.reason).toContain("1 of the previous day's batches were never submitted");
    expect(g.reason).toContain("1 are still awaiting the society's approval");
  });
});

describe("evaluateDayGateChain — a block propagates forward (2026-10-17, user-caught)", () => {
  // Day 1 at 09:00, each day after one calendar day apart, same 09:00 start.
  const dayStart = (n: number) => new Date(`2026-09-${10 + n}T09:00:00Z`);

  it("day 1 clears, day 2 blocks on it, and every day after inherits the block — not just the next one", () => {
    const day1Batch = batch({ id: "d1", state: "awaiting_review", submittedAt: new Date("2026-09-10T18:00:00Z"), reviewedAt: null });
    const now = new Date("2026-09-12T10:00:00Z"); // well past day 2's deadline (06:00 on the 12th)

    const gates = evaluateDayGateChain({
      now,
      days: [
        { day: 1, startAt: dayStart(1), previousBatches: [] },
        { day: 2, startAt: dayStart(2), previousBatches: [day1Batch] }, // day 1's real batch
        { day: 3, startAt: dayStart(3), previousBatches: [] }, // day 2 never started — no batch of its own
        { day: 4, startAt: dayStart(4), previousBatches: [] },
        { day: 5, startAt: dayStart(5), previousBatches: [] },
      ],
    });

    expect(gates.get(1)!.canStart).toBe(true);
    expect(gates.get(1)!.status).toBe("clear");

    expect(gates.get(2)!.canStart).toBe(false);
    expect(gates.get(2)!.status).toBe("blocked");
    expect(gates.get(2)!.reason).toMatch(/deadline has passed/);

    // This is the exact bug reported: days 3, 4 and 5 must ALSO read
    // blocked, not "clear" just because day 2 (which has no batch, since it
    // never started) looks the same as "nothing precedes this."
    for (const d of [3, 4, 5]) {
      const g = gates.get(d)!;
      expect(g.canStart).toBe(false);
      expect(g.status).toBe("blocked");
      expect(g.reason).toContain("Day 2 hasn't started yet");
    }
  });

  it("stops cascading the moment the root block actually clears", () => {
    const day1Approved = batch({ id: "d1", state: "approved", reviewedAt: new Date("2026-09-11T04:00:00Z") });
    const now = new Date("2026-09-12T10:00:00Z");

    const gates = evaluateDayGateChain({
      now,
      days: [
        { day: 1, startAt: dayStart(1), previousBatches: [] },
        { day: 2, startAt: dayStart(2), previousBatches: [day1Approved] },
        { day: 3, startAt: dayStart(3), previousBatches: [] }, // day 2 approved, but hasn't started its own batch yet
      ],
    });

    expect(gates.get(2)!.canStart).toBe(true);
    // Day 3 reads clear on its own genuine merits (day 2 approved in time),
    // not because the chain never checked — it is the same "nothing to
    // review yet" state day 1 itself is in, correctly.
    expect(gates.get(3)!.canStart).toBe(true);
    expect(gates.get(3)!.status).toBe("clear");
  });

  it("a dispute on day 1 blocks day 2 and cascades the same way a missed deadline does", () => {
    const disputed = batch({ id: "d1", state: "disputed" });
    const gates = evaluateDayGateChain({
      now: new Date("2026-09-12T10:00:00Z"),
      days: [
        { day: 1, startAt: dayStart(1), previousBatches: [] },
        { day: 2, startAt: dayStart(2), previousBatches: [disputed] },
        { day: 3, startAt: dayStart(3), previousBatches: [] },
      ],
    });
    expect(gates.get(2)!.status).toBe("blocked");
    expect(gates.get(3)!.canStart).toBe(false);
    expect(gates.get(3)!.reason).toContain("Day 2 hasn't started yet");
  });

  it("the once-per-project skip on the root day clears it, and the cascade clears with it", () => {
    const unapproved = [batch({ id: "d1", state: "awaiting_review", reviewedAt: null })];
    const gates = evaluateDayGateChain({
      now: new Date("2026-09-12T10:00:00Z"),
      days: [
        { day: 1, startAt: dayStart(1), previousBatches: [] },
        { day: 2, startAt: dayStart(2), previousBatches: unapproved, skipUsedForDay: true },
        { day: 3, startAt: dayStart(3), previousBatches: [] },
      ],
    });
    expect(gates.get(2)!.status).toBe("skipped");
    expect(gates.get(2)!.canStart).toBe(true);
    expect(gates.get(3)!.canStart).toBe(true);
  });
});
