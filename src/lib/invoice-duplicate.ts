// When is an uploaded invoice a duplicate of one already on record?
// Shared by the read (invoice-intake-extract.ts) and the review's save
// (intake actions) so a duplicate is refused the moment the invoice is read,
// not only after somebody opens and saves it (user-reported 2026-09-25:
// FT/2026-27/055 sat in "Needs review" beside its own submitted copy — the
// second PDF was a different file, so the byte fingerprint did not match).
//
// Two rules, checked in this order:
//  1. The same invoice NUMBER is already a live invoice — always the same
//     bill, whatever month the reader thought it was for, and whether or not
//     it is flagged as a non-service bill.
//  2. The society-month already holds its live savings invoice — a second
//     savings bill for one month (a flagged non-service bill is exempt).

import { db } from "@/lib/db";

export type InvoiceDuplicate = { number: string; released: boolean; sameNumber: boolean };

export async function findDuplicateInvoice(input: {
  societyId: string | null;
  period: string;
  invoiceNumber: string;
  serviceLine: "lighting";
}): Promise<InvoiceDuplicate | null> {
  const number = input.invoiceNumber.trim();
  if (number) {
    const same = await db.billingInvoice.findFirst({
      where: { number: { equals: number, mode: "insensitive" }, voidedAt: null },
      select: { number: true, calculation: { select: { status: true } } },
    });
    if (same) return { number: same.number, released: same.calculation.status === "released", sameNumber: true };
    // A retail sale carries an invoice number from the same Zoho series.
    const retail = await db.retailInvoice.findFirst({
      where: { invoiceNumber: { equals: number, mode: "insensitive" }, voidedAt: null },
      select: { invoiceNumber: true },
    });
    if (retail) return { number: retail.invoiceNumber, released: false, sameNumber: true };
  }
  if (!input.societyId || !/^\d{4}-\d{2}$/.test(input.period)) return null;
  const calc = await db.monthlyCalculation.findFirst({
    where: { societyId: input.societyId, serviceLine: input.serviceLine, period: input.period, status: { notIn: ["superseded"] } },
    include: { invoices: { where: { voidedAt: null }, select: { number: true }, take: 1 } },
    orderBy: { version: "desc" },
  });
  const inv = calc?.invoices[0];
  return inv ? { number: inv.number, released: calc!.status === "released", sameNumber: false } : null;
}

/** Whether a found duplicate refuses this review: a same-number match always does. */
export function duplicateRefuses(dup: InvoiceDuplicate | null, nonServiceInvoice: boolean): boolean {
  return !!dup && (dup.sameNumber || !nonServiceInvoice);
}
