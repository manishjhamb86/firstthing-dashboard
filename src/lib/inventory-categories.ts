/**
 * A society's installed devices by category (2026-11-28, user-asked: "show
 * device category wise quantity — meter, router, WiFi extender, 20W batten:
 * demo lights + full installation, surface light: demo + full, and
 * everything else"). One pure builder, read by the back office's inventory
 * page and the society's portal, so the two can never disagree.
 *
 * Lights come from the installation record (demo + full installation, the
 * figure the bill uses); routers, SIM cards, valves and wire from stock
 * installed at the society; connected meters and tank sensors from their
 * devices unless stock records that kind of item there.
 */

export type InventoryRow = {
  key: string;
  name: string;
  /** Lights only: the demo lights and the full installation. */
  demo?: number;
  full?: number;
  /** Null: nothing recorded for this item at the society yet. */
  installed: number | null;
  unit: string;
};

export type InventoryGroup = { title: string; rows: InventoryRow[] };

export type InventoryTile = { key: string; label: string; value: number; unit: string; detail?: string };

const GROUP_OF: Record<string, string> = { light: "Lighting", meter: "Metering", network: "Connectivity", water: "Water", cable: "Wiring" };
const GROUP_ORDER = ["Lighting", "Metering", "Connectivity", "Water", "Wiring", "Equipment"];

export function inventoryByCategory(input: {
  fittings: Array<{ fitting: string; count: number; demo: number; full: number }>;
  /** Non-light stock items with what is installed at the society. */
  stock: Array<{ id: string; name: string; unit: string; category: string; installed: number }>;
  meters: number;
  sensors: number;
  /** Back office: list stock items with nothing recorded, so they can be set. */
  includeUnrecorded: boolean;
}): { groups: InventoryGroup[]; tiles: InventoryTile[] } {
  const rows: Array<InventoryRow & { group: string }> = [];
  for (const f of input.fittings) {
    rows.push({ key: `light:${f.fitting}`, name: f.fitting, demo: f.demo, full: f.full, installed: f.count, unit: "pcs", group: "Lighting" });
  }
  for (const s of input.stock) {
    if (s.installed <= 0 && !input.includeUnrecorded) continue;
    rows.push({
      key: `stock:${s.id}`,
      name: s.name,
      installed: s.installed > 0 ? s.installed : null,
      unit: s.unit,
      group: GROUP_OF[s.category] ?? "Equipment",
    });
  }
  const stocked = (test: (s: (typeof input.stock)[number]) => boolean) => input.stock.some((s) => s.installed > 0 && test(s));
  if (input.meters > 0 && !stocked((s) => s.category === "meter")) {
    rows.push({ key: "device:meter", name: "Smart energy meter", installed: input.meters, unit: "pcs", group: "Metering" });
  }
  if (input.sensors > 0 && !stocked((s) => /tank/i.test(s.name))) {
    rows.push({ key: "device:tank", name: "Tank level sensor", installed: input.sensors, unit: "pcs", group: "Water" });
  }

  const groups = GROUP_ORDER.map((title) => ({
    title,
    rows: rows
      .filter((r) => r.group === title)
      .sort((a, b) => (b.installed ?? -1) - (a.installed ?? -1) || a.name.localeCompare(b.name))
      .map((r): InventoryRow => ({ key: r.key, name: r.name, demo: r.demo, full: r.full, installed: r.installed, unit: r.unit })),
  })).filter((g) => g.rows.length > 0);

  const lights = input.fittings.reduce((n, f) => n + f.count, 0);
  const demo = input.fittings.reduce((n, f) => n + f.demo, 0);
  const full = input.fittings.reduce((n, f) => n + f.full, 0);
  const tiles: InventoryTile[] = [];
  if (lights > 0) {
    tiles.push({
      key: "lights",
      label: "LED lights",
      value: lights,
      unit: "pcs",
      detail: full > 0 ? `${full.toLocaleString("en-IN")} full installation + ${demo.toLocaleString("en-IN")} demo` : `${demo.toLocaleString("en-IN")} from the demo`,
    });
  }
  for (const r of rows) {
    if (r.group === "Lighting" || r.installed === null) continue;
    tiles.push({ key: r.key, label: r.name, value: r.installed, unit: r.unit });
  }
  return { groups, tiles };
}
