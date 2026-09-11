// FEAT-053 / CON-33 — the rules around attaching the Zoho-generated tax
// invoice and releasing the month it belongs to. Pure, per this codebase's
// own convention (portal-authority.ts, benchmark-rescale.ts): a Server
// Action that calls auth() can't be unit-tested outside a live request
// context, so the actual decision lives here and the action is a thin shell.

/**
 * GST on FirsThing's own commercial total, as printed on every sample
 * invoice checked (2026-09-12): a flat 18%, split as IGST for an
 * inter-state bill or CGST+SGST for an intra-state one — the total tax
 * FRACTION is the same either way, which is all a reconciliation check
 * needs. This is a stated assumption, not a rule this codebase has any
 * other evidence for yet: if a future invoice carries a different rate
 * (a GST slab change, an exempt line item), this constant is the one
 * place to revisit, and MISMATCHED is the safe failure mode in the
 * meantime — it asks a human to look, it never silently bills wrong.
 */
export const ASSUMED_GST_RATE = 0.18;

export type ReconciliationOutcome = {
  /** The Zoho amount is what INV-02 traces the bill to going forward. */
  expectedAmount: number;
  deltaPct: number;
  status: "matched" | "mismatched";
};

/**
 * Compares the app's own computed commercial total (pre-tax) against what
 * the uploaded invoice actually charged (GST-inclusive) — never a bare
 * equality check, since the two figures are computed on different bases
 * by design (ours is the revenue-share commercial amount; Zoho's is that
 * plus GST). A 2% tolerance absorbs rounding on the GST line itself.
 */
export function reconcileInvoiceAmount(computedTotal: number, invoicedAmount: number): ReconciliationOutcome {
  const expectedAmount = computedTotal * (1 + ASSUMED_GST_RATE);
  const deltaPct = expectedAmount > 0 ? (Math.abs(invoicedAmount - expectedAmount) / expectedAmount) * 100 : 100;
  return { expectedAmount, deltaPct, status: deltaPct <= 2 ? "matched" : "mismatched" };
}

export type CalculationForRelease = {
  status: "held" | "calculated" | "released" | "sent_back" | "superseded";
};

export type InvoiceForRelease = {
  reconciliationStatus: "unchecked" | "matched" | "mismatched" | "acknowledged";
} | null;

/**
 * FEAT-053-AC-1/AC-3: a mismatch blocks release until acknowledged. The
 * ordering this encodes — attach the real invoice, reconcile it, THEN
 * release — means CON-13's payment clock (which starts at release) is
 * always keyed to a real due date FirsThing actually billed against, not
 * an assumed one.
 */
export function refuseRelease(input: {
  calculation: CalculationForRelease;
  invoice: InvoiceForRelease;
  unresolvedDeviationCount: number;
}): string | null {
  if (input.calculation.status === "released") return "This month is already released.";
  if (input.calculation.status === "superseded") return "A newer version of this month exists — release that one.";
  if (input.calculation.status === "held") return "This month is held and cannot be released as-is.";
  if (input.unresolvedDeviationCount > 0) {
    return `${input.unresolvedDeviationCount} deviation${input.unresolvedDeviationCount === 1 ? "" : "s"} on this month ${input.unresolvedDeviationCount === 1 ? "is" : "are"} still open — resolve ${input.unresolvedDeviationCount === 1 ? "it" : "them"} before releasing.`;
  }
  if (!input.invoice) return "No invoice is attached yet — upload the one Zoho generated for this month first.";
  if (input.invoice.reconciliationStatus === "mismatched") {
    return "The uploaded invoice doesn't match this month's computed total — acknowledge the mismatch before releasing.";
  }
  return null;
}

/** FEAT-053-AC-4: no correction path for an attached invoice yet — refuse a
 *  second one outright rather than silently replacing evidence, matching
 *  this codebase's own "no edit-in-place" rule elsewhere (rescale events,
 *  documents). A genuinely wrong upload needs a person to notice this
 *  refusal and ask for the void-and-reattach path to be built. */
export function refuseInvoiceAttach(input: {
  calculation: CalculationForRelease;
  alreadyAttached: boolean;
  amount: number;
}): string | null {
  if (input.calculation.status === "released") return "This month is already released — its invoice cannot be replaced here.";
  if (input.calculation.status === "superseded") return "A newer version of this month exists — attach the invoice there.";
  if (input.calculation.status === "held") return "This month is held and has no computed total to reconcile against yet.";
  if (input.alreadyAttached) {
    return "An invoice is already attached to this month. There is no correction path yet — ask for one to be built rather than uploading a second file.";
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "The invoice amount must be a positive number.";
  return null;
}
