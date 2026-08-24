// CAP-05 / FEAT-055 / FEAT-050 — what a deviation review decides, and what
// that decision does to money.
//
// The decision itself changes nothing this month. CON-01c is explicit: month
// 1 out of band raises the review and starts the correction window, and
// "month 1 itself never adjusts". What a decision does is set the condition
// the NEXT month's run reads — `runCalculation` looks for a prior review
// whose root cause is FirsThing-attributable and which was not corrected at
// no cost, and only then does CON-01c's second consecutive breach flip that
// month to actual-metered pricing.
//
// So there is deliberately no "apply an adjustment" button anywhere. The
// adjustment is applied by deciding the review and re-running the month,
// which is the same rule FEAT-048-AC-4 states for every other figure here:
// corrections happen by fixing inputs and re-running, never by typing over
// an output.

import type { DeviationRootCause, DeviationReviewState } from "@prisma/client";

export type RootCauseMeta = {
  id: DeviationRootCause;
  label: string;
  /** CON-01b: does this count against FirsThing's performance guarantee? */
  countsAgainstGuarantee: boolean;
  /** What the reviewer is telling the society, in one line. */
  consequence: string;
};

/**
 * CON-01b's named exclusion list, plus the one cause that is FirsThing's own.
 * Order matters on screen: the attributable cause is first because choosing
 * it is the consequential act, not the default.
 */
export const ROOT_CAUSES: RootCauseMeta[] = [
  {
    id: "firsthing_attributable",
    label: "FirsThing-attributable",
    countsAgainstGuarantee: true,
    consequence:
      "Ours to fix. Corrected within a month at no cost, the bill is unchanged; uncorrected, the next out-of-band month bills on actual metered savings (CON-01b/c).",
  },
  {
    id: "lighting_layout_change",
    label: "Lighting layout changed",
    countsAgainstGuarantee: false,
    consequence: "On CON-01b's exclusion list — the bill stays at the contracted amount.",
  },
  {
    id: "blocked_sensors",
    label: "Blocked sensors",
    countsAgainstGuarantee: false,
    consequence: "On CON-01b's exclusion list — the bill stays at the contracted amount.",
  },
  {
    id: "usage_pattern_change",
    label: "Usage pattern changed",
    countsAgainstGuarantee: false,
    consequence: "On CON-01b's exclusion list — the bill stays at the contracted amount.",
  },
  {
    id: "external_electrical",
    label: "External electrical issue",
    countsAgainstGuarantee: false,
    consequence: "On CON-01b's exclusion list — the bill stays at the contracted amount.",
  },
  {
    id: "society_maintenance",
    label: "Society-side maintenance",
    countsAgainstGuarantee: false,
    consequence: "On CON-01b's exclusion list — the bill stays at the contracted amount.",
  },
];

export function rootCauseMeta(id: DeviationRootCause): RootCauseMeta {
  const found = ROOT_CAUSES.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown deviation root cause: ${id}`);
  return found;
}

export type DecisionInput = {
  rootCause: DeviationRootCause | null;
  /** Only meaningful for a FirsThing-attributable cause. */
  correctedAtNoCost: boolean;
  /** The reviewer's own reasoning — INV-03's "not just a flag". */
  decision: string;
  /** OQ-09: what the society is told when the cause is excluded. */
  societyExplanation: string;
  /** INV-03: a decision needs an owner. */
  ownerId: string | null;
};

export const DECISION_REFUSALS = {
  noRootCause:
    "A deviation decision needs a root-cause classification, not just a note — INV-03.",
  noOwner: "A deviation decision needs a named owner — INV-03.",
  noReasoning:
    "Record what the investigation found. A classification with no reasoning behind it is the flag INV-03 exists to forbid.",
  noSocietyExplanation:
    "An excluded cause leaves the society's bill unchanged, so the society is owed the reason (CON-01b / OQ-09). Write what they will be told.",
} as const;

/** Returns null when the decision may be recorded. */
export function refuseDecision(input: DecisionInput): string | null {
  if (!input.rootCause) return DECISION_REFUSALS.noRootCause;
  if (!input.ownerId) return DECISION_REFUSALS.noOwner;
  if (input.decision.trim() === "") return DECISION_REFUSALS.noReasoning;
  const meta = rootCauseMeta(input.rootCause);
  // An excluded cause is the one that costs the society money it might
  // dispute, so it is the one that must come with an explanation.
  if (!meta.countsAgainstGuarantee && input.societyExplanation.trim() === "") {
    return DECISION_REFUSALS.noSocietyExplanation;
  }
  return null;
}

export type BillingConsequence = {
  /** Does this decision expose the NEXT out-of-band month to actual-metered pricing? */
  exposesNextMonth: boolean;
  headline: string;
  detail: string;
};

/**
 * What the decision means for money — stated in the reviewer's own words on
 * screen before they commit, because "fixable / not fixable" was exactly the
 * flag INV-03 was written to replace.
 */
export function billingConsequence(input: {
  rootCause: DeviationRootCause;
  correctedAtNoCost: boolean;
}): BillingConsequence {
  const meta = rootCauseMeta(input.rootCause);
  if (!meta.countsAgainstGuarantee) {
    return {
      exposesNextMonth: false,
      headline: "The bill stays at the contracted amount.",
      detail:
        "This cause is on CON-01b's exclusion list, so the shortfall does not count against the performance guarantee — this month and every following month bill as contracted. The society is told why.",
    };
  }
  if (input.correctedAtNoCost) {
    return {
      exposesNextMonth: false,
      headline: "Corrected at no cost — the bill stays at the contracted amount.",
      detail:
        "CON-01b allows a FirsThing-attributable shortfall to be corrected within a month at no cost. Recorded as corrected, it cannot carry into next month's pricing.",
    };
  }
  return {
    exposesNextMonth: true,
    headline: "If next month is also out of band, it bills on actual metered savings.",
    detail:
      "A FirsThing-attributable shortfall left uncorrected is what CON-01c calls sustained. This month still bills as contracted — month 1 never adjusts — but a second consecutive out-of-band month flips to actual-metered pricing through CON-11.",
  };
}

export const STATE_LABEL: Record<DeviationReviewState, string> = {
  raised: "Raised",
  assigned: "Assigned",
  investigated: "Investigated",
  decided: "Decided",
  closed: "Closed",
  escalated: "Escalated",
};

/** Open reviews are the ones still holding a month back. */
export function isOpen(state: DeviationReviewState): boolean {
  return state !== "closed";
}

/**
 * Queue order: the cheapest resolution should be the easiest to reach
 * (FEAT-055-AC-5), so a deviation a low coverage month could explain is
 * surfaced above one that needs somebody on site. After that, oldest first —
 * a review that has been sitting is the one at risk of a second month
 * landing on top of it.
 */
export function queueRank(input: {
  state: DeviationReviewState;
  coverageDays: number;
  daysInMonth: number;
  raisedAt: Date;
  now: Date;
}): number {
  const undecided = input.state === "raised" || input.state === "assigned" ? 0 : 1;
  const dataExplains = input.coverageDays < input.daysInMonth ? 0 : 1;
  const ageDays = Math.floor((input.now.getTime() - input.raisedAt.getTime()) / 86_400_000);
  return undecided * 1_000_000 + dataExplains * 100_000 - ageDays;
}
