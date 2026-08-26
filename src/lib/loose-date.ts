/**
 * A date as a document prints it → the date the system can store.
 *
 * Real agreements print "23 Oct 2025", "10 NOV 2025", "10/11/2025" and
 * "11/10/25" on the same page (Ace City, 2026-08-26). Anything that only
 * accepts an ISO string treats all four as unusable, which is what left the
 * signature field empty under a list of five perfectly legible dates.
 *
 * A numeric date whose two leading parts are both 12 or less is genuinely
 * ambiguous, and this returns BOTH readings rather than picking one. The
 * difference between 10 Nov and 11 Oct is a month of billing, and the
 * document is the only thing that could settle it — so the operator, who is
 * looking at it, decides.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type LooseDate =
  | { kind: "exact"; iso: string }
  /** Both readings of a numeric date, day-first then month-first. */
  | { kind: "ambiguous"; dayFirst: string; monthFirst: string }
  | null;

const pad = (n: number) => String(n).padStart(2, "0");

/** Rejects 31 February rather than rolling it into March, as Date would. */
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > days ? null : `${y}-${pad(m)}-${pad(d)}`;
}

/** Two digits are this century — a contract is not from 1925. */
const fullYear = (y: number) => (y >= 100 ? y : 2000 + y);

export function readLooseDate(text: string): LooseDate {
  const s = (text ?? "").trim();
  if (s === "") return null;

  const isoish = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (isoish) {
    const v = iso(Number(isoish[1]), Number(isoish[2]), Number(isoish[3]));
    return v ? { kind: "exact", iso: v } : null;
  }

  // A named month settles the order by itself, whichever side it is on.
  const named =
    /^(\d{1,2})[\s.\-/]*([A-Za-z]{3,})[\s.,\-/]*(\d{2,4})$/.exec(s) ??
    /^([A-Za-z]{3,})[\s.\-/]*(\d{1,2})[\s.,\-/]*(\d{2,4})$/.exec(s);
  if (named) {
    const monthFirst = /^[A-Za-z]/.test(named[1]);
    const month = MONTHS[(monthFirst ? named[1] : named[2]).slice(0, 3).toLowerCase()];
    const day = Number(monthFirst ? named[2] : named[1]);
    if (month) {
      const v = iso(fullYear(Number(named[3])), month, day);
      return v ? { kind: "exact", iso: v } : null;
    }
  }

  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = fullYear(Number(numeric[3]));
    const dayFirst = iso(y, b, a);
    const monthFirst = iso(y, a, b);
    if (dayFirst && monthFirst && dayFirst !== monthFirst) {
      return { kind: "ambiguous", dayFirst, monthFirst };
    }
    // Only one reading is a real date — 23/10 can only be the 23rd.
    const only = dayFirst ?? monthFirst;
    return only ? { kind: "exact", iso: only } : null;
  }

  return null;
}

/** The readings a document's date offers, as things a person can click. */
export function dateOptions(text: string): { iso: string; label: string }[] {
  const read = readLooseDate(text);
  if (!read) return [];
  if (read.kind === "exact") return [{ iso: read.iso, label: read.iso }];
  return [
    { iso: read.dayFirst, label: `${read.dayFirst} (day first)` },
    { iso: read.monthFirst, label: `${read.monthFirst} (month first)` },
  ];
}
