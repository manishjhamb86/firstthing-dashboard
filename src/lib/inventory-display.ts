/**
 * What counts as a FirsThing-installed fitting, and how its label reads —
 * shared between the portal's own inventory page and the admin society
 * page's mirror of it (2026-10-06, user-asked: "In backend under Society
 * there should be a dedicated inventory section same as in customer
 * portal"), so the two can never disagree about what "installed" means —
 * exactly the class of bug this session spent today chasing across two
 * different circuits.
 *
 * A line with a recorded replacement, OR a historical line on a replaced
 * circuit, counts — for a pre-system society the recorded line IS the
 * installed fitting (the backfill records the current fittings, not a
 * before/after pair). An excluded line is the opposite: a shared fixture
 * FirsThing did NOT replace (the CON-16 amendment), on the circuit but not
 * ours.
 */
export type InventoryDevice = {
  count: number;
  wattage: number;
  replacementCount: number | null;
  replacementWattage: number | null;
  historical: boolean;
  excludedFromCalculation: boolean;
  deviceType: { name: string };
  replacementType: { name: string } | null;
};

export function installedCount(c: { lightReplacementDate: Date | null }, d: InventoryDevice): number {
  if (d.replacementType) return d.replacementCount ?? d.count;
  if (d.historical && !d.excludedFromCalculation && c.lightReplacementDate) return d.count;
  return 0;
}

/** Every light actually on the metered circuit, by the rule above. */
export function meteredOf(c: { lightReplacementDate: Date | null; devices: InventoryDevice[] }): number {
  return c.devices.reduce((x, d) => x + installedCount(c, d), 0);
}

/**
 * "20W Tube light 20W" — several catalog names already carry the wattage,
 * and prefixing it again reads as a rendering fault, the same shape as
 * "basement · Basement".
 */
export function fittingLabel(watts: number, name: string): string {
  return name.toLowerCase().includes(`${watts}w`) ? name : `${watts}W ${name}`;
}

/** Same rule for a device whose product name IS its name. */
export function deviceLabel(product: string, name: string): string {
  return product.trim().toLowerCase() === name.trim().toLowerCase() ? name : `${product} — ${name}`;
}
