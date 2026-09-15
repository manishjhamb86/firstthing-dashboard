# ADR-011: An invoice-first month reuses the calculation schema, with the invoice's lines as first-class rows
**Status:** Accepted (user approved 2026-09-15) · **Date:** 2026-09-15 · **Reversibility:** moderate — additive columns and two new tables; nothing existing is renamed or dropped

## Context

CON-47 makes the Zoho invoice the month of record: for now, every society's month is *created* by
uploading its invoice (FEAT-109), its society-facing saving is *derived* from the invoice's light
count and either the circuit's measured savings or the agreed benchmark (FEAT-110), and it is
*published* through the accountant gate and shown on the portal (FEAT-111). Readings that arrive
later re-derive the stats as a new version. Bill generation from readings (FEAT-048 as written) is
phase two.

The schema already holds a versioned, releasable, supersession-linked month —
`MonthlyCalculation` → `CircuitFeeLine` (ADR-004's per-circuit grain) ← `BillingInvoice` — with
the arrears clock (`arrears_sweep`), the release gate (`requireAccountant`), the portal's `rupeesSaved`
read and the voided-invoice correction path all built against it. What it cannot express today:

1. **Where a month came from.** Every `MonthlyCalculation` is assumed to be `runCalculation`'s
   output from readings; an invoice-first month has no readings behind its fee.
2. **What a fee line's saving rests on.** `CircuitFeeLine.measuredSavingsPct` is always measured;
   there is no `agreed` basis, and no record of the *invoice's* light count as distinct from the
   circuit's `representedLightCount` (CON-47 d: the invoice's count governs the month's stats).
3. **The invoice's lines.** `BillingInvoice` stores one `amount`; the real invoices carry two
   service lines mapped to two deals plus a hardware line, a Discount column, and per-line tax.
4. **Reconciliation.** `computedAmount`/`reconciliationStatus` compare the invoice to a computed
   total that does not exist in this phase.
5. **A forward-only correction of a circuit's represented count** with provenance (FEAT-109-AC-6).
   `BenchmarkRescaleEvent` is the wrong table — it concerns the metered count and the baseline
   (INV-07), and using it here would make a population correction look like a rescale.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **A. Reuse `MonthlyCalculation`/`CircuitFeeLine`/`BillingInvoice`; add a `source`, a per-line `basis` and invoice light count, a `BillingInvoiceLine` table, a `not_applicable` reconciliation value, and a small `RepresentedCountChange` audit table** | Every consumer built since MS-08 — release gate, arrears sweep, portal `rupeesSaved`, void-and-reattach, the billing board, the notification feed — works on an invoice-first month with no second code path. Versioning and supersession (ADR-005) are already there for the re-derivation rule. Phase two (bill generation) lands as a second `source` value, not a migration | `CircuitFeeLine` gains columns that are null on readings-sourced rows and vice-versa (`meteredKwh` is 0 on an agreed line); `runCalculation` and the new derive function must agree on the line's shape | low — 2 tables, ~6 columns, 3 enum values |
| B. A separate `InvoiceMonth`/`InvoiceMonthLine` model, joined to the portal and release screens beside the calculation model | Clean separation; no nullable-by-source columns | Two months-of-record for one (society, period) that every reader has to union: the release queue, the arrears sweep, the portal's ₹ tile, `liveInvoice()`, the billing board's "invoice pending" state. The exact "two rules for one question" shape this codebase has fixed three times | medium now, high later — every future billing feature is written twice |
| C. Treat the invoice-first month as a `MonthlyCalculation` with `held` status and no fee lines; keep stats in a side table | Smallest schema delta | A published month that is `held` is a lie to every existing reader; stats outside `CircuitFeeLine` puts the society's ₹ figure somewhere `rupeesSaved` cannot see | low now, wrong |

## Decision

**Option A.** Concretely, the additive schema delta (one migration, no destructive step):

- `MonthlyCalculation.source` — new enum `CalculationSource { readings, invoice }`, default
  `readings` so every existing row keeps its meaning. `CalculationStatus` gains `submitted` (ops
  has submitted an invoice-first month; the accountant has not yet published). `runCalculation`
  is unchanged for `readings`; the billing board hides "Run month" for a period that already holds
  a live `invoice`-sourced month, and the board's own status labels map `submitted`.
- `CircuitFeeLine.basis` — new enum `SavingsBasis { measured, agreed }` (non-null; existing rows
  backfilled `measured`, which is what they are). `CircuitFeeLine.invoiceLightCount Int?` — the
  count the invoice billed, which on an invoice-first line is what `representedLightCount` on that
  row *is*; the column exists so a later reader can tell "invoice said 1,155" from "circuit said
  1,153" without reopening the PDF. `coverageDays` carries the days behind a measured line and `0`
  on an agreed one. The provenance object already stored in `MonthlyCalculation.inputVersionSnapshot`
  gains `basis`, `benchmarkSource` (`demo | override`) and, on re-derivation, `rederivedFromId`.
- `BillingInvoiceLine` — new table: `billingInvoiceId`, `lineNo`, `description` (verbatim), `hsn`,
  `qty`, `rate`, `discount`, `taxPct`, `taxAmount`, `amount`, `kind` (`InvoiceLineKind { service,
  other }`), `circuitId?` (set on service lines), `arithmeticOk`, `arithmeticNote?`,
  `countDisagreement Int?` (the circuit's represented count at review time when it differed).
  `@@unique([billingInvoiceId, lineNo])`. `BillingInvoice` gains `subtotal`, `taxAmount`,
  `invoiceForMonth` (the printed string, verbatim — the operator's selection is `period`, per
  INV-04) and `extractionRaw Json?` (figures + clarifications as returned, for audit).
- `ReconciliationStatus` gains `not_applicable`; invoice-first attaches set it, with
  `computedAmount` = the invoice's own service sub-total. Phase two flips this back to a real
  comparison (FEAT-101) with no schema change.
- `RepresentedCountChange` — new table: `circuitId`, `previousCount`, `nextCount`, `effectiveFrom`
  (a `YYYY-MM`), `reason`, `billingInvoiceId?`, `recordedById`, `recordedAt`. `Circuit.representedLightCount`
  is updated in the same transaction. Deliberately *not* a `BenchmarkRescaleEvent` and deliberately
  *not* replayed into earlier months: it is the population correction CON-47 d describes, and
  INV-07 is about something else.
- **The arithmetic lives in one pure module**, `src/lib/invoice-month.ts`: `deriveInvoiceMonth(parts,
  readingsByCircuit)` returns the fee lines with basis and provenance, reusing
  `monthly-calculation.ts`'s `contractedFeeForCircuit` and per-part proration rather than
  re-implementing them. Both the SCR-094 preview (a debounced server action) and the submit call
  it, so preview and record cannot disagree (FEAT-110-AC-4's "no write path accepts a figure").
- **Re-derivation** hooks at the two existing reading-commit convergence points
  (`meter-billing-handoff.ts` and the circuit page's `reading-actions.ts`, beside
  `syncCircuitBandAlert`): for each `(circuit, period)` touched, a live `invoice`-sourced month whose
  lines are `agreed` and whose readings now cover CON-12's floor gets a **new version** —
  `version + 1`, `supersededById` on the old — with `measured` lines. The new version **inherits
  `releasedAt`/`releasedById`** and records `rederivedAt`/`rederivedFromId`: the accountant reviewed
  the *bill*, which is unchanged; the stats are a computation with no human input, which is what
  CON-33 says needs no approval. It is logged (`billing.month_rederived`) and shown in the release
  queue as a non-blocking info row so the accountant sees it happened.
- **Paid status at upload** writes a `Payment` row (amount = invoice total, `paidAt` = the date given,
  `reference` = "recorded at upload") and stamps `paymentStatusConfirmedAt` in the same transaction,
  so the existing `arrears_sweep` excludes it by its own `status: { not: "paid" }` filter without a
  special case. An unpaid one is exactly a released invoice as today.
- **Extraction** extends `document-extract.ts` with an invoice schema (header, lines, totals,
  clarifications, verbatim words per figure) on the same Gemini path; `EXTRACTABLE_TYPES` gains
  `invoice`, and the document catalog's `invoice` type routes to SCR-093 rather than to generic
  filing. The prompt is told the two costliest mistakes: summing a hardware line into the service
  total, and reading the Discount column as part of the Rate.
- **S3 placement.** The society and month are not known when the bytes land, and this app's IAM
  user cannot copy or delete an object. So the browser PUTs to `Documents/_intake/{uuid}.pdf`; on
  submit the server GETs the object (GetObject works — verified 2026-08-14) and PUTs it under the
  canonical `Documents/{Society}/{YYYY-MM}/Invoices/…` key, which is the key `BillingInvoice.s3Key`
  records. The `_intake` object stays, undeletable, like every other object this app writes —
  listed under Current Blockers as the same class.

## Consequences

- One month-of-record, one fee-line grain, one release gate, one clock — invoice-first is a
  `source`, not a parallel system. Phase two's bill generation adds a value to an enum.
- Two new tables and a handful of nullable columns whose meaning depends on `source`/`basis`; the
  derive function and `runCalculation` are the only writers and must stay in step — a unit test
  asserts both produce the same `CircuitFeeLine` shape for a readings-covered month.
- A re-derived version is published without a human looking at it. Accepted on the reasoning above
  (stats only, bill untouched, no user input anywhere in the computation); if a re-derivation ever
  needs a gate, `releasedAt` is simply not inherited and the row lands in the queue — no schema
  change.
- The `_intake` prefix accumulates one undeletable object per upload in addition to the canonical
  copy. Same limitation as every verification pass in `PROJECT_CONTEXT.md`; the fix is the bucket
  lifecycle rule or the IAM change already listed there, not this design.

## Follow-ups

- Confirm on the real Zoho export that every service line carries HSN 998599 and every hardware line
  a different HSN — that is the classifier's first signal, with the description as the second.
- ASSUM-31's spike: run the extraction over all 19 societies' current invoices before build and
  count ambiguous line→circuit proposals.
