/**
 * CON-47 / FEAT-109 — the decisions on the invoice review (SCR-094), pure.
 *
 * What the AI proposes and what the operator confirms are kept apart on
 * purpose: `propose*` turn an extraction into suggestions; `openItems`
 * decides whether the operator's CONFIRMED review can be submitted. The
 * proposals never become the record — the review does (INV-04 for the
 * month, and the same rule for everything else on the screen).
 */

import { checkLineArithmetic, checkTotalsArithmetic, type ArithmeticCheck, type TotalsCheck } from "./invoice-month";

export type LineKind = "service" | "other";

// ---------------------------------------------------------------------------
// Proposals — from the extraction, for the operator to confirm or change.
// ---------------------------------------------------------------------------

/**
 * A service line is an energy-saving fee: a light count at a per-light rate.
 * HSN/SAC 998599 is the first signal (every real service line carried it);
 * the description is the second; goods HSNs (85xx — meters, hardware) and a
 * "pcs" unit are the signals for `other`.
 */
export function classifyLine(input: { hsn: string; description: string; proposal?: LineKind | null }): LineKind {
  const hsn = input.hsn.replace(/\D/g, "");
  const desc = input.description.toLowerCase();
  if (hsn.startsWith("9985")) return "service";
  if (hsn.startsWith("85") || hsn.startsWith("84")) return "other";
  if (/\bmeter\b|\bhardware\b|\bdevice\b|\bpcs\b|\bsensor\b|\brouter\b/.test(desc)) return "other";
  if (/energy (saving|efficiency)|performance management|maintenance charges/.test(desc)) return "service";
  return input.proposal ?? "service";
}

export type CircuitOption = {
  circuitId: string;
  label: string;
  representedLightCount: number;
  lightType: string;
};

export type CircuitProposal = {
  circuitId: string | null;
  /** Why, in words the review can show beside the proposal. */
  why: string;
  /** More than one circuit fits the count — the operator must choose (ASSUM-31's failure case). */
  ambiguous: boolean;
};

/**
 * ASSUM-31 — a service line maps to a circuit by its light count. Exact
 * match on the represented count first; then the nearest within 2% (Urban
 * Casa's 1,155 against a recorded 1,153); the description is only a
 * tiebreaker between equally close candidates. Nothing matches → null, and
 * the operator picks.
 */
export function proposeCircuit(line: { qty: number | null; description: string }, circuits: CircuitOption[]): CircuitProposal {
  if (line.qty === null || circuits.length === 0) return { circuitId: null, why: "No light count to match on.", ambiguous: false };
  const exact = circuits.filter((c) => c.representedLightCount === line.qty);
  if (exact.length === 1) return { circuitId: exact[0].circuitId, why: `Matches ${exact[0].label}'s ${line.qty.toLocaleString("en-IN")} lights exactly.`, ambiguous: false };
  if (exact.length > 1) {
    const scored = exact.map((c) => ({ c, score: mentionScore(line.description, c) })).sort((a, b) => b.score - a.score);
    if (scored[0].score > 0 && scored[0].score > scored[1].score) {
      return { circuitId: scored[0].c.circuitId, why: `${exact.length} circuits record ${line.qty.toLocaleString("en-IN")} lights; the description names ${scored[0].c.label}.`, ambiguous: false };
    }
    return { circuitId: null, why: `${exact.length} circuits record ${line.qty.toLocaleString("en-IN")} lights — pick one.`, ambiguous: true };
  }
  const near = circuits
    .map((c) => ({ c, diff: Math.abs(c.representedLightCount - line.qty!) / Math.max(c.representedLightCount, 1) }))
    .filter((x) => x.diff <= 0.02)
    .sort((a, b) => a.diff - b.diff);
  if (near.length === 1 || (near.length > 1 && near[0].diff < near[1].diff)) {
    const hit = near[0].c;
    return {
      circuitId: hit.circuitId,
      why: `Nearest: ${hit.label} records ${hit.representedLightCount.toLocaleString("en-IN")} lights against ${line.qty.toLocaleString("en-IN")} billed.`,
      ambiguous: false,
    };
  }
  if (near.length > 1) return { circuitId: null, why: `${near.length} circuits are within 2% of ${line.qty.toLocaleString("en-IN")} lights — pick one.`, ambiguous: true };
  return { circuitId: null, why: `No circuit records a count near ${line.qty.toLocaleString("en-IN")} lights.`, ambiguous: false };
}

/** How many of the circuit's own label tokens the description contains as whole words — the tiebreaker only. */
function mentionScore(description: string, circuit: CircuitOption): number {
  const words = new Set(description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tokens = [circuit.label, circuit.lightType].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.filter((t) => words.has(t)).length;
}

export type SocietyOption = { id: string; name: string };

/** Exact match on a normalised name only — anything looser is the operator's call. */
export function proposeSociety(billToName: string, societies: SocietyOption[]): SocietyOption | null {
  const key = normaliseName(billToName);
  if (!key) return null;
  const hits = societies.filter((s) => normaliseName(s.name) === key);
  return hits.length === 1 ? hits[0] : null;
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(rwa|aoa|association|apartment owners|owners|society|welfare|residents?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "July-2026", "August 2026", "Jul 2026", "2026-07" → "2026-07"; "" when unreadable. */
export function parseInvoiceMonth(text: string): string {
  const t = text.trim().toLowerCase();
  const iso = t.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const m = t.match(/([a-z]{3,9})[\s\-\/,.]*(\d{4})/) ?? t.match(/(\d{4})[\s\-\/,.]*([a-z]{3,9})/);
  if (!m) return "";
  const [a, b] = /^\d{4}$/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  const idx = MONTHS.findIndex((name) => name.startsWith(a.slice(0, 3)));
  if (idx < 0) return "";
  return `${b}-${String(idx + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The review the operator confirms, and what still blocks submit.
// ---------------------------------------------------------------------------

export type ReviewLine = {
  lineNo: number;
  description: string;
  hsn: string;
  qty: number | null;
  rate: number | null;
  discount: number;
  taxPct: number | null;
  taxAmount: number | null;
  amount: number | null;
  kind: LineKind;
  circuitId: string | null;
  /** FEAT-109-AC-6 — apply this line's count to its circuit from this month onward. */
  applyCountForward: boolean;
};

export type Review = {
  societyId: string | null;
  period: string; // YYYY-MM or ""
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD or ""
  dueDate: string;
  lines: ReviewLine[];
  subtotal: number | null;
  taxAmount: number | null;
  taxPct: number | null;
  total: number | null;
  paid: "paid" | "unpaid" | null;
  paidOn: string; // YYYY-MM-DD when paid
  /** Required when any arithmetic check fails — the operator's stated reason. */
  arithmeticAcknowledgement: string;
};

export type ReviewContext = {
  /** A live invoice already holds this society-month. */
  duplicateOf: { number: string } | null;
};

export type ArithmeticReport = {
  lines: Array<{ lineNo: number; check: ArithmeticCheck }>;
  totals: TotalsCheck | null;
  ok: boolean;
};

export function arithmeticReport(review: Review): ArithmeticReport {
  const printed = review.lines
    .filter((l) => l.qty !== null && l.rate !== null && l.amount !== null)
    .map((l) => ({ lineNo: l.lineNo, qty: l.qty!, rate: l.rate!, discount: l.discount, amount: l.amount! }));
  const lines = printed.map((l) => ({ lineNo: l.lineNo, check: checkLineArithmetic(l) }));
  const totals =
    review.subtotal !== null && review.taxAmount !== null && review.total !== null
      ? checkTotalsArithmetic(printed, { subtotal: review.subtotal, taxAmount: review.taxAmount, total: review.total, taxPct: review.taxPct })
      : null;
  return { lines, totals, ok: lines.every((l) => l.check.ok) && (totals?.ok ?? true) };
}

/**
 * FEAT-109's gates, as the list SCR-094's submit bar shows. Empty means the
 * review can be submitted. The order is the order the cards appear in.
 */
export function openItems(review: Review, context: ReviewContext): string[] {
  const items: string[] = [];
  if (!review.societyId) items.push("Society not confirmed (step 1)");
  if (!/^\d{4}-\d{2}$/.test(review.period)) items.push("Month not confirmed (step 1)");
  if (!review.invoiceNumber.trim()) items.push("Invoice number missing (step 1)");
  if (!isIsoDate(review.invoiceDate)) items.push("Invoice date missing (step 1)");
  if (!isIsoDate(review.dueDate)) items.push("Due date missing (step 1)");
  if (context.duplicateOf) items.push(`A live invoice already exists for this month (${context.duplicateOf.number}) — void it first`);

  const service = review.lines.filter((l) => l.kind === "service");
  if (review.lines.length === 0) items.push("No lines — enter the invoice's lines (step 2)");
  if (review.lines.length > 0 && service.length === 0) items.push("No service line — an invoice with no energy-saving line has nothing to derive (step 2)");
  for (const l of service) {
    if (!l.circuitId) items.push(`Line ${l.lineNo} has no circuit (step 2)`);
    if (l.qty === null || !(l.qty > 0)) items.push(`Line ${l.lineNo} has no light count (step 2)`);
  }
  for (const l of review.lines) {
    if (l.amount === null) items.push(`Line ${l.lineNo} has no amount (step 2)`);
  }

  const arithmetic = arithmeticReport(review);
  if (!arithmetic.ok && !review.arithmeticAcknowledgement.trim()) {
    items.push("The invoice's arithmetic does not reconcile — correct it or acknowledge why (steps 2–3)");
  }
  if (review.total === null) items.push("Invoice total missing (step 3)");

  if (review.paid === null) items.push("Payment status not chosen (step 4)");
  if (review.paid === "paid" && !isIsoDate(review.paidOn)) items.push("Paid-on date missing (step 4)");

  return items;
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
