import { describe, expect, it } from "vitest";
import {
  demoReplacementLateness,
  demoWindowLateness,
  invoiceLateness,
  meterAlertLateness,
  ticketLateness,
} from "@/lib/lateness";

const now = new Date("2026-10-22T12:00:00.000Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("invoiceLateness", () => {
  it("is not late before its due date", () => {
    expect(invoiceLateness({ dueDate: new Date(now.getTime() + 1000), settled: false, now })).toBeNull();
  });

  it("is not late once settled, whatever the due date", () => {
    expect(invoiceLateness({ dueDate: daysAgo(90), settled: true, now })).toBeNull();
  });

  it("reads amber from the first day past due", () => {
    expect(invoiceLateness({ dueDate: daysAgo(1), settled: false, now })).toEqual({
      tone: "amber",
      clock: "Overdue by 1 day",
    });
  });

  it("reads red at 15 days past due", () => {
    const r = invoiceLateness({ dueDate: daysAgo(15), settled: false, now });
    expect(r?.tone).toBe("red");
  });

  it("names the 45-day marker without claiming a legal breach", () => {
    const r = invoiceLateness({ dueDate: daysAgo(46), settled: false, now });
    expect(r?.clock).toBe("Overdue by 46 days — past 45 days");
    expect(r?.clock).not.toMatch(/MSMED/);
  });
});

describe("ticketLateness", () => {
  it("is not late when resolved, whatever its age", () => {
    expect(ticketLateness({ status: "resolved", createdAt: daysAgo(30), now })).toBeNull();
  });

  it("is not late inside the first day while still open", () => {
    expect(ticketLateness({ status: "open", createdAt: hoursAgo(6), now })).toBeNull();
  });

  it("reads amber once a day old and not taken up", () => {
    const r = ticketLateness({ status: "open", createdAt: daysAgo(2), now });
    expect(r).toEqual({ tone: "amber", clock: "Not taken up — 2 days old" });
  });

  it("reads red once 5 days old and still open", () => {
    const r = ticketLateness({ status: "open", createdAt: daysAgo(6), now });
    expect(r?.tone).toBe("red");
  });

  it("reads red once in_progress for 5 days with no resolution", () => {
    const r = ticketLateness({ status: "in_progress", createdAt: daysAgo(6), now });
    expect(r).toEqual({ tone: "red", clock: "Open 6 days, not resolved" });
  });

  it("an in_progress ticket under 5 days old is not late", () => {
    expect(ticketLateness({ status: "in_progress", createdAt: daysAgo(2), now })).toBeNull();
  });
});

describe("meterAlertLateness", () => {
  it("an offline alert stays amber before 48 hours", () => {
    const r = meterAlertLateness({ kind: "offline", openedAt: hoursAgo(10), acknowledgedAt: hoursAgo(1), now });
    expect(r.tone).toBe("amber");
  });

  it("an offline alert reads red at 48 hours", () => {
    const r = meterAlertLateness({ kind: "offline", openedAt: hoursAgo(49), acknowledgedAt: null, now });
    expect(r.tone).toBe("red");
  });

  it("an out-of-range alert reads red at 24 hours, sooner than offline", () => {
    const r = meterAlertLateness({ kind: "out_of_range", openedAt: hoursAgo(25), acknowledgedAt: null, now });
    expect(r.tone).toBe("red");
  });

  it("names unacknowledged specifically past 4 hours", () => {
    const r = meterAlertLateness({ kind: "out_of_range", openedAt: hoursAgo(5), acknowledgedAt: null, now });
    expect(r).toEqual({ tone: "amber", clock: "Unacknowledged, open 5h" });
  });

  it("an acknowledged alert still ages, just without the unacknowledged word", () => {
    const r = meterAlertLateness({ kind: "out_of_range", openedAt: hoursAgo(5), acknowledgedAt: hoursAgo(1), now });
    expect(r).toEqual({ tone: "amber", clock: "Open 5h" });
  });
});

describe("demoWindowLateness", () => {
  it("a window under 7 days old is not late", () => {
    expect(demoWindowLateness({ openedAt: daysAgo(3), now })).toBeNull();
  });

  it("reads amber at 7 days", () => {
    const r = demoWindowLateness({ openedAt: daysAgo(7), now });
    expect(r?.tone).toBe("amber");
  });

  it("reads red at 10 days", () => {
    const r = demoWindowLateness({ openedAt: daysAgo(10), now });
    expect(r).toEqual({ tone: "red", clock: "Window open 10 days" });
  });
});

describe("demoReplacementLateness", () => {
  it("is not late inside the first 2 days", () => {
    expect(demoReplacementLateness({ assignedAt: daysAgo(1), now })).toBeNull();
  });

  it("reads amber at 2 days", () => {
    const r = demoReplacementLateness({ assignedAt: daysAgo(2), now });
    expect(r?.tone).toBe("amber");
  });

  it("reads red at double the threshold", () => {
    const r = demoReplacementLateness({ assignedAt: daysAgo(4), now });
    expect(r).toEqual({ tone: "red", clock: "Replacement assigned 4 days ago, not done" });
  });
});
