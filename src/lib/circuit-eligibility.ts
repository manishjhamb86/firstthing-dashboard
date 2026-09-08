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

/** The criterion key an exception uses for CON-16's metered-light minimum. */
export const LIGHT_COUNT_CRITERION = "lightCount";

/**
 * What waiving a criterion commits FirsThing to, where there is a known
 * remedy. WiFi reach was the one criterion that looked like it could strand a
 * commissioning — a meter that cannot reach the network never reports — and
 * the user settled it directly (2026-09-08): "if no wifi available we can
 * install our own 4d router there. so its an exception". So the waiver is a
 * decision to bring connectivity, and the screen says so, because the crew
 * going out has to know the site needs a router with them.
 *
 * Nothing is claimed for the other two: waiving them is recorded and stated,
 * with no remedy invented on the product's behalf.
 */
export const CRITERION_WAIVER_NOTE: Record<string, string> = {
  wifiReachable: "FirsThing supplies its own 4G router on site — the waiver commits to that.",
};

export function criterionLabel(name: string): string {
  if (name === LIGHT_COUNT_CRITERION) return `At least ${MIN_METERED_LIGHTS} metered lights`;
  return CON16_HARD_CRITERIA.find((k) => k.name === name)?.label ?? name;
}

/**
 * The circuit state a checklist produces — the ONE derivation.
 *
 * Recording a candidate, correcting its answers and approving an exception all
 * decide the same question, and three copies of it would drift the way
 * `circuitNextLabel` drifted from `circuitSteps` twice. `waived` carries the
 * criteria operations has already let through, so a correction cannot silently
 * un-approve a live exception and an exception cannot be undone by a later
 * edit that leaves the same answers in place.
 */
export function eligibilityState(input: {
  eligibilityChecklist: unknown;
  meteredLightCount: number;
  waived?: readonly string[];
}): "eligible" | "surveyed" | "ineligible" {
  const waived = new Set(input.waived ?? []);
  const v = eligibilityVerdict(input);
  const hardOutstanding = v.failedHard.filter((k) => !waived.has(k.name));
  if (hardOutstanding.length > 0) return "ineligible";
  if (!v.lightCountShort || waived.has(LIGHT_COUNT_CRITERION)) return "eligible";
  // Short on lights with every hard criterion met: the one state an exception
  // is offered from, rather than a refusal.
  return "surveyed";
}

/** What an exception would have to waive for this circuit to be eligible. */
export function outstandingCriteria(input: {
  eligibilityChecklist: unknown;
  meteredLightCount: number;
  waived?: readonly string[];
}): string[] {
  const waived = new Set(input.waived ?? []);
  const v = eligibilityVerdict(input);
  const out = v.failedHard.map((k) => k.name).filter((n) => !waived.has(n));
  if (v.lightCountShort && !waived.has(LIGHT_COUNT_CRITERION)) out.push(LIGHT_COUNT_CRITERION);
  return out;
}
