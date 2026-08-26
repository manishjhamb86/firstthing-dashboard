/**
 * Which catalogued device a fixture read from a document actually is.
 *
 * A report says "Tube lights ... 20W each"; the catalog holds "Tube light
 * 20W". Matching only on an exact name creates a second device type for the
 * same fixture (user-reported 2026-08-26), and a duplicate device type is not
 * cosmetic: each carries its own wattage into the theoretical load, so two
 * entries for one fixture are two answers to what a circuit should be drawing.
 *
 * Pure, so the rule is testable without a catalog in a database.
 */
export type CatalogDevice = { id: string; name: string; defaultWattage: number | null };

/** Words that say nothing about which fixture this is. */
const NOISE = new Set(["light", "lights", "lamp", "lamps", "fitting", "fittings", "fixture", "fixtures", "the", "a"]);

export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*w(?:att|atts)?\b/g, " ") // drop "20W" — wattage is compared separately
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words that actually identify a fixture — singularised, noise removed. */
function identity(name: string): Set<string> {
  return new Set(
    tokens(name)
      .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t))
      .filter((t) => !NOISE.has(t) && !NOISE.has(`${t}s`)),
  );
}

export type Suggestion = { device: CatalogDevice; score: number; sameWattage: boolean };

/**
 * Best catalogue match for a fixture, or null when nothing is close.
 *
 * Deliberately conservative: a shared identity word is required, so "Tube
 * lights" never matches "Surface light" however similar the wattage. Wattage
 * agreement raises confidence but cannot create a match on its own — every
 * 20W fitting in the catalog would qualify.
 */
export function suggestDeviceType(
  label: string,
  watts: number | null,
  catalog: CatalogDevice[],
): Suggestion | null {
  const want = identity(label);
  if (want.size === 0) return null;

  let best: Suggestion | null = null;
  for (const device of catalog) {
    const have = identity(device.name);
    const shared = [...want].filter((t) => have.has(t)).length;
    if (shared === 0) continue;

    // Overlap as a fraction of the LARGER set, so "tube" against "tube light
    // basement dimmable" does not score as a perfect match.
    const overlap = shared / Math.max(want.size, have.size);
    const sameWattage =
      watts !== null && device.defaultWattage !== null && Math.abs(device.defaultWattage - watts) < 0.51;
    const score = overlap + (sameWattage ? 0.5 : 0);
    if (!best || score > best.score) best = { device, score, sameWattage };
  }
  // Below this, the words barely overlap and suggesting it would be worse
  // than offering the full list.
  return best && best.score >= 0.5 ? best : null;
}
