// Whether a stored day can still be excluded from the averages, and why not.
//
// One source for the rule, because it is needed in two places: the Server
// Action enforces it, and the row has to know BEFORE it renders an
// "Exclude" control that could only refuse. Offering it anyway is what let
// an operator exclude a dozen rows, see nothing change, and find them all
// back on refresh (user-reported 2026-08-20).

export type ExclusionContext = {
  phase: "pre_install" | "post_install" | "monitoring";
  /** the lights have been replaced — the pre-install set is the baseline now */
  replacementRecorded: boolean;
  /** CON-20's benchmark is fixed for the term */
  benchmarkConfirmed: boolean;
  /** consumed by a released calculation (INV-03) */
  billed: boolean;
  /** the actor holds manage_pipeline as well as manage_survey */
  isOps: boolean;
};

/** Null when the day can be excluded or re-included; otherwise the reason. */
export function exclusionRefusal(c: ExclusionContext): string | null {
  if (c.billed) {
    return "Billed on a released calculation — it can't be changed (INV-03).";
  }
  // Changing an input after its output is in force would silently restate a
  // figure someone has already been shown.
  if (c.phase === "pre_install" && c.replacementRecorded) {
    return "Frozen — the lights are replaced, so this set is the baseline the savings are measured against.";
  }
  if (c.phase === "post_install" && c.benchmarkConfirmed) {
    return "Frozen — the benchmark is confirmed and fixed for the term.";
  }
  if (c.phase === "post_install" && !c.benchmarkConfirmed && !c.isOps) {
    return "Excluding a post-install day changes the benchmark — an operations-lead action.";
  }
  return null;
}
