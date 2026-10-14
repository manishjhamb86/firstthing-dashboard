import { describe, expect, it } from "vitest";
import { proposeItemType, proposeSupplier, type ItemOption, type SupplierOption } from "../src/lib/supplier-invoice-match";

describe("proposeSupplier", () => {
  const suppliers: SupplierOption[] = [
    { id: "s1", name: "Sunqor Innovations LLP" },
    { id: "s2", name: "Acme Electronics Pvt Ltd" },
  ];

  it("matches a normalised exact name", () => {
    expect(proposeSupplier("SUNQOR INNOVATIONS LLP", suppliers)?.id).toBe("s1");
    expect(proposeSupplier("sunqor innovations llp", suppliers)?.id).toBe("s1");
  });

  it("returns null for an unrecognised seller", () => {
    expect(proposeSupplier("Some Other Company", suppliers)).toBeNull();
  });

  it("returns null for an empty name", () => {
    expect(proposeSupplier("", suppliers)).toBeNull();
  });
});

describe("proposeItemType", () => {
  const items: ItemOption[] = [
    { id: "i1", name: "20W LED Tube Light", make: "Syska", model: "T8-20" },
    { id: "i2", name: "SONOFF POWR320D Meter", make: "SONOFF", model: "POWR320D" },
    { id: "i3", name: "18W LED Tube Light", make: "Syska", model: "T8-18" },
  ];

  it("matches an exact normalised name", () => {
    expect(proposeItemType("20W LED Tube Light", items)?.itemTypeId).toBe("i1");
  });

  it("matches on word overlap against name/make/model when not exact", () => {
    expect(proposeItemType("SONOFF Smart Meter POWR320D", items)?.itemTypeId).toBe("i2");
  });

  it("does not pick between two equally-scored items — a tie is the operator's call", () => {
    // "LED Tube Light" alone scores identically against both tube lights.
    expect(proposeItemType("LED Tube Light", items)).toBeNull();
  });

  it("returns null when nothing shares a word", () => {
    expect(proposeItemType("Flux capacitor", items)).toBeNull();
  });

  it("returns null for an empty description or no items", () => {
    expect(proposeItemType("", items)).toBeNull();
    expect(proposeItemType("20W LED Tube Light", [])).toBeNull();
  });
});
