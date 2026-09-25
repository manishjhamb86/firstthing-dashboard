// Facility management companies (2026-09-25, user-asked): who runs each
// society's facilities, and who works for whom — both with history. Pure
// rules; the actions are thin shells.

export function fmNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|llc|inc|co|company|services?|india)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Why a company cannot be saved as entered, or null. */
export function refuseFmCompany(c: { name: string; gstin?: string; email?: string }): string | null {
  if (!c.name.trim()) return "Name the company.";
  if (!fmNameKey(c.name)) return "That name has nothing left once 'Pvt Ltd' and the like are set aside.";
  if (c.gstin && c.gstin.trim() && !GSTIN.test(c.gstin.trim().toUpperCase())) return "That GSTIN is not in the right form (15 characters, e.g. 09AAACX1234F1Z5).";
  if (c.email && c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return "That email address is not valid.";
  return null;
}

const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const prevDay = (d: Date) => new Date(day(d) - 86_400_000);

export type OpenSpan = { id: string; companyId: string; startedOn: Date };

export type SpanPlan =
  | { kind: "none" }
  | { kind: "refuse"; error: string }
  /** Same day as the current span began: a correction of which company, not a move. */
  | { kind: "correct"; id: string; companyId: string | null }
  | { kind: "change"; close: { id: string; endedOn: Date } | null; open: { companyId: string; startedOn: Date } | null };

/**
 * Moving from the open span (a society's current company, or a person's
 * current employer) to `companyId` from `since`. The old span ends the day
 * before; the same company is no change; null closes without opening.
 */
export function planSpanChange(open: OpenSpan | null, companyId: string | null, since: Date, now = new Date()): SpanPlan {
  if (day(since) > day(now)) return { kind: "refuse", error: "That date is in the future." };
  if (open && open.companyId === companyId) return { kind: "none" };
  if (!open && companyId === null) return { kind: "none" };
  if (open && day(since) === day(open.startedOn)) return { kind: "correct", id: open.id, companyId };
  if (open && day(since) < day(open.startedOn))
    return { kind: "refuse", error: "The change has to be dated after the current one started — correct that one's start instead." };
  return {
    kind: "change",
    close: open ? { id: open.id, endedOn: prevDay(since) } : null,
    open: companyId ? { companyId, startedOn: new Date(day(since)) } : null,
  };
}
