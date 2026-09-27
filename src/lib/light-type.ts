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

