import { describe, it, expect } from "vitest";
import { inventoryCountFor, lightTypeKey, refuseRepresentedCount } from "@/lib/light-type";

describe("CON-11's extrapolation base", () => {
  const inventory = [
    { label: "TubeLight", lights: 2000 },
    { label: "Street light", lights: 120 },
  ];

  it("finds the society-wide count across the two spellings the fields hold", () => {
    // Indiabulls' own rows: the inventory says "TubeLight", the circuit says
    // "Tubelight". An exact match finds nothing and the extrapolation base is
    // then whatever somebody typed.
    expect(inventoryCountFor("Tubelight", inventory)).toBe(2000);
    expect(inventoryCountFor("tube light", inventory)).toBe(2000);
    expect(lightTypeKey("Tube Light")).toBe(lightTypeKey("TubeLight"));
  });

  it("reports nothing rather than guessing when the inventory has no such type", () => {
    expect(inventoryCountFor("Lift lobby", inventory)).toBeNull();
    expect(inventoryCountFor("", inventory)).toBeNull();
  });

  it("refuses a represented count equal to the metered one", () => {
    // The user's rule: "represented lights is always more then circuit light".
    // Equal is an extrapolation factor of 1, which prices the offer as though
    // the demo circuit were the whole society — Indiabulls was offered at
    // ₹1,297.30 on 50 of 50 when the survey had counted 2,000.
    const r = refuseRepresentedCount(50, 50);
    expect(r).toMatch(/always more/i);
    expect(r).toMatch(/CON-11/);
  });

  it("still refuses a factor below 1", () => {
    expect(refuseRepresentedCount(40, 50)).toMatch(/cannot be below/i);
  });

  it("accepts a real extrapolation", () => {
    expect(refuseRepresentedCount(2000, 50)).toBeNull();
    expect(refuseRepresentedCount(51, 50)).toBeNull();
  });

  it("refuses a non-count", () => {
    expect(refuseRepresentedCount(0, 50)).toMatch(/whole number/i);
    expect(refuseRepresentedCount(50.5, 50)).toMatch(/whole number/i);
    expect(refuseRepresentedCount(Number.NaN, 50)).toMatch(/whole number/i);
  });
});
