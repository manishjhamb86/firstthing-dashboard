// Which bulk actions a row on the invoice intake list can take (2026-09-25,
// user-asked: "bulk select and update status like, filed as document and
// release to society"). One rule for the checkbox, the action bar's counts
// and the server's re-check, so the three cannot disagree.

export type BulkAction = "submit" | "file" | "release";

export type BulkRow = {
  /** The list's display status (page.tsx), e.g. "needs_review", "submitted_filed_document". */
  status: string;
  hasSociety: boolean;
  hasPeriod: boolean;
};

export function bulkActionsFor(r: BulkRow): BulkAction[] {
  const out: BulkAction[] = [];
  if (r.status === "ready") out.push("submit");
  // Filing needs the two things the filing slot is keyed on (INV-04: the
  // month is a confirmed choice, never guessed at filing time).
  if ((r.status === "ready" || r.status === "needs_review") && r.hasSociety && r.hasPeriod) out.push("file");
  // A filed invoice not yet on the portal, or a submitted month awaiting the
  // accountant — both reach the society by release, nothing else.
  if (r.status === "submitted_filed_document" || r.status === "submitted_awaiting_release") out.push("release");
  return out;
}

export const BULK_LABEL: Record<BulkAction, (n: number) => string> = {
  submit: (n) => `Submit ${n} ready`,
  file: (n) => `File ${n} as document${n === 1 ? "" : "s"}`,
  release: (n) => `Release ${n} to society`,
};
