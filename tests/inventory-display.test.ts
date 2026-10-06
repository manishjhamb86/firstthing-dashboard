import { describe, expect, it } from "vitest";
import { deviceLabel, fittingLabel, installedCount, meteredOf, type InventoryDevice } from "@/lib/inventory-display";

function device(p: Partial<InventoryDevice>): InventoryDevice {
  return {
    count: 10,
    wattage: 20,
    replacementCount: null,
    replacementWattage: null,
    historical: false,
    excludedFromCalculation: false,
    deviceType: { name: "Tube light" },
    replacementType: null,
    ...p,
  };
}

describe("installedCount", () => {
  it("a line with a recorded replacement counts its replacement count", () => {
    const d = device({ count: 10, replacementCount: 8, replacementType: { name: "Batten" } });
    expect(installedCount({ lightReplacementDate: null }, d)).toBe(8);
  });

  it("a replacement with no stated count falls back to the original count", () => {
    const d = device({ count: 10, replacementCount: null, replacementType: { name: "Batten" } });
    expect(installedCount({ lightReplacementDate: null }, d)).toBe(10);
  });

  it("a historical line on a replaced circuit counts itself", () => {
    const d = device({ count: 96, historical: true, excludedFromCalculation: false });
    expect(installedCount({ lightReplacementDate: new Date("2026-01-01") }, d)).toBe(96);
  });

  it("a historical line on a circuit not yet replaced counts nothing", () => {
    const d = device({ count: 96, historical: true });
    expect(installedCount({ lightReplacementDate: null }, d)).toBe(0);
  });

  it("an excluded historical line counts nothing even if replaced — not FirsThing's fixture", () => {
    const d = device({ count: 5, historical: true, excludedFromCalculation: true });
    expect(installedCount({ lightReplacementDate: new Date("2026-01-01") }, d)).toBe(0);
  });

  it("an ordinary line, not historical and not yet replaced, counts nothing", () => {
    const d = device({ count: 10 });
    expect(installedCount({ lightReplacementDate: null }, d)).toBe(0);
  });
});

describe("meteredOf", () => {
  it("sums installedCount across every device on the circuit", () => {
    const c = {
      lightReplacementDate: new Date("2026-01-01"),
      devices: [
        device({ count: 10, replacementCount: 8, replacementType: { name: "Batten" } }),
        device({ count: 5, historical: true }),
      ],
    };
    expect(meteredOf(c)).toBe(13);
  });
});

describe("fittingLabel", () => {
  it("prefixes the wattage when the name doesn't already carry it", () => {
    expect(fittingLabel(20, "Tube light")).toBe("20W Tube light");
  });

  it("leaves a name that already states the wattage alone", () => {
    expect(fittingLabel(20, "Tube light 20W")).toBe("Tube light 20W");
  });

  it("matches the wattage case-insensitively", () => {
    expect(fittingLabel(20, "Tube light 20w")).toBe("Tube light 20w");
  });
});

describe("deviceLabel", () => {
  it("combines product and name when they differ", () => {
    expect(deviceLabel("POW-R2", "Lift Lobby Meter")).toBe("POW-R2 — Lift Lobby Meter");
  });

  it("uses just the name when the product IS the name", () => {
    expect(deviceLabel("Water Level Indicator", "Water Level Indicator")).toBe("Water Level Indicator");
  });

  it("matches case/whitespace-insensitively", () => {
    expect(deviceLabel(" Water Level Indicator ", "water level indicator")).toBe("water level indicator");
  });
});
