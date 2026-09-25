import { describe, expect, it } from "vitest";
import { planClose, refuseClose, refuseReopen, servedUntil, suspensionApplies } from "@/lib/deal-close";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("planClose", () => {
  it("closes a deal before the demo, after the demo, and terminates one with a contract", () => {
    const plan = planClose([
      { id: "a", label: "A", stage: "lead", contract: null },
      { id: "b", label: "B", stage: "demo_reported", contract: null },
      { id: "c", label: "C", stage: "active_billing", contract: { id: "k", status: "active" } },
      { id: "e", label: "E", stage: "agreed", contract: { id: "k2", status: "draft" } },
      { id: "f", label: "F", stage: "closed_lost", contract: null },
    ]);
    expect(plan.map((p) => p.action)).toEqual(["close", "close", "terminate", "terminate", "already_closed"]);
  });
});

describe("refuseClose", () => {
  const now = d("2026-09-25");
  it("needs a reason", () => expect(refuseClose({ reason: " ", lastServedDay: now, now })).toMatch(/why/));
  it("refuses a future end date", () => expect(refuseClose({ reason: "x", lastServedDay: d("2026-09-26"), now })).toMatch(/future/));
  it("accepts today and a backdated day", () => {
    expect(refuseClose({ reason: "x", lastServedDay: d("2026-09-25"), now })).toBeNull();
    expect(refuseClose({ reason: "x", lastServedDay: d("2025-01-01"), now })).toBeNull();
  });
});

describe("servedUntil", () => {
  it("is the termination when it comes before the term end", () => {
    expect(servedUntil(d("2029-06-30"), d("2026-09-10"))).toEqual(d("2026-09-10"));
  });
  it("is the term end otherwise", () => {
    expect(servedUntil(d("2029-06-30"), null)).toEqual(d("2029-06-30"));
  });
  it("a termination at the very start leaves nothing to bill after it", () => {
    expect(servedUntil(d("2029-06-30"), d("2026-06-30")) < d("2026-07-01")).toBe(true);
  });
});

describe("refuseReopen", () => {
  it("allows reopening when the final month is not released", () => {
    expect(refuseReopen({ terminatedOn: d("2026-09-10"), releasedPeriods: ["2026-07", "2026-08"] })).toBeNull();
  });
  it("refuses once the termination month has been released", () => {
    expect(refuseReopen({ terminatedOn: d("2026-09-10"), releasedPeriods: ["2026-09"] })).toMatch(/2026-09.*released.*cannot be restated/);
  });
});

it("suspension stops for a terminated society, not for others", () => {
  expect(suspensionApplies("terminated")).toBe(false);
  expect(suspensionApplies("active")).toBe(true);
});
