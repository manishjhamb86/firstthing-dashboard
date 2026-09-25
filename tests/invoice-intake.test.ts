import { describe, expect, it } from "vitest";
import {
  allocateLine,
  arithmeticReport,
  lineAllocations,
  refuseSplit,
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
  nonServiceInvoice: false,
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
  // 2026-09-24, user-caught: a real second bill for the same society-month
  // (devices, installation) is not competing for the savings slot, so it
  // must not be refused as a duplicate of it, nor for having no service line.
  it("bypasses the duplicate and no-service-line refusals once flagged non-service", () => {
    const devicesInvoice = { ...CLEAN, lines: [{ ...CLEAN.lines[0], kind: "other" as const, circuitId: null }], nonServiceInvoice: true };
    expect(openItems(devicesInvoice, { duplicateOf: { number: "FT/2026-27/004" } })).toEqual([]);
  });
  it("still refuses a non-service invoice that carries a service line", () => {
    expect(openItems({ ...CLEAN, nonServiceInvoice: true }, { duplicateOf: null })).toContain(
      'Line 1 is marked "Service" — mark every line "Other", or un-check "not an energy-savings invoice" (step 2)',
    );
  });
  it("still requires the ordinary fields on a non-service invoice", () => {
    const noMonth = { ...CLEAN, period: "", nonServiceInvoice: true, lines: [{ ...CLEAN.lines[0], kind: "other" as const, circuitId: null }] };
    expect(openItems(noMonth, { duplicateOf: null })).toContain("Month not confirmed (step 1)");
  });
});

describe("isIsoDate", () => {
  it("rejects a rolled-over calendar date", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-07-31")).toBe(true);
  });
});

describe("FEAT-109-AC-11 — one invoice line billing two circuits of one type", () => {
  const towers = [
    { circuitId: "lla", label: "Lift Lobby A–D", representedLightCount: 1_786, lightType: "lift-lobby" },
    { circuitId: "lle", label: "Lift Lobby E", representedLightCount: 466, lightType: "lift-lobby" },
    { circuitId: "b", label: "Basement", representedLightCount: 1_444, lightType: "basement" },
  ];
  const line = { lineNo: 2, qty: 2_252, amount: 44_480.16, circuitId: null, applyCountForward: false };

  it("proposes the pair whose counts add up to the billed count (the user's own 2,252)", () => {
    const p = proposeCircuit({ qty: 2_252, description: "Energy Saving … of Surface Light" }, towers);
    expect(p.circuitId).toBeNull();
    expect(p.split).toEqual(["lla", "lle"]);
    expect(p.why).toMatch(/1,786.*466.*2,252/);
  });

  it("does not pair circuits of different types", () => {
    // 1,786 + 1,444 = 3,230 but lift lobby + basement is not one line's population.
    expect(proposeCircuit({ qty: 3_230, description: "" }, towers).split).toBeUndefined();
  });

  it("refuses a split that does not add up, names every gap, and passes one that does", () => {
    expect(refuseSplit({ ...line, split: [{ circuitId: "lla", lights: 1_786, applyCountForward: false }, { circuitId: "lle", lights: 400, applyCountForward: false }] })).toMatch(/1,786 \+ 400 = 2,186\) does not add to the 2,252/);
    expect(refuseSplit({ ...line, split: [{ circuitId: "lla", lights: 1_786, applyCountForward: false }, { circuitId: "", lights: 466, applyCountForward: false }] })).toMatch(/choose every circuit/);
    expect(refuseSplit({ ...line, split: [{ circuitId: "lla", lights: 1_786, applyCountForward: false }, { circuitId: "lla", lights: 466, applyCountForward: false }] })).toMatch(/same circuit twice/);
    expect(refuseSplit({ ...line, split: [{ circuitId: "lla", lights: null, applyCountForward: false }, { circuitId: "lle", lights: 466, applyCountForward: false }] })).toMatch(/how many of its lights/);
    expect(refuseSplit({ ...line, split: [{ circuitId: "lla", lights: 1_786, applyCountForward: false }, { circuitId: "lle", lights: 466, applyCountForward: false }] })).toBeNull();
    expect(refuseSplit({ ...line, split: undefined })).toBeNull();
  });

  it("shares the line's amount by lights, to the paisa, the parts adding back to the printed amount exactly", () => {
    const parts = allocateLine({ ...line, split: [{ circuitId: "lla", lights: 1_786, applyCountForward: false }, { circuitId: "lle", lights: 466, applyCountForward: false }] });
    expect(parts.map((p) => p.lightsBilled)).toEqual([1_786, 466]);
    expect(parts[0].amount).toBeCloseTo(44_480.16 * (1_786 / 2_252), 2);
    expect(parts[0].amount + parts[1].amount).toBeCloseTo(44_480.16, 10);
    expect(parts.every((p) => p.lineNo === 2)).toBe(true);
  });

  it("a single-circuit line is one allocation carrying the whole quantity and amount", () => {
    expect(allocateLine({ ...line, circuitId: "b" })).toEqual([{ lineNo: 2, circuitId: "b", lightsBilled: 2_252, amount: 44_480.16 }]);
    expect(lineAllocations({ ...line, circuitId: "b" })).toEqual([{ circuitId: "b", lights: 2_252, applyCountForward: false }]);
  });

  it("openItems carries the split's gap and refuses one circuit on two lines", () => {
    const split = { ...CLEAN.lines[0], circuitId: null, split: [{ circuitId: "ckt", lights: 400, applyCountForward: false }, { circuitId: "ckt2", lights: 200, applyCountForward: false }] };
    expect(openItems({ ...CLEAN, lines: [split] }, { duplicateOf: null })).toContain("Line 1: the split across its circuits (400 + 200 = 600) does not add to the 605 billed (step 2)");
    const twice = [CLEAN.lines[0], { ...CLEAN.lines[0], lineNo: 2 }];
    expect(openItems({ ...CLEAN, lines: twice }, { duplicateOf: null })).toContain("Lines 1 and 2 both bill the same circuit (step 2)");
  });
});

describe("openItems — the same invoice number already on record", () => {
  it("blocks even a flagged non-service bill, and says it is a second copy", () => {
    const items = openItems({ ...CLEAN, nonServiceInvoice: true }, { duplicateOf: { number: "FT/2026-27/055", sameNumber: true } });
    expect(items.some((i) => i.includes("second copy"))).toBe(true);
  });
});

describe("openItems — a retail sale", () => {
  it("needs a retail customer instead of a society, and no circuit", () => {
    const retail = { ...CLEAN, societyId: null, retailSale: true, retailCustomerId: null, lines: CLEAN.lines.map((l) => ({ ...l, circuitId: null })) };
    const items = openItems(retail, { duplicateOf: null });
    expect(items).toContain("Retail customer not chosen (step 1)");
    expect(items.some((i) => /Society not confirmed|no circuit/.test(i))).toBe(false);
    expect(openItems({ ...retail, retailCustomerId: "rc1" }, { duplicateOf: null })).toEqual([]);
  });
});
