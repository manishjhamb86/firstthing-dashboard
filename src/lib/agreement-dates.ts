import { startOfDayUTC } from "@/lib/step-dates";
import { formatDate } from "@/lib/format-date";

/**
 * The dates an agreement and its contract carry, and the order they hold in
 * (2026-09-27, user-asked: "allow to edit all dates here in demo mode, after
 * live only on special request"). Like the installation's, they are corrected
 * together and checked once against the result — so a record typed up on the
 * wrong day can be moved wholesale without one date blocking another.
 *
 * Null means the step has not happened; it is skipped by every rule.
 */
export type AgreementDates = {
  today: Date;
  offerAcceptedOn: Date | null;
  prepared: Date;
  printed: Date | null;
  notarized: Date | null;
  signed: Date | null;
  uploaded: Date | null;
  activated: Date | null;
  termStart: Date | null;
  termEnd: Date | null;
};

const d = (x: Date) => startOfDayUTC(x).getTime();

export function refuseAgreementDates(s: AgreementDates): string | null {
  const today = d(s.today);
  const named: [string, Date | null][] = [
    ["prepared", s.prepared],
    ["printed", s.printed],
    ["notarised", s.notarized],
    ["signed", s.signed],
    ["uploaded (the executed scan)", s.uploaded],
    ["activated (the contract)", s.activated],
  ];
  for (const [label, v] of named) {
    if (v && d(v) > today) return `The agreement cannot be ${label} in the future.`;
  }
  if (s.offerAcceptedOn && d(s.prepared) < d(s.offerAcceptedOn)) {
    return `The agreement cannot be prepared (${formatDate(s.prepared)}) before the offer was accepted (${formatDate(s.offerAcceptedOn)}).`;
  }
  // Each step no earlier than the one before it that has happened.
  const chain: [string, Date | null][] = [
    ["prepared", s.prepared],
    ["printed", s.printed],
    ["notarised", s.notarized],
    ["signed", s.signed],
    ["uploaded", s.uploaded],
  ];
  let last: [string, Date] | null = null;
  for (const [label, v] of chain) {
    if (!v) continue;
    if (last && d(v) < d(last[1])) {
      return `The agreement cannot be ${label} (${formatDate(v)}) before it was ${last[0]} (${formatDate(last[1])}).`;
    }
    last = [label, v];
  }
  if (s.activated && s.signed && d(s.activated) < d(s.signed)) {
    return `The contract cannot be activated (${formatDate(s.activated)}) before the agreement was signed (${formatDate(s.signed)}).`;
  }
  if (s.termStart && s.termEnd && d(s.termEnd) <= d(s.termStart)) {
    return `The term cannot end (${formatDate(s.termEnd)}) on or before it starts (${formatDate(s.termStart)}).`;
  }
  return null;
}
