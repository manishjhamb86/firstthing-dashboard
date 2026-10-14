/**
 * Reading a SUPPLIER's purchase invoice back for Receive stock (2026-10-14,
 * user-asked: "Stock lines should auto populate on invoice upload"). Same
 * shape and reasoning as invoice-extract.ts: the model returns VALUES, each
 * with the verbatim words it was read from, because a purchase invoice is
 * one page with a handful of printed figures a person checks on screen
 * before anything is saved — nothing here writes a row on its own, it only
 * pre-fills the Receive stock form.
 *
 * Deliberately a DIFFERENT schema from invoice-extract.ts's Zoho reader,
 * not a shared one: that reader is FirsThing's OWN sales invoice format
 * (a fixed "Bill To"/"energy-saving fee" shape); this one is an arbitrary
 * supplier's purchase invoice, where the seller is at the top (not under
 * "Bill To") and the only things Receive stock needs are the seller, the
 * invoice's own number/date/total, and each line's item, quantity, rate
 * and amount — a supplier lot/batch number when the invoice happens to
 * print one.
 */

import { GoogleGenAI } from "@google/genai";
import { withModelFallback, readWithOneRetry } from "./gemini-models";

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export type Figure = { value: number | null; sourceText: string };
export type Text = { value: string; sourceText: string };

export type ExtractedSupplierInvoiceLine = {
  lineNo: number;
  /** Verbatim — the item name and its description together, as printed. */
  description: Text;
  hsn: Text;
  qty: Figure;
  rate: Figure;
  amount: Figure;
  /** A lot/batch/serial-range note, when the invoice prints one for this line; "" otherwise. */
  supplierLot: Text;
};

export type ExtractedSupplierInvoice = {
  /** The seller — at the top of the invoice, NOT "Bill To" (that is FirsThing, the buyer). */
  sellerName: Text;
  invoiceNumber: Text;
  /** YYYY-MM-DD, resolved from whatever format the invoice prints; "" when unreadable. */
  invoiceDate: Text;
  lines: ExtractedSupplierInvoiceLine[];
  total: Figure;
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
    sellerName: TEXT,
    invoiceNumber: TEXT,
    invoiceDate: TEXT,
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lineNo: { type: "integer" },
          description: TEXT,
          hsn: TEXT,
          qty: FIGURE,
          rate: FIGURE,
          amount: FIGURE,
          supplierLot: TEXT,
        },
        required: ["lineNo", "description", "hsn", "qty", "rate", "amount", "supplierLot"],
      },
    },
    total: FIGURE,
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
  required: ["sellerName", "invoiceNumber", "invoiceDate", "lines", "total", "clarifications", "notFound", "notes"],
};

const PROMPT = `You are reading a PURCHASE INVOICE issued BY A SUPPLIER TO FirsThing
(FirsThing is the BUYER here — the company receiving goods, usually printed
under "Bill To" or "Ship To"; the SUPPLIER is the seller, printed at the top
of the invoice in its own letterhead). This is the opposite direction from a
sales invoice — read the SELLER's name, not the buyer's.

Rules:
1. Every figure carries "sourceText": the words on the page it was read
   from, verbatim. Every text field likewise. Never round, never reformat a
   number beyond removing thousands separators and the ₹/Rs sign.
2. "lines" is one entry per row of the item table, in the printed order,
   "lineNo" as printed (or its own position, 1, 2, 3… if the table has no
   printed serial number). "description" is the item name and its
   description together, verbatim. Read Qty, Rate and Amount as separate
   figures — never assume Qty × Rate equals Amount, read what is printed.
3. "supplierLot": a lot number, batch number, or serial-number RANGE printed
   for that line (electronics and hardware invoices sometimes print one
   alongside the quantity) — "" when the invoice does not print one for
   that line. Never invent one.
4. "invoiceDate" as YYYY-MM-DD. If the invoice prints DD/MM/YYYY, read it
   that way; if genuinely ambiguous (e.g. 03/04/2026 with no other evidence
   of format), raise a clarification with both readings as options.
5. "total": the invoice's own grand total (after tax, the amount actually
   payable) — read it, do not compute it.
6. Put every genuine ambiguity in "clarifications" — something a careful
   reader would have to ask about — with a plain question, why it matters,
   the readings you can see, and the surrounding text. Do not raise one for
   something the invoice states plainly.
7. "notFound": the names of fields you could not find on the page.`;

export async function extractSupplierInvoice(params: { base64: string; mimeType: string }): Promise<ExtractedSupplierInvoice> {
  return withModelFallback(async (model) => {
    const interaction = await gemini().interactions.create({
      model,
      input: [
        { type: "text", text: PROMPT },
        { type: "document", data: params.base64, mime_type: params.mimeType },
      ],
      response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
    });
    if (!interaction.output_text) throw new Error("Gemini returned no output");
    return JSON.parse(interaction.output_text) as ExtractedSupplierInvoice;
  });
}

/** One automatic retry on a rate limit — same reasoning as the Zoho reader. */
export async function readSupplierInvoiceWithRetry(bytes: Uint8Array): Promise<ExtractedSupplierInvoice> {
  const base64 = Buffer.from(bytes).toString("base64");
  return readWithOneRetry(() => extractSupplierInvoice({ base64, mimeType: "application/pdf" }));
}

/** Google's rate-limit reply is a paragraph with a URL in it; the form needs a sentence. */
export function friendlySupplierExtractionError(raw: string): string {
  if (/429|RESOURCE_EXHAUSTED|too_many_requests|quota/i.test(raw)) {
    return "The document reader refused on every model it can use. Wait a minute and try again, or enter the lines by hand.";
  }
  if (/GEMINI_API_KEY/.test(raw)) return "The document reader is not configured on this server — enter the lines by hand.";
  return "The invoice could not be read automatically — enter the lines by hand.";
}
