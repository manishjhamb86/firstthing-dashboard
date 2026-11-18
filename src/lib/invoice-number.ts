/**
 * A supplier's invoice number as compared (2026-11-18): case, spaces and the
 * slashes/dashes people type inconsistently do not make it a different
 * invoice. Used to recognise an uploaded invoice that was already received.
 */
export function normaliseInvoiceNumber(s: string): string {
  return s.trim().toUpperCase().replace(/[\s/\\_.-]+/g, "");
}
