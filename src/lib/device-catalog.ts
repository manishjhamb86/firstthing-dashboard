// CON-45 — the shape of a catalog row and the one condition the list warns
// about, in a plain module because BOTH sides need it: the page is a Server
// Component that states the count in its header, and the list is a Client
// Component that filters on it. Exporting the predicate from the "use
// client" module compiled fine and then threw at request time ("Attempted
// to call needsAttention() from the server"), which is the whole reason
// this file exists rather than one shared import from there.

export type CatalogRow = {
  id: string;
  name: string;
  role: "original" | "replacement";
  defaultWattage: number | null;
  active: boolean;
  removed: boolean;
  /** originals only: the replacements an installer may pick for this device */
  replacementIds: string[];
  /** how many recorded lines point at this type — why removal is soft */
  usageCount: number;
};


/**
 * The row-level warning this list carries: an active original with nothing
 * an installer could pick to replace it.
 *
 * Exported because the page header states the count and the toolbar filters
 * on it — one predicate, so a chip reading "1 needs attention" can never
 * filter to a different set of rows than the one it counted.
 */
export function needsAttention(row: CatalogRow) {
  return row.role === "original" && row.active && !row.removed && row.replacementIds.length === 0;
}
