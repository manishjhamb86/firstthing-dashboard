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
