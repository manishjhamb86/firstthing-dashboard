// FEAT-035 / CON-21 — the daily review gate, and FEAT-037's completion gate.
//
// Same convention as benchmark-rescale.ts and offer.ts: every rule and every
// piece of arithmetic lives here as pure functions, so it can be unit-tested
// without a live request context and so there is exactly one place the rule
// is written down.
//
// CON-21 in full: "each day's installed batch must be reviewed and approved
// (or disputed, with photo + location evidence) by the society's assigned
// onlooker at least 3 hours before the next day's installation begins; the
// next day's work cannot start until the prior day is approved. Skippable
// once per project only, and only with explicit backend approval."
//
// The cost of getting this wrong is a crew of technicians standing outside a
// building they cannot start work in, so the gate is computed the same way
// everywhere it is shown: the field capture screen, the society's review
// screen, and the ops plan all call these functions rather than each deciding
// for themselves what "blocked" means.

export const REVIEW_LEAD_HOURS = 3;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The moment by which the previous day's batches must be approved for a day
 * starting at `startAt`. Counted back from the crew's actual planned start
 * time, which is why the plan stores it rather than assuming a 09:00 day.
 */
export function reviewDeadlineFor(startAt: Date): Date {
  return new Date(startAt.getTime() - REVIEW_LEAD_HOURS * HOUR_MS);
}

export type BatchGateInput = {
  id: string;
  areaKey: string;
  state: "draft" | "awaiting_review" | "approved" | "disputed";
  submittedAt: Date | null;
  reviewedAt: Date | null;
};

export type DayGateStatus =
  /** Nothing to review — the first day, or the previous day cleared in time. */
  | "clear"
  /** Awaiting review, deadline still ahead. */
  | "pending"
  /** Awaiting review and inside the last 3 hours before the deadline. */
  | "at_risk"
  /** Deadline passed with the previous day unapproved, or a batch disputed. */
  | "blocked"
  /** Approved, but after the deadline — allowed to proceed, recorded as late. */
  | "late_approved"
  /** Cleared by the once-per-project skip rather than by an approval. */
  | "skipped";

export type DayGate = {
  status: DayGateStatus;
  canStart: boolean;
  deadline: Date | null;
  /** Batches still holding the gate up, so the UI can name them. */
  outstanding: BatchGateInput[];
  disputed: BatchGateInput[];
  reason: string | null;
};

/**
 * Whether the day starting at `startAt` may begin, given the previous day's
 * batches.
 *
 * The two readings this deliberately settles, because CON-21's wording alone
 * does not:
 *
 *  1. **A late approval clears the block.** SCR-062's "missed" state offers
 *     "approve now" as the recovery, so an approval that lands after the
 *     deadline unblocks the day — but it returns `late_approved`, never
 *     `clear`, because a gate that was actually missed should not read as one
 *     that was met. If late approvals silently read as clear, the skip
 *     allowance below becomes the only trace that anything went wrong.
 *  2. **A dispute blocks regardless of timing.** Disputing is the society
 *     saying the work is wrong; starting the next day on top of contested
 *     work is exactly what FLOW-07 step 3 exists to prevent.
 */
export function evaluateDayGate(input: {
  previousBatches: BatchGateInput[];
  startAt: Date;
  now: Date;
  skipUsedForDay?: boolean;
  /**
   * DEMO_MODE only: treat CON-21's 3-hour deadline as not yet passed, so a
   * whole installation can be walked in one sitting. Passed IN rather than
   * read from env here, so this stays a pure function its tests can drive
   * both ways. A DISPUTE still blocks — that is not a clock, it is the
   * society saying the work is wrong.
   */
  ignoreDeadline?: boolean;
}): DayGate {
  const { previousBatches, startAt, now } = input;
  const deadline = reviewDeadlineFor(startAt);

  if (previousBatches.length === 0) {
    return { status: "clear", canStart: true, deadline: null, outstanding: [], disputed: [], reason: null };
  }

  const disputed = previousBatches.filter((b) => b.state === "disputed");
  const outstanding = previousBatches.filter((b) => b.state !== "approved" && b.state !== "disputed");
  // The two outstanding shapes read very differently to the person asking
  // "why is tomorrow blocked" (2026-10-17, user-caught: the admin screen
  // said "unapproved" while the society's own portal showed nothing at all
  // waiting on them to review — because nothing had actually been
  // submitted yet). "Unapproved" is true either way, but it reads as "the
  // society hasn't acted," when the real blocker can just as easily be
  // "the crew never finished logging the day."
  const neverSubmitted = outstanding.filter((b) => b.submittedAt === null);
  const awaitingReview = outstanding.filter((b) => b.submittedAt !== null);
  const outstandingDescription = (): string => {
    if (neverSubmitted.length > 0 && awaitingReview.length === 0) {
      return neverSubmitted.length === 1
        ? "the previous day's batch was never submitted"
        : `${neverSubmitted.length} of the previous day's batches were never submitted`;
    }
    if (awaitingReview.length > 0 && neverSubmitted.length === 0) {
      return awaitingReview.length === 1
        ? "the previous day's batch is still awaiting the society's approval"
        : `${awaitingReview.length} of the previous day's batches are still awaiting the society's approval`;
    }
    return `${neverSubmitted.length} of the previous day's batches were never submitted and ${awaitingReview.length} are still awaiting the society's approval`;
  };

  if (input.skipUsedForDay) {
    return {
      status: "skipped",
      canStart: true,
      deadline,
      outstanding,
      disputed,
      reason: "The review gate was skipped for this day with backend approval — the once-per-project allowance.",
    };
  }

  if (disputed.length > 0) {
    return {
      status: "blocked",
      canStart: false,
      deadline,
      outstanding,
      disputed,
      reason: `The society disputed ${disputed.length === 1 ? "a batch" : `${disputed.length} batches`} from the previous day. The next day cannot start until that is resolved.`,
    };
  }

  if (outstanding.length > 0) {
    if (now >= deadline && !input.ignoreDeadline) {
      return {
        status: "blocked",
        canStart: false,
        deadline,
        outstanding,
        disputed,
        reason: `The ${REVIEW_LEAD_HOURS}-hour deadline has passed and ${outstandingDescription()}. Tomorrow's start is on hold.`,
      };
    }
    const atRisk = now >= new Date(deadline.getTime() - REVIEW_LEAD_HOURS * HOUR_MS);
    return {
      status: atRisk ? "at_risk" : "pending",
      canStart: true,
      deadline,
      outstanding,
      disputed,
      reason: atRisk
        ? `Due shortly — ${outstandingDescription()}. Without it, tomorrow's crew cannot start.`
        : null,
    };
  }

  // Every batch approved — was it in time?
  const lastReviewedAt = previousBatches.reduce<Date | null>((latest, b) => {
    if (!b.reviewedAt) return latest;
    return !latest || b.reviewedAt > latest ? b.reviewedAt : latest;
  }, null);

  if (lastReviewedAt && lastReviewedAt > deadline) {
    return {
      status: "late_approved",
      canStart: true,
      deadline,
      outstanding: [],
      disputed: [],
      reason: "Approved after the deadline. The day may proceed, but the gate was missed.",
    };
  }

  return { status: "clear", canStart: true, deadline, outstanding: [], disputed: [], reason: null };
}

/**
 * `evaluateDayGate` is correct in isolation — for ONE day, given only its own
 * immediate predecessor's batches. Its own first rule, "no previous batches
 * means clear," is right for day 1 (nothing precedes it) but wrong applied
 * blindly day after day: if day 2 is itself blocked, it never gets a batch —
 * so day 3, looking only at day 2's (empty) batches, reads that absence the
 * same way day 1 would and comes back "clear" too (2026-10-17, user-caught:
 * "shouldnt they all be blocked?"). Days run in sequence, so a block has to
 * carry forward until whatever is blocking it actually clears — this is the
 * one place that walks the whole chain, rather than every caller re-deriving
 * it (and risking the same one-day-blind mistake) from `evaluateDayGate` on
 * its own.
 */
export function evaluateDayGateChain(input: {
  /** Ascending by day number. */
  days: Array<{ day: number; startAt: Date; previousBatches: BatchGateInput[]; skipUsedForDay?: boolean }>;
  now: Date;
  ignoreDeadline?: boolean;
}): Map<number, DayGate> {
  const result = new Map<number, DayGate>();
  let blockedFromDay: number | null = null;

  for (const d of input.days) {
    if (blockedFromDay !== null) {
      result.set(d.day, {
        status: "blocked",
        canStart: false,
        deadline: null,
        outstanding: [],
        disputed: [],
        reason: `Day ${blockedFromDay} hasn't started yet — days run in order, and this one cannot begin until that one has.`,
      });
      continue;
    }
    const gate = evaluateDayGate({
      previousBatches: d.previousBatches,
      startAt: d.startAt,
      now: input.now,
      skipUsedForDay: d.skipUsedForDay,
      ignoreDeadline: input.ignoreDeadline,
    });
    result.set(d.day, gate);
    if (!gate.canStart) blockedFromDay = d.day;
  }

  return result;
}

export type SkipRefusal = "already-used" | "no-reason" | "not-blocked";

export const SKIP_REFUSAL_MESSAGE: Record<SkipRefusal, string> = {
  "already-used":
    "This project has already used its one review-gate skip. Only one is allowed per project — a second is not available at any authority level.",
  "no-reason": "A skip needs a recorded reason. It is an explicit backend decision, not a default.",
  "not-blocked": "Nothing is blocked. A skip is only available against a gate that is actually holding work up.",
};

/**
 * FEAT-035-AC-5 — the skip is a hard count, enforced here rather than by
 * FEAT-032's demo-skip exception (a separate rule that happens to share the
 * word "skip"). The allowance is spent by the project's `gateSkipUsedAt`
 * being set at all, so a second attempt has nothing left to consume.
 */
export function refuseGateSkip(input: {
  gateSkipUsedAt: Date | null;
  reason: string;
  gateBlocked: boolean;
}): SkipRefusal | null {
  if (input.gateSkipUsedAt) return "already-used";
  if (!input.gateBlocked) return "not-blocked";
  if (!input.reason.trim()) return "no-reason";
  return null;
}

// ── FEAT-037's completion gate ───────────────────────────────────────────

export type CompletionBlockReason =
  | { kind: "unapproved-batches"; count: number }
  | { kind: "disputed-batches"; count: number }
  | { kind: "open-blockers"; count: number }
  | { kind: "no-batches" }
  | { kind: "unplanned-days"; count: number };

/**
 * FEAT-037-AC-2/AC-3 — the completion action states exactly what is
 * outstanding rather than being merely disabled. Returns every reason, not
 * just the first: an ops user who clears one only to be told about the next
 * has been made to do the work twice.
 */
export function completionBlockers(input: {
  batches: BatchGateInput[];
  openBlockerCount: number;
  plannedDayCount: number;
  daysWithBatches: number;
}): CompletionBlockReason[] {
  const reasons: CompletionBlockReason[] = [];

  if (input.batches.length === 0) {
    reasons.push({ kind: "no-batches" });
  }
  const disputed = input.batches.filter((b) => b.state === "disputed").length;
  if (disputed > 0) reasons.push({ kind: "disputed-batches", count: disputed });

  const unapproved = input.batches.filter((b) => b.state !== "approved" && b.state !== "disputed").length;
  if (unapproved > 0) reasons.push({ kind: "unapproved-batches", count: unapproved });

  if (input.openBlockerCount > 0) reasons.push({ kind: "open-blockers", count: input.openBlockerCount });

  const missing = input.plannedDayCount - input.daysWithBatches;
  if (missing > 0) reasons.push({ kind: "unplanned-days", count: missing });

  return reasons;
}

/**
 * The gate for signing a PARTIAL completion certificate (2026-10-14,
 * user-asked): "start billing of installed lights even if the full
 * installation is not done... in exceptional cases when full installation
 * is delayed." Every reason `completionBlockers` checks still applies
 * EXCEPT the ones that just mean "the rest genuinely hasn't happened yet" —
 * that IS the exception being asked for. Every data-integrity reason (a
 * dispute, a batch that was actually submitted and is still awaiting the
 * society's sign-off, an open blocker, or nothing logged at all) still
 * blocks it; none of those become acceptable just because billing is
 * starting early.
 *
 * `unplanned-days` is always the "hasn't happened yet" case by definition.
 * `unapproved-batches` is split further (2026-10-14, user-caught on Prateek
 * Laurel): a batch a crew merely started but never submitted — `draft`,
 * `submittedAt` still null — is the SAME fact as a day with no batch row at
 * all; a batch the crew DID submit (`awaiting_review`) is real, unconfirmed
 * work, which is a different and more serious thing to bill on without the
 * society's approval, so that one still blocks.
 */
export function partialCompletionBlockers(input: Parameters<typeof completionBlockers>[0]): CompletionBlockReason[] {
  const untouchedOnly = input.batches
    .filter((b) => b.state !== "approved" && b.state !== "disputed")
    .every((b) => b.submittedAt === null);
  return completionBlockers(input).filter((r) => {
    if (r.kind === "unplanned-days") return false;
    if (r.kind === "unapproved-batches" && untouchedOnly) return false;
    return true;
  });
}

export function describeCompletionBlocker(r: CompletionBlockReason): string {
  switch (r.kind) {
    case "no-batches":
      return "No installation work has been logged yet.";
    case "disputed-batches":
      return `${r.count} ${r.count === 1 ? "batch is" : "batches are"} disputed by the society.`;
    case "unapproved-batches":
      return `${r.count} ${r.count === 1 ? "batch is" : "batches are"} still awaiting the society's approval.`;
    case "open-blockers":
      return `${r.count} open ${r.count === 1 ? "blocker" : "blockers"} — resolve or waive each one.`;
    case "unplanned-days":
      return `${r.count} planned ${r.count === 1 ? "day has" : "days have"} no batch logged.`;
  }
}
