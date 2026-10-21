import { db } from "@/lib/db";
import { paymentRating, type PaymentRating, type RatingInvoice } from "@/lib/payment-rating";

/**
 * Every live invoice that has reached a society — released, not voided —
 * grouped by society, in the shape the rating reads. An invoice the
 * accountant has not released is not something the society was asked to pay
 * yet, so it never counts against it.
 */
async function ratingInvoices(societyId?: string): Promise<Map<string, RatingInvoice[]>> {
  const rows = await db.billingInvoice.findMany({
    where: {
      voidedAt: null,
      calculation: { releasedAt: { not: null }, ...(societyId ? { societyId } : {}) },
    },
    select: {
      id: true,
      number: true,
      amount: true,
      dueDate: true,
      calculation: { select: { societyId: true } },
      extensions: { select: { days: true } },
      payments: { select: { amount: true, tdsAmount: true, confirmedAsOf: true } },
    },
  });
  const bySociety = new Map<string, RatingInvoice[]>();
  for (const r of rows) {
    const list = bySociety.get(r.calculation.societyId) ?? [];
    list.push({
      id: r.id,
      number: r.number,
      amount: r.amount,
      dueDate: r.dueDate,
      extensionDays: r.extensions.reduce((n, e) => n + e.days, 0),
      payments: r.payments,
    });
    bySociety.set(r.calculation.societyId, list);
  }
  return bySociety;
}

export async function societyPaymentRating(societyId: string, asOf = new Date()): Promise<PaymentRating> {
  const invoices = (await ratingInvoices(societyId)).get(societyId) ?? [];
  return paymentRating(invoices, asOf);
}

/** Ratings for every society that has a released invoice; others are absent. */
export async function allPaymentRatings(asOf = new Date()): Promise<Map<string, PaymentRating>> {
  const bySociety = await ratingInvoices();
  return new Map([...bySociety].map(([id, invoices]) => [id, paymentRating(invoices, asOf)]));
}

/** The rating of a society with no released invoice at all. */
export function emptyRating(asOf = new Date()): PaymentRating {
  return paymentRating([], asOf);
}
