/**
 * The key that makes a duplicate society impossible rather than merely
 * flagged (the user's call, 2026-08-26).
 *
 * Until now a same-name/same-location society was caught by a query and the
 * operator could confirm past it — and that override is exactly how two
 * "Mahagun Puram / Noida" rows reached real data. An application check also
 * cannot win a race with itself: two operators submitting the same society
 * at the same moment both find nothing and both insert. So the guarantee
 * lives in a unique index on this key, and the query survives only to give
 * a better message than a constraint violation would.
 *
 * Deliberately name AND location: two societies of the same name in
 * different cities are genuinely different societies, and refusing the
 * second would be worse than the duplicate.
 */
export function normaliseSocietyPart(value: string): string {
  return value
    .toLowerCase()
    // Everything that is not a letter or digit becomes a space, so
    // "Mahagun Puram.", "mahagun-puram" and "Mahagun  Puram" are one key.
    // Deliberately conservative: it folds punctuation and case, and does
    // NOT try to equate "Brigade Cornerstone" with "Brigade Cornerstone
    // Apartments" — silently merging two differently-named societies would
    // be a worse failure than keeping them apart.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function societyDedupeKey(name: string, location: string): string {
  return `${normaliseSocietyPart(name)}|${normaliseSocietyPart(location)}`;
}
