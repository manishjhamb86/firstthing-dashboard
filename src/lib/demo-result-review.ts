// FEAT-015 — out-of-range demo result review.
//
// When a post-install window completes outside CON-20's 60-80% band, the
// result is NOT written as a benchmark (FEAT-014-AC-5). Before this existed
// the circuit simply parked in `benchmark_review` with a screen saying the
// queue wasn't built — a dead end that quietly stranded the deal, since the
// benchmark is what the whole contract prices against.
//
// This is an R1 feature pulled forward, because the state it resolves is
// reachable in R0 today.

/**
 * FEAT-015-AC-3 — the item must stay visibly flagged rather than silently
 * ageing out. The feature's own description sets the expectation ("the next
 * morning after"), so anything still open a day later is overdue.
 */
export const REVIEW_SLA_HOURS = 24;

export type DemoResolution =
  | "rerun_window"
  | "installation_defect"
  | "escalate_manual_benchmark";

export const RESOLUTION_LABEL: Record<DemoResolution, string> = {
  rerun_window: "Re-run the post-install window",
  installation_defect: "Installation defect corrected — restart",
  escalate_manual_benchmark: "Escalate for a manual benchmark decision",
};

export const RESOLUTION_DETAIL: Record<DemoResolution, string> = {
  rerun_window:
    "Nothing was found wrong on site. The window restarts at the next midnight and the circuit measures again.",
  installation_defect:
    "A defect was found and corrected (wiring, fixture count, meter placement). The window restarts at the next midnight so the corrected install is what gets measured.",
  escalate_manual_benchmark:
    "Measurement is not going to settle this. The circuit stays out of commissioning and a person decides the benchmark — it is never written by this screen.",
};

/**
 * Does resolving this way put the circuit back into measurement?
 *
 * Two of the three do. The third deliberately does not: an escalation is an
 * admission that re-measuring will not answer the question, and silently
 * restarting the window would bury that.
 */
export function restartsWindow(resolution: DemoResolution): boolean {
  return resolution === "rerun_window" || resolution === "installation_defect";
}

export type ReviewUrgency = {
  overdue: boolean;
  /** FEAT-015-AC-5 — a second failure on the same circuit is not routine. */
  repeat: boolean;
  hoursOpen: number;
  label: string;
  tone: "warn" | "bad";
};

export function reviewUrgency(input: {
  raisedAt: Date;
  occurrence: number;
  now: Date;
}): ReviewUrgency {
  const hoursOpen = (input.now.getTime() - input.raisedAt.getTime()) / (1000 * 60 * 60);
  const overdue = hoursOpen >= REVIEW_SLA_HOURS;
  const repeat = input.occurrence >= 2;

  // A repeat failure outranks an overdue first one: the second time a circuit
  // measures out of band, re-running the window is unlikely to be the answer,
  // and saying so is more useful than a stopwatch.
  if (repeat) {
    return {
      overdue,
      repeat,
      hoursOpen,
      label: `Repeat failure — attempt ${input.occurrence}`,
      tone: "bad",
    };
  }
  if (overdue) {
    return {
      overdue,
      repeat,
      hoursOpen,
      label: `Overdue — open ${Math.floor(hoursOpen / 24)}d`,
      tone: "bad",
    };
  }
  return { overdue, repeat, hoursOpen, label: "Awaiting review", tone: "warn" };
}

export function refuseResolve(input: {
  alreadyResolved: boolean;
  resolution: string;
  note: string;
}): string | null {
  if (input.alreadyResolved) return "This review has already been resolved.";
  if (!(input.resolution in RESOLUTION_LABEL)) return "Choose how this result is being resolved.";
  // INV-03's reasoning applied here: a decision that changes whether a circuit
  // can ever be billed needs an owner and a stated basis, not just a picked
  // option. Every resolution here is one of those.
  if (!input.note.trim()) return "Record what was found on site.";
  return null;
}
