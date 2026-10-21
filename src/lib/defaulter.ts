// Marking a society a defaulter (2026-10-21, user-asked: "give option to
// mark a society as defaulter who stopped making payment or either never
// paid"). A stated, reversible flag an operator sets by hand — deliberately
// NOT the same thing as deal-close.ts's reject/terminate, and NOT a change to
// CON-13's own automatic arrears clock. That clock keeps running exactly as
// before (deal-close.ts's own standing rule — "unpaid invoices stay owed and
// keep being followed up" — is untouched here). The only consequence of this
// flag is where the society's notifications are read: out of the main feed,
// into their own "Defaulter societies" section (src/lib/notifications.ts).
//
// A rejected/terminated society (Society.closedAt) can also be a defaulter —
// the two are independent facts. Rejecting answers "is there still a deal
// here"; marking defaulter answers "has this society stopped paying."

/** Why a society cannot be marked a defaulter as asked, or null. */
export function refuseMarkDefaulter(reason: string): string | null {
  if (!reason.trim()) return "Say why — the reason is kept on the record.";
  return null;
}
