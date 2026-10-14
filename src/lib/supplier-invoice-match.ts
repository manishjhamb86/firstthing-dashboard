/**
 * Matching a read supplier invoice against what is already on record —
 * pure, so the Receive stock form's auto-fill is unit-tested once rather
 * than trusted by eye. Same two-tier shape as invoice-intake.ts's own
 * proposeSociety/proposeCircuit: an exact normalised-name match first, a
 * scored word-overlap fallback, and "pick it yourself" whenever neither is
 * confident — a wrong silent match would receive the wrong stock into the
 * wrong batch.
 */

function normaliseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type SupplierOption = { id: string; name: string };

/** Exact match on a normalised name only — anything looser is the operator's own pick. */
export function proposeSupplier(sellerName: string, suppliers: SupplierOption[]): SupplierOption | null {
  const key = normaliseKey(sellerName);
  if (!key) return null;
  const hits = suppliers.filter((s) => normaliseKey(s.name) === key);
  return hits.length === 1 ? hits[0] : null;
}

export type ItemOption = { id: string; name: string; make: string | null; model: string | null };

function mentionScore(description: string, item: ItemOption): number {
  const words = new Set(description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tokens = [item.name, item.make, item.model]
    .filter((t): t is string => !!t)
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.filter((t) => words.has(t)).length;
}

export type ItemProposal = { itemTypeId: string; why: string };

/**
 * An exact name match first (the invoice line reads the item's own name
 * verbatim); otherwise the item whose name/make/model shares the most words
 * with the line — and only when it clearly beats every runner-up, since a
 * tie between two similar fixtures is exactly the case a person should pick,
 * not a coin flip.
 */
export function proposeItemType(description: string, items: ItemOption[]): ItemProposal | null {
  const key = normaliseKey(description);
  if (!key || items.length === 0) return null;
  const exact = items.filter((i) => normaliseKey(i.name) === key);
  if (exact.length === 1) return { itemTypeId: exact[0].id, why: `Matches "${exact[0].name}" exactly.` };

  const scored = items
    .map((i) => ({ i, score: mentionScore(description, i) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return { itemTypeId: scored[0].i.id, why: `"${description}" names ${scored[0].i.name}.` };
  }
  return null;
}
