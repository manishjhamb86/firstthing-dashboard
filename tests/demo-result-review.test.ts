import { describe, expect, it } from "vitest";
import {
  REVIEW_SLA_HOURS,
  RESOLUTION_LABEL,
  refuseResolve,
  restartsWindow,
  reviewUrgency,
  type DemoResolution,
} from "@/lib/demo-result-review";

const now = new Date("2026-08-14T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("FEAT-015-AC-1 — which resolutions put the circuit back into measurement", () => {
  it("re-runs the window when nothing was found wrong", () => {
    expect(restartsWindow("rerun_window")).toBe(true);
  });

  it("re-runs the window after a corrected installation defect", () => {
    // The corrected install is what has to be measured, not the faulty one.
    expect(restartsWindow("installation_defect")).toBe(true);
  });

  it("does NOT restart on an escalation", () => {
    // An escalation says measurement will not settle this. Restarting the
    // window anyway would bury the fact that a person still owes a decision.
    expect(restartsWindow("escalate_manual_benchmark")).toBe(false);
  });

  it("every resolution is either a restart or an escalation, never neither", () => {
    const all = Object.keys(RESOLUTION_LABEL) as DemoResolution[];
    expect(all).toHaveLength(3);
    for (const r of all) {
      expect(typeof restartsWindow(r)).toBe("boolean");
    }
  });
});

describe("FEAT-015-AC-3 — an open review stays visibly flagged", () => {
  it("reads as awaiting review inside the SLA", () => {
    const u = reviewUrgency({ raisedAt: hoursAgo(3), occurrence: 1, now });
    expect(u.overdue).toBe(false);
    expect(u.label).toBe("Awaiting review");
    expect(u.tone).toBe("warn");
  });

  it("flags overdue once the SLA has elapsed", () => {
    const u = reviewUrgency({ raisedAt: hoursAgo(REVIEW_SLA_HOURS + 1), occurrence: 1, now });
    expect(u.overdue).toBe(true);
    expect(u.tone).toBe("bad");
    expect(u.label).toMatch(/^Overdue/);
  });

  it("treats the SLA boundary itself as overdue", () => {
    // "The next morning after" — at exactly 24h it has had its day.
    expect(reviewUrgency({ raisedAt: hoursAgo(REVIEW_SLA_HOURS), occurrence: 1, now }).overdue).toBe(
      true,
    );
    expect(
      reviewUrgency({ raisedAt: hoursAgo(REVIEW_SLA_HOURS - 0.01), occurrence: 1, now }).overdue,
    ).toBe(false);
  });

  it("counts whole days open, not partial ones", () => {
    expect(reviewUrgency({ raisedAt: hoursAgo(50), occurrence: 1, now }).label).toBe(
      "Overdue — open 2d",
    );
  });
});

describe("FEAT-015-AC-5 — a repeat failure is not a first one repeated", () => {
  it("names the attempt number", () => {
    const u = reviewUrgency({ raisedAt: hoursAgo(1), occurrence: 2, now });
    expect(u.repeat).toBe(true);
    expect(u.label).toBe("Repeat failure — attempt 2");
    expect(u.tone).toBe("bad");
  });

  it("outranks an overdue first attempt", () => {
    // Both are 'bad'-toned, so the tone alone cannot carry the distinction —
    // the label has to say which one it is. A circuit that has failed twice
    // needs a different action than one nobody has looked at yet.
    const repeatAndOverdue = reviewUrgency({ raisedAt: hoursAgo(72), occurrence: 3, now });
    expect(repeatAndOverdue.label).toBe("Repeat failure — attempt 3");
    expect(repeatAndOverdue.overdue).toBe(true);
  });

  it("a first attempt is never a repeat, however long it sits", () => {
    const u = reviewUrgency({ raisedAt: hoursAgo(500), occurrence: 1, now });
    expect(u.repeat).toBe(false);
  });
});

describe("refuseResolve", () => {
  const ok = { alreadyResolved: false, resolution: "rerun_window", note: "two fixtures unswapped" };

  it("accepts a complete resolution", () => {
    expect(refuseResolve(ok)).toBeNull();
  });

  it("refuses a second resolution of the same review", () => {
    expect(refuseResolve({ ...ok, alreadyResolved: true })).toMatch(/already been resolved/);
  });

  it("refuses an unrecognised resolution", () => {
    // The value arrives from a form field, so it is a string until checked.
    expect(refuseResolve({ ...ok, resolution: "" })).toMatch(/Choose how/);
    expect(refuseResolve({ ...ok, resolution: "write_the_benchmark_anyway" })).toMatch(/Choose how/);
  });

  it("refuses a resolution with no stated basis", () => {
    // INV-03's reasoning: this decision changes whether a circuit can ever be
    // billed, so it needs an owner and a reason, not just a picked option.
    expect(refuseResolve({ ...ok, note: "" })).toMatch(/what was found/i);
    expect(refuseResolve({ ...ok, note: "   " })).toMatch(/what was found/i);
  });

  it("refuses the already-resolved case before the field checks", () => {
    // Order matters for the message: telling someone to fill in a note on a
    // review that is already closed sends them down a dead end.
    expect(refuseResolve({ alreadyResolved: true, resolution: "", note: "" })).toMatch(
      /already been resolved/,
    );
  });
});
