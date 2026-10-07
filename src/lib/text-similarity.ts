/**
 * Catching a near-duplicate society name that an exact-match check cannot
 * see (2026-10-08, user-asked, after "OXY HOMEZ" and "Oxy Homes" — one
 * misspelling apart, with completely different location text too — reached
 * real data as two rows).
 *
 * societyDedupeKey's exact-match refusal stays as it is, deliberately:
 * refuse-not-flag is the right call for a genuine duplicate, since an
 * override is exactly how the prior "Mahagun Puram / Noida" duplicate
 * happened. But "Homez" vs "Homes" isn't a formatting difference an exact
 * key can fold away — it's a real misspelling, and a hard refusal on a
 * ~90%-similar name would also wrongly block two genuinely different
 * societies that happen to share most of their name (two "Green Valley"
 * apartments in different areas is a real, ordinary case). So this is a
 * SOFT check: name only, society-wide (not scoped by location — the two
 * real duplicates here had unrelated location text), surfaced as a named
 * match the operator must explicitly confirm isn't the one they mean.
 */

/** Standard case for a typed name: "OXY HOMEZ" and "oxy homez" both become
 * "Oxy Homez" — the display convention this app already uses elsewhere.
 * Deliberately simple, no acronym special-casing: a name like "ASF
 * Insignia" would re-title as "Asf Insignia" if resaved, the same
 * trade-off already accepted for this rule. */
export function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/** 1 for identical (after case/whitespace folding), down to 0 for nothing alike. */
export function nameSimilarity(a: string, b: string): number {
  const na = a.trim().toLowerCase().replace(/\s+/g, " ");
  const nb = b.trim().toLowerCase().replace(/\s+/g, " ");
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(na, nb) / maxLen;
}

/**
 * The user's own figure was "even if name is matching 90%" — but the real
 * pair that prompted this ("OXY HOMEZ" vs "Oxy Homes") measures 88.9% on a
 * whole-string edit-distance ratio (one letter different in nine), just
 * under 90%. Set to 85% so the actual motivating case — and anything at
 * least that close — is caught, rather than implementing the literal
 * number and missing the example it was asked for.
 */
export const SOCIETY_NAME_SIMILARITY_WARN_THRESHOLD = 0.85;

/**
 * The closest existing society by name, when it's close enough to warrant
 * asking — the single best match only, so the operator is shown one named
 * society to rule out, not a list to puzzle over.
 */
export function findSimilarSociety<T extends { id: string; name: string }>(
  name: string,
  existing: readonly T[],
): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const s of existing) {
    const score = nameSimilarity(name, s.name);
    // The user's own words are "matching 90%" — inclusive, so >= here, not
    // >. (An exact match, score 1, can still arrive here too: it means the
    // location text differed enough that societyDedupeKey's own hard
    // refusal didn't fire, same as the real OXY HOMEZ / Oxy Homes case.)
    if (score >= SOCIETY_NAME_SIMILARITY_WARN_THRESHOLD && score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}
