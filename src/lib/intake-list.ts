/**
 * SCR-093's list rules — which chip a row belongs under, how the list sorts,
 * and what a typed search matches. Pure, so the page header's count and the
 * client's chip count read ONE function and cannot disagree (user-caught
 * 2026-09-16: "Needs review 140" was counting files nobody had read yet,
 * while the chip's own filter admitted rows the count left out).
 */

// A submitted row used to have one bucket regardless of what happened next
// (2026-09-24, user-caught: "why do awaiting release and released both come
// under Submitted status?") — split into the actual downstream states, so
// filtering to "Awaiting release" or "Released" answers "which invoices need
// attention" directly, without reading every row's own status text. Two more
// than the user listed: a row the accountant SENT BACK needs ops back on it
// before anything else, and a SUPERSEDED one (a re-derivation moved the
// stats on) is history, not a working state — both real, both kept visible
// rather than folded quietly into a chip they don't belong under.
export type IntakeView = "unread" | "failed" | "duplicate" | "review" | "ready" | "filed" | "sent_back" | "awaiting_release" | "released" | "superseded";

// `could_not_read` and `refused_duplicate` used to fold into the same
// "Needs review" chip as a row that read fine and only wants a human's
// confirmation — user-caught 2026-09-24: "there is no filter for the ones
// that faced error." Both are real, distinct outcomes with different next
// actions (retry or enter by hand; void the live invoice first), so each
// gets its own chip, the same "one bucket per real outcome" rule already
// applied to the submitted family above.
export const INTAKE_VIEWS: { key: IntakeView; label: string; empty: string }[] = [
  { key: "unread", label: "Not read yet", empty: "Every uploaded file has been read." },
  { key: "failed", label: "Could not read", empty: "Nothing failed to read." },
  { key: "duplicate", label: "Refused — duplicate", empty: "Nothing refused as a duplicate." },
  { key: "review", label: "Needs review", empty: "Nothing needs review." },
  { key: "ready", label: "Ready to submit", empty: "Nothing is ready to submit." },
  // A real, separate non-service bill (2026-09-24) — devices, installation,
  // a one-off charge, filed as a document rather than submitted as a month
  // of record. Its own bucket, not folded into "Awaiting release": nothing
  // here is waiting on the accountant, and calling it that would be false.
  { key: "filed", label: "Filed as document", empty: "Nothing filed separately." },
  { key: "sent_back", label: "Sent back", empty: "Nothing sent back." },
  { key: "awaiting_release", label: "Awaiting release", empty: "Nothing awaiting release." },
  { key: "released", label: "Released", empty: "Nothing released yet." },
  { key: "superseded", label: "Superseded", empty: "Nothing superseded." },
];

/**
 * A submitted row's own `InvoiceIntake.status` never moves again once set —
 * what moves is the month it became. `page.tsx` reads the linked
 * MonthlyCalculation's own `CalculationStatus` and rewrites the row's
 * display status to one of these four, so a released month reads
 * differently from one still waiting on the accountant (2026-09-24,
 * user-caught — every submitted row read as a bare "Submitted" regardless).
 *
 * A plain `` `submitted_${calcStatus}` `` template is the wrong tool here:
 * CalculationStatus's own "awaiting release" value IS the string
 * `"submitted"`, so that naive template collides with the intake's own
 * terminal status and produces `"submitted_submitted"` — which matches none
 * of the four keys and silently falls back to the bare label (the exact bug
 * this function's own test asserts against). An explicit map avoids it.
 */
const CALC_STATUS_SUFFIX: Record<string, string> = {
  submitted: "awaiting_release",
  released: "released",
  sent_back: "sent_back",
  superseded: "superseded",
};

/**
 * The display status for a submitted intake row, given the CalculationStatus
 * of the month it became (or `null`/`undefined` if the link is missing or
 * points at a pre-submission calculation shape — `held`/`calculated` belong
 * to the phase-two dashboard-generated run, never to an invoice-first
 * month). Returns the bare `"submitted"` fallback in either case.
 */
export function submittedDisplayStatus(calcStatus: string | null | undefined): string {
  const suffix = calcStatus ? CALC_STATUS_SUFFIX[calcStatus] : undefined;
  return suffix ? `submitted_${suffix}` : "submitted";
}

/**
 * A file the machine has not read is not "needing review" — nobody has
 * looked at it yet, and a read may still settle everything. It has its own
 * chip. A file that WAS read and came back short (`could_not_read`) or was
 * refused as a duplicate (`refused_duplicate`) each get their own chip too
 * — two different failures with two different fixes (retry or enter by
 * hand; void the live invoice first), not the same "needs a look" bucket
 * as a row that read fine and only wants confirming.
 *
 * A submitted row's own status field never changes once set — the month it
 * became is what moves, through the accountant's release gate. `page.tsx`
 * reads that linked calculation and rewrites the row's display status to one
 * of the `submitted_*` keys, each its own chip below (2026-09-24,
 * user-caught, twice: first that every submitted row read as a bare
 * "Submitted" whichever state it was in, then — once that was fixed to show
 * the right text — that awaiting-release and released still shared one
 * FILTER, so there was still no way to jump straight to what needs
 * attention). The bare `"submitted"` case is the defensive fallback for a
 * row whose calculation link is missing; it reads as awaiting release, since
 * that is the state a row in that position is in almost every real time.
 */
export function intakeViewOf(status: string): IntakeView | null {
  switch (status) {
    case "uploaded":
    case "reading":
      return "unread";
    case "could_not_read":
      return "failed";
    case "refused_duplicate":
      return "duplicate";
    case "needs_review":
      return "review";
    case "ready":
      return "ready";
    case "submitted_filed_document":
      return "filed";
    case "submitted":
    case "submitted_awaiting_release":
      return "awaiting_release";
    case "submitted_sent_back":
      return "sent_back";
    case "submitted_released":
      return "released";
    case "submitted_superseded":
      return "superseded";
    default:
      return null;
  }
}

export type IntakeListRow = {
  fileName: string;
  invoiceNumber: string | null;
  society: string | null;
  /** `YYYY-MM`, the operator's confirmed month — sortable, unlike its label. */
  periodKey: string | null;
  total: number | null;
  status: string;
  statusLabel: string;
  uploadedAtMs: number;
};

export type IntakeSortKey = "invoice" | "society" | "period" | "total" | "status" | "uploaded";

/**
 * The status column sorts in the order work flows, so "what is furthest
 * behind" is one click. Within the submitted family, a row sent back by the
 * accountant needs ops back on it before anything else — it ranks ahead of
 * one merely waiting on the accountant, which ranks ahead of a released or
 * superseded (done, no action left) row.
 */
const STATUS_ORDER: Record<string, number> = {
  uploaded: 0,
  reading: 1,
  could_not_read: 2,
  refused_duplicate: 3,
  needs_review: 4,
  ready: 5,
  submitted_filed_document: 5.5,
  submitted_sent_back: 6,
  submitted: 7,
  submitted_awaiting_release: 7,
  submitted_released: 8,
  submitted_superseded: 9,
  discarded: 10,
};

/** `firstDir` is where a column starts when first clicked: text and status from the front, figures and dates from the far end. */
export const INTAKE_SORTS: Record<IntakeSortKey, { label: string; firstDir: 1 | -1; get: (r: IntakeListRow) => string | number | null }> = {
  invoice: { label: "Invoice", firstDir: 1, get: (r) => (r.invoiceNumber ?? r.fileName).toLowerCase() },
  society: { label: "Society", firstDir: 1, get: (r) => r.society?.toLowerCase() ?? null },
  period: { label: "Month", firstDir: -1, get: (r) => r.periodKey },
  total: { label: "Total", firstDir: -1, get: (r) => r.total },
  // Furthest behind first — that is why anyone sorts by status.
  status: { label: "Status", firstDir: 1, get: (r) => STATUS_ORDER[r.status] ?? null },
  uploaded: { label: "Uploaded", firstDir: -1, get: (r) => r.uploadedAtMs },
};

/**
 * A row with nothing in the sorted column sinks, whichever way the sort runs
 * — the meters list's rule. "Sort by month" means "show me the ones that
 * have one", and a hundred "not confirmed" rows floating to the top is not
 * an ordering anybody asked for.
 */
export function compareIntakes(key: IntakeSortKey, dir: 1 | -1) {
  const { get } = INTAKE_SORTS[key];
  const tie = (a: IntakeListRow, b: IntakeListRow) => b.uploadedAtMs - a.uploadedAtMs || a.fileName.localeCompare(b.fileName);
  return (a: IntakeListRow, b: IntakeListRow) => {
    const av = get(a);
    const bv = get(b);
    if (av === null && bv === null) return tie(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return tie(a, b);
    return (av > bv ? 1 : -1) * dir;
  };
}

export function initialSortDir(key: IntakeSortKey): 1 | -1 {
  return INTAKE_SORTS[key].firstDir;
}

/**
 * A typed search matches the file name, the invoice number, the society and
 * the month label — every word typed has to appear somewhere, in any order,
 * so "aditya july" finds the row as readily as "FT/2026-27/055".
 */
export function intakeMatches(row: IntakeListRow & { periodLabel?: string | null }, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [row.fileName, row.invoiceNumber, row.society, row.periodKey, row.periodLabel, row.statusLabel]
    .filter((s): s is string => !!s)
    .join("   ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}
