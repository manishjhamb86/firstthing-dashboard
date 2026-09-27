import { describe, it, expect } from "vitest";
import { inventoryCountFor, lightTypeKey } from "@/lib/light-type";

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

});
