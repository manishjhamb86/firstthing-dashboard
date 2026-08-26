/**
 * Is this report describing a circuit the society already has?
 *
 * Two reports of one physical circuit is the ordinary case, not an exotic
 * one: a pre-installation report and a post-installation report describe the
 * same lights, the same meter and the same month. Building a circuit from
 * each gives the society two, and CON-11 makes a circuit the billing grain —
 * so the same lights would be billed twice, and the demo report would never
 * generate, because it waits for every circuit to reach a benchmark and the
 * second one never will. That is exactly how Ace City ended up stuck
 * (user-reported 2026-08-26: "system should avoid creating duplicates. it can
 * see the light count is same. dates are same").
 *
 * Deliberately a refusal rather than a warning, matching the call already
 * made for duplicate societies: an override is how the duplicate rows that
 * prompted that decision got created in the first place.
 */

export type ExistingCircuit = {
  id: string;
  lightType: string;
  meteredLightCount: number;
  location: string | null;
  /** The period of the document it was built from, when it came from one. */
  sourcePeriod?: string | null;
};

export type DuplicateVerdict = { duplicate: ExistingCircuit; reason: string } | null;

/**
 * Same light type and the same number of metered lights is the match. Both
 * are read off the document rather than typed, so two reports of one circuit
 * agree on them by construction — and two genuinely different circuits that
 * happen to share both are rare enough to be worth a conversation.
 */
export function findDuplicateCircuit(
  proposed: { lightType: string; meteredLightCount: number; period?: string | null },
  existing: ExistingCircuit[],
): DuplicateVerdict {
  const match = existing.find(
    (c) =>
      c.lightType.trim().toLowerCase() === proposed.lightType.trim().toLowerCase() &&
      c.meteredLightCount === proposed.meteredLightCount,
  );
  if (!match) return null;

  const where = match.location?.trim() ? ` at ${match.location.trim()}` : "";
  const samePeriod =
    proposed.period && match.sourcePeriod && proposed.period === match.sourcePeriod
      ? `, from a document filed under the same month (${proposed.period})`
      : "";
  return {
    duplicate: match,
    reason:
      `This society already has a ${match.lightType} circuit of ${match.meteredLightCount} lights${where}${samePeriod}. ` +
      `A pre- and a post-installation report describe the same circuit, so building a second one would bill the same lights twice ` +
      `and hold the demo report open forever. Open the existing circuit and file this document's readings against it instead.`,
  };
}
