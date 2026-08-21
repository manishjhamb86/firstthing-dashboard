import { isDemoMode } from "./demo-mode";
import { logger } from "./logger";
import { refuseOrderedDate, type DatePredecessor } from "./step-dates";

// The demo-mode half of the date rules, kept OUT of step-dates.ts on
// purpose: that module is pure and unit-tested, and isDemoMode() reaches
// through resolveAdmin() into next-auth, which drags `next/server` into any
// test that imports it (it broke the whole step-dates suite once — the file
// would not even load). Same split as portal-authority.ts: the decision is
// pure and tested, the request-context shell is thin and separate.

/**
 * Resolves a demo-mode backdate input into a Date, an error string, or null
 * for "use now()".
 *
 * The demo gate lives HERE rather than at each call site, so a form field
 * that leaks into a production build still cannot move a date: the value is
 * ignored outright unless DEMO_MODE is on.
 */
export async function resolveBackdate(
  input: string | undefined,
  subject: string,
  mustNotPrecede: DatePredecessor[] = [],
  now: Date = new Date(),
): Promise<Date | string | null> {
  if (!input) return null;
  if (!(await isDemoMode())) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  const refusal = refuseOrderedDate({ subject, date, now, mustNotPrecede });
  if (refusal) return refusal;
  logger.warn("demo.backdated", { subject, date: date.toISOString().slice(0, 10) });
  return date;
}
