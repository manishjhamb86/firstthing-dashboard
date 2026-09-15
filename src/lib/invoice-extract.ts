/**
 * CON-47 / FEAT-109 — reading a Zoho tax invoice back into the system.
 *
 * Same shape and same reasoning as `document-extract.ts`: the model returns
 * VALUES here, each with the verbatim words it was read from and a
 * clarification wherever the paper does not settle something, because a tax
 * invoice is one page with a dozen printed figures a person checks on screen
 * before anything is stored. Nothing the model returns reaches a row until
 * the operator has confirmed it on SCR-094 (INV-04 for the month, and the
 * whole review for the rest).
 *
 * Written against two real invoices (2026-09-15) — FT/2026-27/055 (Aditya
 * Mega City, one line) and Aditya Urban Casa's August 2026 (two service
 * lines for two deals plus a ₹3,000 smart-meter line) — which is where the
 * prompt's two named hazards come from: Zoho prints a DISCOUNT column it uses
 * to round a line to whole rupees (736 × 31.66 − 2.76 = 23,299.00), and a
 * hardware line sits on the same table as the service lines with a different
 * HSN. Summing the hardware into the service total, or folding the discount
 * into the rate, each produces a plausible-looking wrong number.
 */

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.6-flash";

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export type Figure = { value: number | null; sourceText: string };
export type Text = { value: string; sourceText: string };

export type ExtractedInvoiceLine = {
  lineNo: number;
  /** Verbatim — the item name and its description together, as printed. */
  description: string;
  hsn: string;
  qty: Figure;
  rate: Figure;
  /** 0 when the column is blank or absent; Zoho prints it per line. */
  discount: Figure;
  taxPct: Figure;
  taxAmount: Figure;
  amount: Figure;
  /**
   * The model's PROPOSAL — service (an energy-saving fee: a light count at a
   * per-light rate, HSN 998599) or other (hardware, a meter, anything sold
   * as goods). The operator confirms; a wrong `service` would put a stat
   * behind a hardware line.
   */
  kindProposal: "service" | "other";
  sourceText: string;
};

export type ExtractedInvoice = {
  invoiceNumber: Text;
  /** YYYY-MM-DD, resolved from whatever format the invoice prints; "" when unreadable. */
  invoiceDate: Text;
  dueDate: Text;
  /** YYYY-MM resolved from "Invoice For The Month: July-2026"; "" when not printed. */
  invoiceForMonth: Text;
  billToName: Text;
  billToAddress: Text;
  billToGstin: Text;
  sellerName: Text;
  lines: ExtractedInvoiceLine[];
  subtotal: Figure;
  taxAmount: Figure;
  taxPct: Figure;
  total: Figure;
  balanceDue: Figure;
  clarifications: Array<{
    id: string;
    question: string;
    because: string;
    options: string[];
    sourceText: string;
  }>;
  notFound: string[];
  notes: string;
};

const FIGURE = {
  type: "object",
  properties: { value: { type: ["number", "null"] }, sourceText: { type: "string" } },
  required: ["value", "sourceText"],
};
const TEXT = {
  type: "object",
  properties: { value: { type: "string" }, sourceText: { type: "string" } },
  required: ["value", "sourceText"],
};

const SCHEMA = {
  type: "object",
  properties: {
    invoiceNumber: TEXT,
    invoiceDate: TEXT,
    dueDate: TEXT,
    invoiceForMonth: TEXT,
    billToName: TEXT,
    billToAddress: TEXT,
    billToGstin: TEXT,
    sellerName: TEXT,
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lineNo: { type: "integer" },
          description: { type: "string" },
          hsn: { type: "string" },
          qty: FIGURE,
          rate: FIGURE,
          discount: FIGURE,
          taxPct: FIGURE,
          taxAmount: FIGURE,
          amount: FIGURE,
          kindProposal: { type: "string", enum: ["service", "other"] },
          sourceText: { type: "string" },
        },
        required: ["lineNo", "description", "hsn", "qty", "rate", "discount", "taxPct", "taxAmount", "amount", "kindProposal", "sourceText"],
      },
    },
    subtotal: FIGURE,
    taxAmount: FIGURE,
    taxPct: FIGURE,
    total: FIGURE,
    balanceDue: FIGURE,
    clarifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          because: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          sourceText: { type: "string" },
        },
        required: ["id", "question", "because", "options", "sourceText"],
      },
    },
    notFound: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
  required: [
    "invoiceNumber", "invoiceDate", "dueDate", "invoiceForMonth", "billToName", "billToAddress", "billToGstin",
    "sellerName", "lines", "subtotal", "taxAmount", "taxPct", "total", "balanceDue", "clarifications", "notFound", "notes",
  ],
};

const PROMPT = `You are reading a TAX INVOICE issued by FirsThing (the seller — a
company that installs energy-saving lighting in residential societies and
bills each society a monthly fee) to one society (the buyer, under "Bill To").
The invoice was generated in Zoho Invoice. Read it back exactly as printed.

Rules:
1. Every figure carries "sourceText": the words on the page it was read from,
   verbatim. Every text field likewise. Never round, never reformat a number
   beyond removing thousands separators and the ₹ sign.
2. "lines" is one entry per row of the item table, in the printed order,
   "lineNo" as printed (1, 2, 3 …). "description" is the item name AND its
   description text together, verbatim. Read ALL of: Qty, Rate, Discount,
   the tax percentage and amount, and Amount — as separate figures. Zoho
   prints a DISCOUNT column and uses it to round a line to a whole rupee
   (736 × 31.66 − 2.76 = 23,299.00). Never fold the discount into the rate,
   and never omit it: Qty × Rate − Discount must reproduce Amount. If a
   column is blank, its value is 0 with the blank as sourceText.
3. "kindProposal": "service" for an energy-saving / performance-management
   fee line — a LIGHT COUNT as Qty at a per-light Rate, HSN/SAC 998599 —
   and "other" for goods (a smart meter, hardware, HSN starting 85, anything
   with "pcs" as the unit). A hardware line on the same table is the costliest
   thing to get wrong here: it must never be counted as a saving.
4. "invoiceForMonth": the month the invoice is FOR, as YYYY-MM, read from a
   field like "Invoice For The Month : July-2026" or from the line
   description "for the month of August 2026". If those disagree, return the
   field's value and raise a clarification. If neither exists, return "".
5. Dates as YYYY-MM-DD. Zoho prints DD/MM/YYYY on these invoices; read them
   that way. If a date is genuinely ambiguous, raise a clarification with
   both readings as options.
6. "billToName" is the buyer's name under "Bill To", verbatim, including its
   capitalisation. "billToGstin" the buyer's GSTIN if printed.
7. Totals: "subtotal" (Sub Total), "taxAmount" (the IGST or CGST+SGST total),
   "taxPct" (the rate, e.g. 18), "total", "balanceDue". Read them; do not
   compute them.
8. Put every genuine ambiguity in "clarifications" — something a careful
   reader would have to ask about — with a plain question, why it matters,
   the readings you can see, and the surrounding text. A credit note, a
   negative line, a second month named in a description, a Bill To that
   differs from the address block — those are clarifications. Do not raise
   one for something the invoice states plainly.
9. "notFound": the names of fields you could not find on the page.`;

export async function extractInvoice(params: { base64: string; mimeType: string }): Promise<ExtractedInvoice> {
  const interaction = await gemini().interactions.create({
    model: MODEL,
    input: [
      { type: "text", text: PROMPT },
      { type: "document", data: params.base64, mime_type: params.mimeType },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
  });
  if (!interaction.output_text) throw new Error("Gemini returned no output");
  return JSON.parse(interaction.output_text) as ExtractedInvoice;
}
