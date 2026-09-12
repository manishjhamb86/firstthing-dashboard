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
  const place = location?.trim() || "Unnamed";
  if (place.toLowerCase() === lightType.trim().toLowerCase()) return place;
  return `${place} · ${lightType}`;
}
