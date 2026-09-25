// Rejecting a society, closing a deal, terminating a contract (2026-09-25,
// user-asked: "give option to reject societies. before/after demo and even
// after billed ... sometimes the contract gets terminated mid way or even at
// start without paying a single invoice").
//
// Pure rules, one place; the actions are thin shells around them.
//  - A deal with no running contract is CLOSED AS LOST at whatever stage it
//    had reached; the stage is kept so a reopen can restore it.
//  - A deal with a contract is closed AND its contract TERMINATED from a
//    stated last served day. Billing prorates the final month to that day
//    (the same mechanism as a term ending mid-month) and bills nothing after.
//  - Unpaid invoices stay owed and keep being followed up; only the
//    automatic suspension stops, since there is no service left to suspend
//    (the user's call, 2026-09-25).
//  - Nothing is deleted. Reopening is refused once the final month has been
//    released on the termination (GATE-02 — a released month is not restated).

import { formatDate } from "@/lib/format-date";

export type ClosingDeal = {
  id: string;
  label: string;
  stage: string;
  contract: { id: string; status: string } | null;
};

export type ClosePlan = { dealId: string; label: string; action: "close" | "terminate" | "already_closed" };

export function planClose(deals: ClosingDeal[]): ClosePlan[] {
  return deals.map((d) => ({
    dealId: d.id,
    label: d.label,
    action:
      d.stage === "closed_lost"
        ? "already_closed"
        : d.contract && d.contract.status !== "terminated" && d.contract.status !== "expired"
          ? "terminate"
          : "close",
  }));
}

/** What the confirmation says each deal will become, in words. */
export function describePlan(p: ClosePlan, lastServedDay: Date): string {
  if (p.action === "already_closed") return `${p.label}: already closed — unchanged.`;
  if (p.action === "close") return `${p.label}: closed as lost at the stage it has reached.`;
  return `${p.label}: contract terminated — ${formatDate(lastServedDay)} is the last day billed, its month prorated to it; nothing is billed after.`;
}

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Why a close cannot be recorded as asked, or null. */
export function refuseClose(input: { reason: string; lastServedDay: Date | null; now: Date }): string | null {
  if (!input.reason.trim()) return "Say why — the reason is kept on the record.";
  if (!input.lastServedDay || Number.isNaN(input.lastServedDay.getTime())) return "Choose the date it ended.";
  if (dayUtc(input.lastServedDay) > dayUtc(input.now)) return "The end date cannot be in the future — record it on the day it ends.";
  return null;
}

/** The last day a contract is billed for: its term end, or its termination if earlier. */
export function servedUntil(termEnd: Date, terminatedOn: Date | null): Date {
  return terminatedOn && terminatedOn < termEnd ? terminatedOn : termEnd;
}

/** Why a terminated contract cannot be reopened, or null. */
export function refuseReopen(input: { terminatedOn: Date | null; releasedPeriods: string[] }): string | null {
  if (!input.terminatedOn) return null;
  const month = input.terminatedOn.toISOString().slice(0, 7);
  const released = input.releasedPeriods.filter((p) => p >= month).sort();
  if (released.length === 0) return null;
  return `The month ${released[0]} was billed and released on this termination — it cannot be restated (GATE-02). Record a new deal instead.`;
}

/** CON-13's suspension only applies to a society still being served. */
export function suspensionApplies(societyStatus: string): boolean {
  return societyStatus !== "terminated";
}
