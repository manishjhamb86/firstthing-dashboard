// Soft-deleting a circuit — who may do it, and when nobody may.
//
// A circuit is not an ordinary list row. Once commissioned it carries a
// baseline, a benchmark and eventually fee lines, and CON-11 makes it the
// grain a society is actually billed on. So "delete" here is always a void:
// the row survives, struck out, with an owner and a reason, and stops being
// counted anywhere. Nothing in this codebase hard-deletes one.
//
// The authority rule follows the cost of being wrong, which rises with how
// much of the lifecycle the circuit has been through:
//
//   nothing recorded yet   the person who created it, or ops. A candidate
//                          added twice by mistake during a survey is the
//                          field team's own housekeeping, and making them
//                          wait on the ops lead to tidy a typo is friction
//                          with no safety value.
//   any progress           ops only. Once a meter is on the wall, a gate
//                          pass exists or readings have been taken, voiding
//                          discards work someone else did and evidence a
//                          later figure may rest on.
//   billed and released    nobody. The circuit appears on an invoice a
//                          society has already been shown, and GATE-02 makes
//                          released billing documents append-only. Voiding it
//                          would silently unmake a line on that invoice.

export type CircuitProgressFacts = {
  meterInstalledAt: Date | null;
  preInstallBaseline: number | null;
  benchmarkSavingsPct: number | null;
  gatePassCount: number;
  commissioningReadingCount: number;
  meterReadingCount: number;
  rescaleEventCount: number;
  feeLineCount: number;
  /** Fee lines belonging to a calculation that has been released. */
  releasedFeeLineCount: number;
};

/**
 * Has anything actually happened to this circuit beyond being written down?
 *
 * Deliberately generous about what counts: any of these means someone did
 * work against this circuit, or a figure somewhere may rest on it. Being
 * wrong in this direction only costs a request to the ops lead; being wrong
 * the other way discards someone else's evidence.
 */
export function hasProgress(f: CircuitProgressFacts): boolean {
  return (
    f.meterInstalledAt != null ||
    f.preInstallBaseline != null ||
    f.benchmarkSavingsPct != null ||
    f.gatePassCount > 0 ||
    f.commissioningReadingCount > 0 ||
    f.meterReadingCount > 0 ||
    f.rescaleEventCount > 0 ||
    f.feeLineCount > 0
  );
}

export type VoidCircuitActor = {
  id: string;
  isOps: boolean;
};

export type VoidDecision =
  | { allowed: true; tier: "untouched" | "in_progress" }
  | { allowed: false; reason: string };

/**
 * Who may void this circuit, given what has happened to it.
 *
 * `createdById` is null for every circuit that predates the column. That is
 * treated as "creator unknown", which falls through to ops-only — the safe
 * direction, since the alternative would be letting anyone claim authorship
 * of a row nobody is recorded as having made.
 */
export function decideVoidCircuit(input: {
  actor: VoidCircuitActor;
  createdById: string | null;
  alreadyVoided: boolean;
  reason: string;
  facts: CircuitProgressFacts;
}): VoidDecision {
  if (input.alreadyVoided) {
    return { allowed: false, reason: "This circuit has already been removed." };
  }

  // GATE-02 — a released billing document is append-only. This refusal binds
  // ops too: it is not a permission the ops lead is missing, it is a thing
  // the system does not do.
  if (input.facts.releasedFeeLineCount > 0) {
    return {
      allowed: false,
      reason:
        "This circuit is billed on an invoice a society has already been shown, so it can't be removed. A change to a billed circuit goes through a contract amendment or a deviation review, which leaves a record on the invoice rather than quietly unmaking a line on it.",
    };
  }

  if (!input.reason.trim()) {
    return { allowed: false, reason: "Record why this circuit is being removed." };
  }

  const progressed = hasProgress(input.facts);

  if (!progressed) {
    const isCreator = input.createdById != null && input.createdById === input.actor.id;
    if (isCreator || input.actor.isOps) return { allowed: true, tier: "untouched" };
    return {
      allowed: false,
      reason: "Only the person who added this circuit, or the operations lead, can remove it.",
    };
  }

  if (input.actor.isOps) return { allowed: true, tier: "in_progress" };
  return {
    allowed: false,
    reason:
      "This circuit has commissioning work recorded against it, so removing it is an operations lead action. It needs both pipeline and field-survey authority.",
  };
}

/**
 * What the screen tells the viewer about a circuit it isn't offering to
 * remove — stated in terms of the circuit, not of the viewer's permissions,
 * so the reason is legible to whoever is actually looking at it.
 */
export function describeVoidBlock(facts: CircuitProgressFacts): string | null {
  if (facts.releasedFeeLineCount > 0) return "Billed — can't be removed";
  if (hasProgress(facts)) return "Has commissioning work — operations lead only";
  return null;
}
