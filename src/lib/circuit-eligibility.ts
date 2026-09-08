/**
 * CON-16's demo-circuit criteria, in one place.
 *
 * Three HARD criteria with no exception path (FEAT-007-AC-5) and one
 * exception-able minimum (≥50 metered lights, FEAT-007-AC-3). The names were
 * only ever written in the capture form, so the survey page could show a
 * circuit as "Ineligible" without naming which criterion it failed — and a
 * verdict nobody can read is a dead end, since the two routes out (correct a
 * mis-recorded answer, or pick a different circuit) both depend on knowing
 * WHICH answer decided it (user-reported 2026-09-08 on KW Srishti:
 * "Exception approval option is not visible. stuck on 3rd step").
 *
 * CON-16's "no non-installation appliances share this circuit" was removed
 * 2026-08-26 (the user's call). A circuit recorded before that still carries
 * the retired flag in its stored checklist; it is not consulted and not
 * rewritten — the checklist is the record of what the surveyor was asked.
 */
export const CON16_HARD_CRITERIA = [
  { name: "wifiReachable", label: "WiFi/LAN reachable within 20–40m" },
  { name: "fixturesUnder15ft", label: "Fixtures ≤15 feet high" },
  { name: "notOnDrivewayOrRamp", label: "Not on a driveway/ramp" },
] as const;

/** CON-16's metered-light minimum — the one criterion an exception can clear. */
export const MIN_METERED_LIGHTS = 50;

export type EligibilityVerdict = {
  /** Hard criteria the surveyor answered no to, in the order they were asked. */
  failedHard: { name: string; label: string }[];
  /** Below CON-16's minimum — exception-able, unlike the above. */
  lightCountShort: boolean;
  /**
   * True when the light count is the ONLY thing in the way. This is exactly
   * when `approveLightCountException` will accept, so the screen and the
   * action cannot disagree about whether an approval is on offer.
   */
  exceptionable: boolean;
};

export function eligibilityVerdict(c: {
  eligibilityChecklist: unknown;
  meteredLightCount: number;
}): EligibilityVerdict {
  const checklist = (c.eligibilityChecklist ?? {}) as Record<string, unknown>;
  // A missing answer reads as failed, not as passed: a checklist that never
  // recorded the criterion is not evidence the site met it.
  const failedHard = CON16_HARD_CRITERIA.filter((k) => checklist[k.name] !== true).map((k) => ({
    name: k.name,
    label: k.label,
  }));
  const lightCountShort = c.meteredLightCount < MIN_METERED_LIGHTS;
  return {
    failedHard,
    lightCountShort,
    exceptionable: failedHard.length === 0 && lightCountShort,
  };
}
