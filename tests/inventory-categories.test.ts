import { describe, expect, it } from "vitest";
import { inventoryByCategory } from "@/lib/inventory-categories";

const base = {
  fittings: [
    { fitting: "Batten 20W", count: 2000, demo: 39, full: 1961 },
    { fitting: "Surface light 12W", count: 120, demo: 0, full: 120 },
  ],
  stock: [
    { id: "r", name: "WiFi router", unit: "pcs", category: "network", installed: 1 },
    { id: "e", name: "WiFi extender", unit: "pcs", category: "network", installed: 0 },
    { id: "w", name: "LAN wire", unit: "m", category: "cable", installed: 36 },
  ],
  meters: 1,
  sensors: 0,
};

describe("inventory by category", () => {
  it("lists each light type with demo and full installation", () => {
    const { groups } = inventoryByCategory({ ...base, includeUnrecorded: false });
    expect(groups[0]).toEqual({
      title: "Lighting",
      rows: [
        { key: "light:Batten 20W", name: "Batten 20W", demo: 39, full: 1961, installed: 2000, unit: "pcs" },
        { key: "light:Surface light 12W", name: "Surface light 12W", demo: 0, full: 120, installed: 120, unit: "pcs" },
      ],
    });
  });

  it("groups devices by category and counts a meter from its device", () => {
    const { groups } = inventoryByCategory({ ...base, includeUnrecorded: false });
    expect(groups.map((g) => g.title)).toEqual(["Lighting", "Metering", "Connectivity", "Wiring"]);
    expect(groups[1]!.rows[0]).toMatchObject({ name: "Smart energy meter", installed: 1 });
  });

  it("shows an unrecorded item as not recorded only for the back office", () => {
    const portal = inventoryByCategory({ ...base, includeUnrecorded: false });
    expect(portal.groups.flatMap((g) => g.rows).some((r) => r.name === "WiFi extender")).toBe(false);
    const office = inventoryByCategory({ ...base, includeUnrecorded: true });
    expect(office.groups.flatMap((g) => g.rows).find((r) => r.name === "WiFi extender")?.installed).toBeNull();
  });

  it("summary: lights with their split, then every recorded device", () => {
    const { tiles } = inventoryByCategory({ ...base, includeUnrecorded: true });
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ["LED lights", 2120],
      ["WiFi router", 1],
      ["LAN wire", 36],
      ["Smart energy meter", 1],
    ]);
    expect(tiles[0]!.detail).toBe("2,081 full installation + 39 demo");
  });
});
