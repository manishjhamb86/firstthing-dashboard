/**
 * A circuit reads as "location · light type", except when those are the same
 * word — several backfilled circuits are located in the Basement and carry
 * the light type "basement", and "Basement · basement" reads as a rendering
 * fault rather than as data.
 *
 * Split out of meter-view.ts (2026-09-12): that module imports `db`, so a
 * Client Component importing `circuitLabelOf` from it (the inspection form's
 * society/circuit picker) pulled the whole Prisma/pg client into the browser
 * bundle and failed the build outright. This file has no imports at all, so
 * it is safe from either side of the Server/Client boundary — meter-view.ts
 * re-exports it so every existing call site keeps working unchanged.
 */
export function circuitLabelOf(location: string | null, lightType: string): string {
  const place = location?.trim() ?? "";
  // No location recorded → the light type alone. "Unnamed · Lift Lobby" read
  // as though something was missing from the record rather than never asked
  // for (user-caught 2026-09-15 — the candidate form had no location field).
  if (place === "") return lightType.trim();
  if (place.toLowerCase() === lightType.trim().toLowerCase()) return place;
  // "Tower G · Lift Lobby Tower G" read as a stutter: when one already
  // contains the other, the longer says it all.
  if (lightType.trim().toLowerCase().includes(place.toLowerCase())) return lightType.trim();
  if (place.toLowerCase().includes(lightType.trim().toLowerCase())) return place;
  return `${place} · ${lightType}`;
}

/**
 * The circuit's name as every screen shows it (2026-11-23, user-asked: one
 * name everywhere) — the stored `name`, which for a single-circuit deal is
 * the deal's own name.
 */
export function circuitName(c: { name: string }): string {
  return c.name.trim();
}
