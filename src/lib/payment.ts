// Recording an invoice payment (2026-09-25, user-asked: TDS, cheque details
// and copies, UTR). Pure rules; the action is a thin shell.

export type PaymentMethod = "bank_transfer" | "upi" | "cheque" | "cash" | "other";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

/** A rupee of rounding: a settlement within ₹1 of the invoice is settled. */
export const SETTLE_TOLERANCE = 1;

/** What a payment settles: the money received plus the tax deducted at source. */
export function settles(p: { amount: number; tdsAmount?: number | null }): number {
  return p.amount + (p.tdsAmount ?? 0);
}

export function settledTotal(payments: Array<{ amount: number; tdsAmount?: number | null }>): number {
  return Math.round(payments.reduce((n, p) => n + settles(p), 0) * 100) / 100;
}

export function isSettled(invoiceAmount: number, payments: Array<{ amount: number; tdsAmount?: number | null }>): boolean {
  return settledTotal(payments) >= invoiceAmount - SETTLE_TOLERANCE;
}

/**
 * TDS from a rate: deducted on the invoice's value BEFORE GST (the usual
 * treatment — GST shown separately on the invoice is outside the TDS base),
 * rounded to the rupee as it appears on a TDS certificate.
 */
export function tdsFromRate(subtotalBeforeGst: number, ratePct: number): number {
  return Math.round((subtotalBeforeGst * ratePct) / 100);
}

export type PaymentInput = {
  amount: number;
  tdsAmount: number;
  method: PaymentMethod;
  utrNumber: string;
  chequeNumber: string;
  chequeDate: string;
  chequeBank: string;
};

/** Why a payment cannot be recorded as entered, or null. */
export function refusePayment(p: PaymentInput, outstanding: number): string | null {
  if (!Number.isFinite(p.amount) || p.amount < 0) return "The amount received must be a positive number.";
  if (!Number.isFinite(p.tdsAmount) || p.tdsAmount < 0) return "TDS must be zero or a positive amount.";
  if (p.amount + p.tdsAmount <= 0) return "Enter the amount received, the TDS deducted, or both.";
  if (p.amount + p.tdsAmount > outstanding + SETTLE_TOLERANCE)
    return `That settles ₹${(p.amount + p.tdsAmount).toLocaleString("en-IN")} against ₹${outstanding.toLocaleString("en-IN")} still outstanding — check the amounts.`;
  if (!(p.method in METHOD_LABEL)) return "Choose how it was paid.";
  if ((p.method === "bank_transfer" || p.method === "upi") && p.amount > 0 && !/^[A-Za-z0-9]{6,30}$/.test(p.utrNumber.trim()))
    return "Enter the UTR / transaction reference — letters and digits, as on the bank statement.";
  if (p.method === "cheque") {
    if (!/^\d{6}$/.test(p.chequeNumber.trim())) return "Enter the six-digit cheque number.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.chequeDate)) return "Enter the date on the cheque.";
    if (!p.chequeBank.trim()) return "Enter the bank the cheque is drawn on.";
  }
  return null;
}
