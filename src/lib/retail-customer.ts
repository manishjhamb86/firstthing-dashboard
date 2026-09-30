// Retail customers (2026-09-25): who FirsThing sells items to directly,
// society or not. Pure rules — the actions are thin shells around them.

export type RetailCustomerInput = { name: string; gstin: string; address: string; phone: string; email: string };

/** The duplicate key: case, punctuation and spacing do not make a new customer. */
export function retailNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normaliseGstin(gstin: string): string | null {
  const v = gstin.trim().toUpperCase().replace(/\s+/g, "");
  return v ? v : null;
}

/** Why a customer cannot be saved as entered, or null. */
export function refuseRetailCustomer(input: RetailCustomerInput): string | null {
  if (!retailNameKey(input.name)) return "Enter the customer's name.";
  const gstin = normaliseGstin(input.gstin);
  if (gstin && !GSTIN.test(gstin)) return `"${gstin}" is not a GSTIN — 15 characters, e.g. 06AADAP0184A1Z3. Leave it blank if they have none.`;
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "That email address does not look right.";
  return null;
}

/**
 * The existing customer an invoice's bill-to names, if any: the GSTIN first
 * (it identifies a business outright), then the normalised name.
 */
export function matchRetailCustomer(
  billTo: { name: string; gstin: string },
  customers: Array<{ id: string; nameKey: string; gstin: string | null }>,
): string | null {
  const gstin = normaliseGstin(billTo.gstin);
  if (gstin) {
    const byGstin = customers.find((c) => c.gstin === gstin);
    if (byGstin) return byGstin.id;
  }
  const key = retailNameKey(billTo.name);
  if (!key) return null;
  return customers.find((c) => c.nameKey === key)?.id ?? null;
}

// ---------------------------------------------------------------------------
// An invoice entered by hand on the customer's own page (2026-09-30), and a
// payment recorded against one. A retail sale is a one-off — no recurring
// subscription and no CON-13 arrears clock — so what "settled" means here is
// simply: has the money that was owed actually arrived.
// ---------------------------------------------------------------------------

export type RetailInvoiceInput = {
  invoiceNumber: string;
  period: string;
  total: string;
  subtotal: string;
  taxAmount: string;
};

/** Why a hand-entered invoice cannot be saved, or null. */
export function refuseRetailInvoice(input: RetailInvoiceInput): string | null {
  if (!input.invoiceNumber.trim()) return "Enter the invoice number.";
  if (!/^\d{4}-\d{2}$/.test(input.period)) return "Choose the month this invoice is for.";
  const total = Number(input.total);
  if (!Number.isFinite(total) || total <= 0) return "Enter the invoice total.";
  if (input.subtotal.trim()) {
    const subtotal = Number(input.subtotal);
    if (!Number.isFinite(subtotal) || subtotal < 0) return "The subtotal does not look right.";
  }
  if (input.taxAmount.trim()) {
    const tax = Number(input.taxAmount);
    if (!Number.isFinite(tax) || tax < 0) return "The tax amount does not look right.";
  }
  return null;
}

export type RetailPaymentInput = { amount: string; paidOn: string };

/** Why a payment cannot be recorded, or null. */
export function refuseRetailPayment(input: RetailPaymentInput, outstanding: number): string | null {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter how much was received.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return "Enter the date it was received.";
  if (amount > outstanding + 0.5) {
    return `That is more than the ₹${outstanding.toFixed(2)} still outstanding on this invoice.`;
  }
  return null;
}

/** What has actually been received against an invoice — the payment ledger, plus any advance recorded before it existed. */
export function retailInvoicePaidTotal(
  invoice: { advanceAmount: number | null },
  payments: Array<{ amount: number }>,
): number {
  const fromAdvance = payments.length === 0 ? (invoice.advanceAmount ?? 0) : 0;
  return payments.reduce((n, p) => n + p.amount, fromAdvance);
}

/** Settled once what has been received covers the total, to the paisa. */
export function retailInvoiceSettled(
  invoice: { total: number; advanceAmount: number | null },
  payments: Array<{ amount: number }>,
): boolean {
  return retailInvoicePaidTotal(invoice, payments) >= invoice.total - 0.5;
}

/** Where a retail invoice's own file lives — one shared key so intake and a
 *  hand-entered invoice can never disagree on the convention. Public, like
 *  every other filed document (Documents/, not the private Ingest/ tree). */
export function retailInvoiceKey(input: { customerName: string; period: string; invoiceNumber: string; extension: string }): string {
  const slug = input.customerName.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Customer";
  const ident = (input.invoiceNumber.trim() || "invoice").replace(/[^a-zA-Z0-9-]+/g, "_");
  return `Documents/Retail/${slug}/${input.period}/${slug}_RetailInvoice_${ident}.${input.extension}`;
}
