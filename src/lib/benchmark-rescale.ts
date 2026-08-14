// FEAT-041 / CON-10 / INV-07 — light-count-triggered baseline rescale.
//
// Every decision and every piece of arithmetic in this feature lives here,
// as pure functions, for the reason PROJECT_CONTEXT.md's Architecture
// Decisions section already records: a Server Action that calls auth()
// can't be unit-tested outside a live request context, so the actual rule
// is factored out and the action stays a thin DB/logging shell. That
// matters more here than usual — 12-test-plan.md assigns FEAT-041-AC-1 and
// AC-5 to the `unit` level specifically because this is CAP-02 pure
// computation, and it is the arithmetic a society would dispute.

export type RescaleEvent = {
  previousLightCount: number;
  newLightCount: number;
  previousBaseline: number;
  rescaledBaseline: number;
  effectiveDate: Date;
  /**
   * A voided event is struck from the replay but stays in the record.
   *
   * An append-only log with no correction path is a log that accumulates
   * mistakes forever — and because these rows *replay* into the baseline a
   * society is billed on, one mistyped count silently corrupts every figure
   * after it. So a wrong entry is voided (soft-deleted, with an owner and a
   * reason) rather than edited or removed: editing in place would restate a
   * figure someone was already billed on, which is precisely what INV-02 and
   * ADR-005 exist to prevent. A correction is a void plus a fresh event.
   */
  voidedAt?: Date | null;
};

/** Events that still count toward the replay, in effective-date order. */
function liveEventsUpTo(events: RescaleEvent[], at: Date): RescaleEvent[] {
  return events
    .filter((e) => !e.voidedAt && e.effectiveDate.getTime() <= at.getTime())
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
}

/**
 * CON-10's worked example, exactly: 100 units ÷ 50 lights × 54 = 108.
 *
 * Deterministic and proportional — this is a reapplication of the same
 * formula to a changed input, never a renegotiation. Not rounded: the
 * baseline is a measured kWh/day average that later feeds a savings
 * percentage and then a rupee figure, and rounding here would push the
 * error into the number the society is actually billed on (INV-02).
 */
export function rescaleBaseline(baseline: number, previousLightCount: number, newLightCount: number): number {
  return (baseline / previousLightCount) * newLightCount;
}

export type RescaleRefusal =
  | "no-baseline"
  | "unverified"
  | "same-count"
  | "invalid-count"
  | "invalid-date";

/**
 * FEAT-041-AC-3 (verification is mandatory) plus the input rules a rescale
 * has to satisfy before it is allowed to touch a billable figure. Returns
 * a reason code, or null when the rescale may proceed.
 *
 * A rescale is refused outright without supporting verification: an
 * unverified count change is exactly the dispute scenario INV-07 exists to
 * guard against, so this is a refusal, not a warning.
 */
export function refuseRescale(input: {
  commissionedBaseline: number | null;
  currentLightCount: number;
  newLightCount: number;
  verificationNote: string;
  effectiveDate: Date | null;
}): RescaleRefusal | null {
  // FEAT-041-AC-2's other half — a circuit with no commissioned baseline
  // has nothing to rescale; there is no "original" to scale from yet.
  if (input.commissionedBaseline == null || input.commissionedBaseline <= 0) return "no-baseline";
  if (!input.verificationNote.trim()) return "unverified";
  if (!Number.isInteger(input.newLightCount) || input.newLightCount <= 0) return "invalid-count";
  if (input.newLightCount === input.currentLightCount) return "same-count";
  if (!input.effectiveDate || Number.isNaN(input.effectiveDate.getTime())) return "invalid-date";
  return null;
}

export const REFUSAL_MESSAGE: Record<RescaleRefusal, string> = {
  "no-baseline":
    "This circuit has no commissioned baseline yet — finish the pre-install monitoring window before recording a light-count change.",
  unverified:
    "A rescale needs supporting verification — record how the new count was verified. An unverified count change is exactly what this guards against.",
  "same-count": "The new light count is the same as the current one — nothing to rescale.",
  "invalid-count": "The new light count must be a whole number greater than zero.",
  "invalid-date": "An effective date is required.",
};

/**
 * The baseline in force on a given date: the commissioned baseline with
 * every rescale effective on or before that date applied.
 *
 * FEAT-041-AC-5 — application is strictly forward. A rescale dated into a
 * month that has already been invoiced does not restate that invoice,
 * because a comparison run for an earlier date simply never sees the later
 * event; the discrepancy surfaces through CAP-05's deviation review
 * instead of history silently changing underneath a figure someone was
 * already billed on.
 *
 * FEAT-041-AC-2 — with no events, this returns the commissioned baseline
 * unchanged, which is what makes "history shows the original commissioned
 * baseline only" true by construction rather than by a special case.
 */
export function effectiveBaselineAt(
  commissionedBaseline: number | null,
  events: RescaleEvent[],
  at: Date,
): number | null {
  if (commissionedBaseline == null) return null;
  const applicable = liveEventsUpTo(events, at);
  if (applicable.length === 0) return commissionedBaseline;
  return applicable[applicable.length - 1].rescaledBaseline;
}

/**
 * The light count in force on a given date — the same replay, for the
 * count itself. Reported alongside the baseline so a screen can state
 * *why* the effective baseline differs from the commissioned one.
 */
export function effectiveLightCountAt(
  commissionedLightCount: number,
  events: RescaleEvent[],
  at: Date,
): number {
  const applicable = liveEventsUpTo(events, at);
  if (applicable.length === 0) return commissionedLightCount;
  return applicable[applicable.length - 1].newLightCount;
}

/**
 * A void is itself a billing-affecting act — it changes which baseline was in
 * force — so it needs an owner and a stated reason, exactly like the rescale
 * it strikes out (INV-03's reasoning, applied to the correction path).
 */
export function refuseVoid(input: { reason: string; alreadyVoided: boolean }): string | null {
  if (input.alreadyVoided) return "This entry has already been voided.";
  if (!input.reason.trim()) {
    return "Voiding an entry changes which baseline was in force — record why.";
  }
  return null;
}
