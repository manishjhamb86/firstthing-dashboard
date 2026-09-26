import { startOfDayUTC } from "@/lib/step-dates";
import { formatDate } from "@/lib/format-date";

/**
 * The dates an installation carries — each batch's work day, the society's
 * approval of it, and the completion certificate's signature — and the rules
 * that hold between them (2026-09-27, user-asked).
 *
 * They were stamped "now" when recorded, which is wrong for a deal typed up
 * after the fact: Hyde Park's certificate read 26-09-2026 for an installation
 * billed since July 2025, and because the certificate's billing start outranks
 * the contract's, the society's monitoring figures went blank. Every rule here
 * is checked against the state AFTER a correction, so a correction is refused
 * only when the result would be out of order — never because the old value was.
 */
export type InstallationDates = {
  today: Date;
  batches: { day: number; submittedOn: Date | null; reviewedOn: Date | null }[];
  signedOn: Date | null;
};

const d = (x: Date) => startOfDayUTC(x).getTime();

export function refuseInstallationDates(s: InstallationDates): string | null {
  const today = d(s.today);
  for (const b of s.batches) {
    if (b.submittedOn && d(b.submittedOn) > today) return `Day ${b.day}'s work cannot be dated in the future.`;
    if (b.reviewedOn && d(b.reviewedOn) > today) return `Day ${b.day}'s approval cannot be dated in the future.`;
    if (b.submittedOn && b.reviewedOn && d(b.reviewedOn) < d(b.submittedOn)) {
      return `Day ${b.day} cannot be approved (${formatDate(b.reviewedOn)}) before the work it approves (${formatDate(b.submittedOn)}).`;
    }
  }
  if (s.signedOn) {
    if (d(s.signedOn) > today) return "The certificate cannot be signed in the future.";
    for (const b of s.batches) {
      const last = [b.submittedOn, b.reviewedOn].filter((x): x is Date => x !== null).sort((a, b2) => d(b2) - d(a))[0];
      if (last && d(last) > d(s.signedOn)) {
        return `The certificate (${formatDate(s.signedOn)}) cannot be signed before day ${b.day}'s work was done and approved (${formatDate(last)}). Correct that day's dates first.`;
      }
    }
  }
  return null;
}

/**
 * Who may correct them. Before go-live (demo mode) this is ordinary data entry,
 * so the field team who recorded the day may. After go-live a date here moves
 * a billing start, so it is operations' act alone and must say why — the
 * "special request" the user asked for.
 */
export function refuseDateCorrector(i: { demo: boolean; isField: boolean; isOps: boolean; reason: string }): string | null {
  if (i.demo) return i.isField ? null : "Correcting installation dates needs field or operations access.";
  if (!i.isOps) return "Once live, installation dates are corrected by operations only — ask an operations lead.";
  if (!i.reason.trim()) return "Say why the date is being corrected — it is kept with the old date.";
  return null;
}
