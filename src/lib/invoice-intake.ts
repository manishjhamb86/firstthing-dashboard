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
export function classifyLine(input: { hsn: string; description: string; proposal?: LineKind | null; qty?: number | null }): LineKind {
  const hsn = input.hsn.replace(/\D/g, "");
  const desc = input.description.toLowerCase();
  // The HSN is the tax code the invoice was raised under, and it settles goods
  // versus services before any wording does: chapter 99 is services; 84
  // (machinery), 85 (electrical), 90 (meters and instruments) and 94 (lamps
  // and lighting fittings) are goods. A smart meter billed under 9405 with the
  // description "Energy Efficiency services" is a goods line (user-caught
  // 2026-09-16) — the wording alone read it as a savings fee.
  if (hsn.startsWith("99")) return "service";
  if (/^(84|85|90|94)/.test(hsn)) return "other";
  if (/\bmeter\b|\bhardware\b|\bdevice\b|\bpcs\b|\bsensor\b|\brouter\b/.test(desc)) return "other";
  if (/energy (saving|efficiency)|performance management|maintenance charges/.test(desc)) {
    // A savings fee is priced per light for a month; a quantity of one with
    // no month named is a unit of something, not a light count.
    if (input.qty != null && input.qty <= 1 && !/month|\b20\d\d\b/.test(desc)) return "other";
    return "service";
  }
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
  /** Two circuits of one type whose counts add up to the billed count — one line billing both. */
  split?: string[];
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
  // One line, two circuits: Zoho bills "all lift-lobby lights" as one line
  // while the record holds a circuit per tower (user, 2026-09-16). A pair of
  // the same light type whose counts add up exactly is proposed as a split.
  const pairs: [CircuitOption, CircuitOption][] = [];
  for (let i = 0; i < circuits.length; i++) {
    for (let j = i + 1; j < circuits.length; j++) {
      const a = circuits[i];
      const b = circuits[j];
      if (a.lightType === b.lightType && a.representedLightCount + b.representedLightCount === line.qty) pairs.push([a, b]);
    }
  }
  if (pairs.length === 1) {
    const [a, b] = pairs[0];
    return {
      circuitId: null,
      split: [a.circuitId, b.circuitId],
      why: `${a.label} (${a.representedLightCount.toLocaleString("en-IN")}) and ${b.label} (${b.representedLightCount.toLocaleString("en-IN")}) add up to the ${line.qty.toLocaleString("en-IN")} billed — one line, both circuits.`,
      ambiguous: false,
    };
  }
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
  /**
   * FEAT-109-AC-11 — one line billing SEVERAL circuits of one type ("all
   * basement lights" on the bill, a circuit per tower on the record). With
   * two or more entries this governs and `circuitId` is ignored: each entry
   * says how many of the billed lights sit on that circuit, and they must
   * add up to the line's quantity. Absent or shorter → the single circuit.
   */
  split?: LineSplitEntry[];
};

export type LineSplitEntry = {
  circuitId: string;
  /** This circuit's share of the billed lights — null until typed. */
  lights: number | null;
  applyCountForward: boolean;
};

/** One entry per circuit the line bills — the single circuit, or the split. */
export type LineAllocation = { circuitId: string; lights: number | null; applyCountForward: boolean };

export function lineAllocations(l: Pick<ReviewLine, "circuitId" | "qty" | "applyCountForward" | "split">): LineAllocation[] {
  if (l.split && l.split.length >= 2) return l.split;
  return l.circuitId ? [{ circuitId: l.circuitId, lights: l.qty, applyCountForward: l.applyCountForward }] : [];
}

/** Why a split cannot stand yet, in the words the open-items list shows. Null when it can. */
export function refuseSplit(l: Pick<ReviewLine, "lineNo" | "qty" | "split">): string | null {
  const split = l.split ?? [];
  if (split.length < 2) return null;
  if (split.some((e) => !e.circuitId)) return `Line ${l.lineNo}: choose every circuit in its split (step 2)`;
  if (new Set(split.map((e) => e.circuitId)).size !== split.length) return `Line ${l.lineNo} names the same circuit twice (step 2)`;
  if (split.some((e) => e.lights === null || !Number.isInteger(e.lights) || e.lights! < 1)) {
    return `Line ${l.lineNo}: say how many of its lights sit on each circuit (step 2)`;
  }
  const sum = split.reduce((s, e) => s + (e.lights ?? 0), 0);
  if (l.qty !== null && sum !== l.qty) {
    return `Line ${l.lineNo}: the split across its circuits (${split.map((e) => e.lights!.toLocaleString("en-IN")).join(" + ")} = ${sum.toLocaleString("en-IN")}) does not add to the ${l.qty.toLocaleString("en-IN")} billed (step 2)`;
  }
  return null;
}

/**
 * The line's amount shared across its circuits in proportion to the lights
 * on each, to the paisa, the last circuit taking the rounding remainder so
 * the parts add back to the printed amount exactly (INV-02: the fee lines
 * must sum to the invoice line).
 */
export function allocateLine(l: Pick<ReviewLine, "lineNo" | "qty" | "amount" | "circuitId" | "applyCountForward" | "split">): { lineNo: number; circuitId: string; lightsBilled: number; amount: number }[] {
  if (l.qty === null || l.amount === null || !(l.qty > 0)) return [];
  const allocs = lineAllocations(l).filter((a) => a.circuitId && a.lights !== null && a.lights > 0);
  if (allocs.length === 0) return [];
  if (allocs.length === 1) return [{ lineNo: l.lineNo, circuitId: allocs[0].circuitId, lightsBilled: allocs[0].lights!, amount: l.amount }];
  const out: { lineNo: number; circuitId: string; lightsBilled: number; amount: number }[] = [];
  let remaining = l.amount;
  allocs.forEach((a, i) => {
    const amount = i === allocs.length - 1 ? Math.round(remaining * 100) / 100 : Math.round((l.amount! * (a.lights! / l.qty!)) * 100) / 100;
    remaining -= amount;
    out.push({ lineNo: l.lineNo, circuitId: a.circuitId, lightsBilled: a.lights!, amount });
  });
  return out;
}

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
  /**
   * A second, real bill for the same society-month that is not the
   * recurring energy-savings share — a devices/hardware invoice, a one-off
   * charge (user-caught 2026-09-24: "the society was raised 2 bills for
   * that month... its not part of the companies share as per agreement").
   * Same invoice number AND total can legitimately repeat across two
   * unrelated bills, so a duplicate is a judgement the operator states, not
   * one the system infers from matching figures. Flagging it here — rather
   * than silently treating "no service line" as evidence of a duplicate —
   * routes it through `fileNonServiceInvoice` instead of `submitIntake`:
   * filed as its own document, never fed into any month's savings figure.
   */
  nonServiceInvoice: boolean;
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
  // Both checks assume this invoice is trying to BE the month's savings
  // record — neither applies once the operator has said it is a separate,
  // non-service bill (a devices/hardware charge) instead.
  if (context.duplicateOf && !review.nonServiceInvoice) items.push(`A live invoice already exists for this month (${context.duplicateOf.number}) — void it first`);

  const service = review.lines.filter((l) => l.kind === "service");
  if (review.lines.length === 0) items.push("No lines — enter the invoice's lines (step 2)");
  if (review.lines.length > 0 && service.length === 0 && !review.nonServiceInvoice)
    items.push("No service line — an invoice with no energy-saving line has nothing to derive (step 2)");
  if (review.nonServiceInvoice && service.length > 0)
    items.push(`Line ${service[0].lineNo} is marked "Service" — mark every line "Other", or un-check "not an energy-savings invoice" (step 2)`);
  const seen = new Map<string, number>();
  for (const l of service) {
    const allocs = lineAllocations(l);
    if (allocs.length === 0) items.push(`Line ${l.lineNo} has no circuit (step 2)`);
    if (l.qty === null || !(l.qty > 0)) items.push(`Line ${l.lineNo} has no light count (step 2)`);
    const split = refuseSplit(l);
    if (split) items.push(split);
    // A circuit bills once a month: two lines on one circuit would be two
    // fee lines for one billing grain (CON-11).
    for (const a of allocs) {
      if (!a.circuitId) continue;
      const prior = seen.get(a.circuitId);
      if (prior !== undefined && prior !== l.lineNo) items.push(`Lines ${prior} and ${l.lineNo} both bill the same circuit (step 2)`);
      seen.set(a.circuitId, l.lineNo);
    }
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
