/**
 * Matching a light type across the two places it is typed.
 *
 * A lighting-inventory area's light type and a candidate circuit's light type
 * are two INDEPENDENT free-text fields, and real data already holds
 * "TubeLight" on one and "Tubelight" on the other. An exact comparison reports
 * a type as uncovered while a candidate plainly exists — and, worse, cannot
 * find the society-wide count a circuit is supposed to represent (CON-11),
 * which is the number a fee is computed on.
 *
 * The real fix is one controlled vocabulary across both — CON-11 names five
 * profiles — which is a schema change and belongs in the blueprint rather than
 * in a bug fix. Until then this is the one normalisation, shared rather than
 * re-derived per screen.
 */
export function lightTypeKey(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type InventoryType = {
  /** As the surveyor typed it on the inventory, for display. */
  label: string;
  /** Lights of this type counted across the whole society. */
  lights: number;
};

/**
 * The society-wide count for a candidate's light type, from the inventory the
 * same survey recorded — CON-11's extrapolation base.
 *
 * Null when the inventory holds nothing matching: that is a real state (a
 * candidate recorded before its area was, or a type the walk missed), and
 * guessing a number there would put an invented figure behind a bill.
 */
export function inventoryCountFor(
  lightType: string,
  inventory: readonly InventoryType[],
): number | null {
  if (lightType.trim() === "") return null;
  const key = lightTypeKey(lightType);
  const hit = inventory.find((i) => lightTypeKey(i.label) === key);
  return hit ? hit.lights : null;
}

/**
 * CON-11's extrapolation base must exceed the circuit's own lights.
 *
 * The user's own rule, stated 2026-09-08: "represented lights is always more
 * then circuit light". A metered circuit is a SAMPLE of a light type across
 * the society — that is what makes extrapolating from it meaningful — so an
 * equal count means the demo circuit is the whole population, which is not a
 * demo. Equal was previously accepted, and it is exactly what shipped: a
 * circuit representing 50 of 50 has an extrapolation factor of 1 and prices
 * the offer as though the society had 50 lights.
 *
 * Below the metered count is refused for the older reason: a factor under 1
 * is not physically meaningful.
 */
export function refuseRepresentedCount(
  represented: number,
  metered: number,
): string | null {
  if (!Number.isFinite(represented) || !Number.isInteger(represented) || represented <= 0) {
    return "Represented count must be a whole number of lights.";
  }
  if (represented < metered) {
    return `Represented count cannot be below the ${metered} lights actually on the circuit.`;
  }
  if (represented === metered) {
    return `The represented count is every light of this type across the society, so it is always more than the ${metered} on the metered circuit — the fee is computed by extrapolating from this circuit to that population (CON-11). Equal figures would price the offer as though the demo circuit were the whole society.`;
  }
  return null;
}
