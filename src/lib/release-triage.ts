// SCR-092 / CON-47 (2026-09-15 revision) — the release queue's triage rule,
// for an invoice-first month submitted from FEAT-109.
//
// The queue's job is the same one it was designed for: at 200 societies a
// one-at-a-time gate becomes the month-end bottleneck, and treating every
// row identically guarantees either a rubber stamp or a missed window. So
// the queue surfaces the handful that need a human and makes the rest one
// confident batch action. A needs-review month is never bulk-releasable —
// that refusal is the structural guarantee that the gate stays real.
//
// Most of this table is already true by construction for any row that
// reached `status: submitted` at all — `submitIntake` refuses to create one
// unless `openItems()` is empty, which already means the society and month
// are confirmed, every service line is mapped to a circuit, the arithmetic
// reconciles or carries a stated acknowledgement, and a payment status was
// chosen. They are re-checked here anyway, per the spec's own words: "a
// `Needs review` row whose reason is '1 line unmapped' is a row ops should
// never have been able to submit — it exists in the triage rule as a
// belt-and-braces check on the server's own refusal, not as an expected
// state." A count disagreement is treated as acknowledged by the act of
// submitting — this codebase has no separate "acknowledge without applying"
// step for it (only `applyCountForward`, which is optional), so there is
// nothing further for the queue to ask about it.
//
// Only two conditions are genuinely decided here, from fresh data at
// triage time: whether the invoice total sits near the society's own recent
// history, and whether any line's basis moved the wrong direction since
// last month (agreed → measured is progress, never a flag; measured →
// agreed is a real regression worth a human's attention).

export const RELEASE_TOTAL_VARIANCE_PCT = 10;

export type TriageInput = {
  societyConfirmed: boolean;
  monthConfirmed: boolean;
  allLinesMapped: boolean;
  arithmeticOk: boolean;
  paidStatusChosen: boolean;
  invoiceTotal: number;
  /** The society's trailing 3-month mean of INVOICED (not computed) totals, or null with no history to judge against. */
  trailingInvoicedMean: number | null;
  /** Any circuit whose line reads `measured` this month but `agreed` last month — a real regression. */
  basisRegressedCircuits: string[];
};

export type Triage = { routine: true; reasons: [] } | { routine: false; reasons: string[] };

export function triageInvoiceMonth(input: TriageInput): Triage {
  const reasons: string[] = [];

  if (!input.societyConfirmed) reasons.push("Society not confirmed");
  if (!input.monthConfirmed) reasons.push("Month not confirmed");
  if (!input.allLinesMapped) reasons.push("A service line is not mapped to a circuit");
  if (!input.arithmeticOk) reasons.push("The invoice's arithmetic has not reconciled or been acknowledged");
  if (!input.paidStatusChosen) reasons.push("Payment status was not recorded");
  if (input.basisRegressedCircuits.length > 0) {
    reasons.push(
      `${input.basisRegressedCircuits.length} circuit${input.basisRegressedCircuits.length === 1 ? "" : "s"} moved from measured savings back to the agreed benchmark`,
    );
  }
  if (input.trailingInvoicedMean !== null && input.trailingInvoicedMean > 0) {
    const deltaPct = ((input.invoiceTotal - input.trailingInvoicedMean) / input.trailingInvoicedMean) * 100;
    if (Math.abs(deltaPct) > RELEASE_TOTAL_VARIANCE_PCT) {
      const dir = deltaPct > 0 ? "above" : "below";
      reasons.push(`Total is ${Math.abs(Math.round(deltaPct))}% ${dir} the 3-month average`);
    }
  }

  return reasons.length === 0 ? { routine: true, reasons: [] } : { routine: false, reasons };
}
