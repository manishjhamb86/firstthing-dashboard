import { describe, expect, it } from "vitest";
import { balanceAt, batchCode, nextBatchSeq, nextState, refuseQuantityMove, unitCode, warrantyState, warrantyUntil } from "@/lib/inventory";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("codes", () => {
  it("batch code is B{YYMM}-{nnn} and the next sequence follows the month's highest", () => {
    expect(batchCode(d("2026-09-25"), 17)).toBe("B2609-017");
    expect(nextBatchSeq(["B2609-001", "B2609-017"])).toBe(18);
    expect(nextBatchSeq([])).toBe(1);
  });
  it("unit code is the batch code plus a 5-digit number", () => {
    expect(unitCode("B2609-017", 42)).toBe("B2609-017-00042");
  });
});

describe("nextState — the unit lifecycle", () => {
  it("stock can be deployed; a deployed unit comes back to office as stock", () => {
    expect(nextState("in_stock", "deploy")).toEqual({ status: "deployed", to: "site" });
    expect(nextState("deployed", "return_to_office")).toEqual({ status: "in_stock", to: "office" });
  });
  it("a faulty unit stays faulty when brought back, and only repair returns it to stock", () => {
    expect(nextState("deployed", "mark_faulty")).toEqual({ status: "faulty", to: "keep" });
    expect(nextState("faulty", "return_to_office")).toEqual({ status: "faulty", to: "office" });
    expect(nextState("faulty", "repair")).toEqual({ status: "in_stock", to: "keep" });
    expect(nextState("faulty", "deploy")).toHaveProperty("error");
  });
  it("a deployed unit must come back before it can be scrapped or returned to the supplier", () => {
    expect(nextState("deployed", "scrap")).toHaveProperty("error");
    expect(nextState("faulty", "return_to_supplier")).toEqual({ status: "returned_to_supplier", to: "none" });
  });
  it("scrapped, lost and returned units are final", () => {
    for (const s of ["scrapped", "lost", "returned_to_supplier"] as const) expect(nextState(s, "deploy")).toHaveProperty("error");
  });
});

describe("warranty", () => {
  it("runs from purchase, or from installation once installed", () => {
    expect(warrantyUntil({ warrantyMonths: 24, basis: "purchase", purchaseDate: d("2026-01-31"), deployedOn: null })).toEqual(d("2028-01-31"));
    expect(warrantyUntil({ warrantyMonths: 12, basis: "install", purchaseDate: d("2026-01-01"), deployedOn: null })).toBeNull();
    expect(warrantyUntil({ warrantyMonths: 12, basis: "install", purchaseDate: d("2026-01-01"), deployedOn: d("2026-03-10") })).toEqual(d("2027-03-10"));
  });
  it("states expired, expiring within 60 days, valid, or not started", () => {
    const now = d("2026-09-25");
    expect(warrantyState(d("2026-09-01"), true, now)).toBe("expired");
    expect(warrantyState(d("2026-11-01"), true, now)).toBe("expiring");
    expect(warrantyState(d("2027-09-01"), true, now)).toBe("valid");
    expect(warrantyState(null, true, now)).toBe("not_started");
    expect(warrantyState(null, false, now)).toBe("none");
  });
});

describe("quantities", () => {
  it("balance is what came in less what left", () => {
    const m = [
      { quantity: 300, fromLocationId: null, toLocationId: "office" },
      { quantity: 120.5, fromLocationId: "office", toLocationId: "site" },
    ];
    expect(balanceAt(m, "office")).toBe(179.5);
    expect(balanceAt(m, "site")).toBe(120.5);
  });
  it("refuses moving more than is there", () => {
    expect(refuseQuantityMove(100, 150, "m")).toMatch(/Only 100 m/);
    expect(refuseQuantityMove(100, 100, "m")).toBeNull();
  });
});
