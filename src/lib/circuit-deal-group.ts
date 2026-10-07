/**
 * Several circuits for one deal/location (2026-10-08, user-specified).
 *
 * A demo result sometimes isn't trusted, so the society asks for a second
 * one — and in practice that second attempt has been recorded as a whole new
 * circuit row rather than a second CircuitDemo on the existing one (the
 * multi-demo-per-circuit design from 2026-08-27 exists, but a fresh survey
 * candidate is the path ops actually reach for). Both circuits are real:
 * each is its own demo, with its own light count and its own meter history.
 * A physical merge of the two rows — repointing 19 different tables'
 * circuit_id, several of them live meter/billing history — is a much larger
 * and riskier change than what the problem actually is, which is a display
 * one: two rows that belong to the SAME deal/area read as two unrelated
 * circuits instead of two attempts at one.
 *
 * So this groups for DISPLAY only — nothing about the underlying circuits,
 * demos, meters or billing changes. A circuit stays exactly the row it
 * always was; this only decides which rows to show together and what their
 * combined total reads.
 */

export type DealGroupMember = {
  id: string;
  location: string | null;
  lightType: string;
  /** This circuit's own first live demo's light count ("demo 1 = x"). */
  demoLights: number;
  /** This circuit's own full-installation figure, not counting its demo. */
  fullInstallation: number;
  /** Whether a real meter is currently attached and reporting through this circuit. */
  isLive: boolean;
  state: string;
};

export type DealGroup = {
  /** The shared location name the group is shown under. */
  label: string;
  members: DealGroupMember[];
  /** x + y + ... — every member circuit's own demo count, summed. */
  combinedDemoLights: number;
  /**
   * The member circuits' own full-installation figures, when they don't all
   * agree — each was entered independently per circuit, and for a grouped
   * deal only ONE full installation should exist. Shown rather than
   * silently averaged or summed, so a real disagreement in the data gets
   * noticed and corrected deliberately, not papered over.
   */
  fullInstallationDisagreement: number[] | null;
  /** The combined total (demo1 + demo2 + ... + full installation), only when every member agrees on the full-installation figure. */
  combinedTotal: number | null;
};

/**
 * A circuit with no survey (shouldn't happen for a live circuit, but the
 * type has to allow for it) and a circuit with no location both stay solo —
 * grouping on an empty or missing key would merge circuits that happen to
 * share nothing in particular, which is a worse failure than showing two
 * circuits as two rows when they really were meant to be read as one.
 */
function groupKey(c: { siteSurveyId: string | null; location: string | null }): string | null {
  const loc = c.location?.trim().toLowerCase();
  if (!c.siteSurveyId || !loc) return null;
  return `${c.siteSurveyId}|${loc}`;
}

export function groupCircuitsByDeal<
  T extends { id: string; siteSurveyId: string | null; location: string | null; lightType: string; demoLights: number; fullInstallation: number; isLive: boolean; state: string },
>(circuits: readonly T[]): { groups: DealGroup[]; solo: T[] } {
  const buckets = new Map<string, T[]>();
  const solo: T[] = [];
  for (const c of circuits) {
    const key = groupKey(c);
    if (key === null) {
      solo.push(c);
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  const groups: DealGroup[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) {
      solo.push(...members);
      continue;
    }
    const combinedDemoLights = members.reduce((sum, m) => sum + m.demoLights, 0);
    const fullInstallations = [...new Set(members.map((m) => m.fullInstallation))];
    const fullInstallationDisagreement = fullInstallations.length > 1 ? fullInstallations : null;
    const combinedTotal = fullInstallationDisagreement ? null : combinedDemoLights + fullInstallations[0];
    groups.push({
      label: members[0].location ?? members[0].lightType,
      members: members.map((m) => ({
        id: m.id,
        location: m.location,
        lightType: m.lightType,
        demoLights: m.demoLights,
        fullInstallation: m.fullInstallation,
        isLive: m.isLive,
        state: m.state,
      })),
      combinedDemoLights,
      fullInstallationDisagreement,
      combinedTotal,
    });
  }

  return { groups, solo };
}
