import { describe, expect, it } from "vitest";
import {
  arithmeticReport,
  classifyLine,
  isIsoDate,
  normaliseName,
  openItems,
  parseInvoiceMonth,
  proposeCircuit,
  proposeSociety,
  type Review,
} from "@/lib/invoice-intake";

describe("classifyLine — service vs other (FEAT-109-AC-5)", () => {
  it("reads the real lines the way the invoices print them", () => {
    expect(classifyLine({ hsn: "998599", description: "Energy Efficiency & Performance Management Service" })).toBe("service");
    expect(classifyLine({ hsn: "85351030", description: "Smart Meter\nSmart Energy Meter On Demo Circuit" })).toBe("other");
  });
  it("the HSN chapter settles goods before the wording does — a meter under 9405 is not a savings fee (user-caught 2026-09-16)", () => {
    expect(classifyLine({ hsn: "94054090", description: "Energy Efficiency services\nServices provided by FirsThing", qty: 1 })).toBe("other");
    expect(classifyLine({ hsn: "90283010", description: "Energy Efficiency services", qty: 1 })).toBe("other");
    // Chapter 99 is services whatever the wording.
    expect(classifyLine({ hsn: "998599", description: "Smart meter rental", qty: 1 })).toBe("service");
  });
  it("with no HSN, a quantity of one and no month named is a unit of something, not a light count", () => {
    expect(classifyLine({ hsn: "", description: "Energy Efficiency services", qty: 1 })).toBe("other");
    expect(classifyLine({ hsn: "", description: "Energy Saving charges for the month of July-2026", qty: 1 })).toBe("service");
    expect(classifyLine({ hsn: "", description: "Energy Efficiency services", qty: 605 })).toBe("service");
  });
  it("uses the description when the HSN is missing, and the proposal last", () => {
    expect(classifyLine({ hsn: "", description: "Energy Saving and Maintenance charges by FirsThing" })).toBe("service");
    expect(classifyLine({ hsn: "", description: "4G router, 1 pcs" })).toBe("other");
    expect(classifyLine({ hsn: "", description: "Miscellaneous", proposal: "other" })).toBe("other");
  });
});

describe("proposeCircuit — by light count (ASSUM-31)", () => {
  const circuits = [
    { circuitId: "b", label: "Basement", representedLightCount: 736, lightType: "basement" },
    { circuitId: "l", label: "Lift Lobby", representedLightCount: 1_153, lightType: "lift-lobby" },
  ];
  it("matches an exact count", () => {
    expect(proposeCircuit({ qty: 736, description: "…" }, circuits).circuitId).toBe("b");
  });
  it("matches the nearest within 2% — Urban Casa's 1,155 against 1,153", () => {
    const p = proposeCircuit({ qty: 1_155, description: "of Surface Light" }, circuits);
    expect(p.circuitId).toBe("l");
    expect(p.ambiguous).toBe(false);
    expect(p.why).toContain("1,153");
  });
  it("proposes nothing for a count no circuit is near", () => {
    const p = proposeCircuit({ qty: 300, description: "…" }, circuits);
    expect(p.circuitId).toBeNull();
    expect(p.ambiguous).toBe(false);
  });
  it("marks two identical counts ambiguous unless the description settles it", () => {
    const twins = [
      { circuitId: "a", label: "Tower A basement", representedLightCount: 500, lightType: "basement" },
      { circuitId: "c", label: "Tower C basement", representedLightCount: 500, lightType: "basement" },
    ];
    expect(proposeCircuit({ qty: 500, description: "for the month" }, twins).ambiguous).toBe(true);
    expect(proposeCircuit({ qty: 500, description: "Tower C basement lighting" }, twins).circuitId).toBe("c");
  });
});

describe("proposeSociety and normaliseName", () => {
  const societies = [
    { id: "amc", name: "Aditya Mega City" },
    { id: "auc", name: "Aditya Urban Casa" },
  ];
  it("matches the Bill To name case-insensitively", () => {
    expect(proposeSociety("ADITYA MEGA CITY", societies)?.id).toBe("amc");
  });
  it("ignores RWA/AOA suffixes but never guesses across a real difference", () => {
    expect(proposeSociety("Aditya Urban Casa RWA", societies)?.id).toBe("auc");
    expect(proposeSociety("Aditya", societies)).toBeNull();
  });
  it("normalises punctuation and spacing", () => {
    expect(normaliseName("Gaur Saundaryam  Apartment Owners Association")).toBe("gaur saundaryam");
  });
});

describe("parseInvoiceMonth", () => {
  it("reads Zoho's field and the description's phrasing", () => {
    expect(parseInvoiceMonth("July-2026")).toBe("2026-07");
    expect(parseInvoiceMonth("August 2026")).toBe("2026-08");
    expect(parseInvoiceMonth("Sep 2025")).toBe("2025-09");
    expect(parseInvoiceMonth("2026-07")).toBe("2026-07");
  });
  it("returns empty rather than a guess", () => {
    expect(parseInvoiceMonth("")).toBe("");
    expect(parseInvoiceMonth("monthly")).toBe("");
  });
});

const CLEAN: Review = {
  societyId: "amc",
  period: "2026-07",
  invoiceNumber: "FT/2026-27/055",
  invoiceDate: "2026-07-31",
  dueDate: "2026-08-10",
  lines: [
    { lineNo: 1, description: "Energy Efficiency & Performance Management Service", hsn: "998599", qty: 605, rate: 23.23, discount: 4.15, taxPct: 18, taxAmount: 2_529, amount: 14_050, kind: "service", circuitId: "ckt", applyCountForward: false },
  ],
  subtotal: 14_050,
  taxAmount: 2_529,
  taxPct: 18,
  total: 16_579,
  paid: "paid",
  paidOn: "2026-08-06",
  arithmeticAcknowledgement: "",
};

describe("openItems — FEAT-109's gates", () => {
  it("is empty for the real, fully confirmed invoice", () => {
    expect(openItems(CLEAN, { duplicateOf: null })).toEqual([]);
    expect(arithmeticReport(CLEAN).ok).toBe(true);
  });
  it("names an unconfirmed month and society (INV-04)", () => {
    const items = openItems({ ...CLEAN, societyId: null, period: "" }, { duplicateOf: null });
    expect(items).toContain("Society not confirmed (step 1)");
    expect(items).toContain("Month not confirmed (step 1)");
  });
  it("blocks a service line with no circuit (AC-10) and an invoice with no service line", () => {
    expect(openItems({ ...CLEAN, lines: [{ ...CLEAN.lines[0], circuitId: null }] }, { duplicateOf: null })).toContain("Line 1 has no circuit (step 2)");
    expect(openItems({ ...CLEAN, lines: [{ ...CLEAN.lines[0], kind: "other" }] }, { duplicateOf: null })).toContain("No service line — an invoice with no energy-saving line has nothing to derive (step 2)");
  });
  it("requires an acknowledgement when the arithmetic fails, and accepts one (AC-3)", () => {
    const bad = { ...CLEAN, lines: [{ ...CLEAN.lines[0], amount: 14_000 }], subtotal: 14_000, total: 16_520 };
    expect(openItems(bad, { duplicateOf: null })).toContain("The invoice's arithmetic does not reconcile — correct it or acknowledge why (steps 2–3)");
    expect(openItems({ ...bad, arithmeticAcknowledgement: "Zoho applied a manual credit on this line." }, { duplicateOf: null })).toEqual([]);
  });
  it("requires a payment choice, and a date when paid (AC-9)", () => {
    expect(openItems({ ...CLEAN, paid: null }, { duplicateOf: null })).toContain("Payment status not chosen (step 4)");
    expect(openItems({ ...CLEAN, paid: "paid", paidOn: "" }, { duplicateOf: null })).toContain("Paid-on date missing (step 4)");
    expect(openItems({ ...CLEAN, paid: "unpaid", paidOn: "" }, { duplicateOf: null })).toEqual([]);
  });
  it("names the live duplicate (AC-7)", () => {
    expect(openItems(CLEAN, { duplicateOf: { number: "FT/2026-27/041" } })).toContain("A live invoice already exists for this month (FT/2026-27/041) — void it first");
  });
});

describe("isIsoDate", () => {
  it("rejects a rolled-over calendar date", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-07-31")).toBe(true);
  });
});
