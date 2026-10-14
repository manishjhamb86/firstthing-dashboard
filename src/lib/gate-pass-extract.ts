/**
 * Reading a gate pass back for the generic documents upload (2026-10-14,
 * user-asked): read the society name and the date it was issued, so the
 * form can check them against whatever the operator already typed/chose
 * and warn on a mismatch — rather than silently trusting either side.
 *
 * Deliberately NOT routed through document-extract.ts's `extractDocument`
 * — that schema is built for the richer analytical documents (fixture
 * counts, wattages, revenue shares) a savings report or agreement carries,
 * none of which a gate pass has. Asking for all of that here would be
 * wasted work and wasted quota for two fields.
 */

import { GoogleGenAI } from "@google/genai";
import { withModelFallback, readWithOneRetry } from "./gemini-models";

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export type Text = { value: string; sourceText: string };

export type ExtractedGatePass = {
  /** The society's own name as printed on the form — NOT corrected against any list. */
  societyNameOnDocument: Text;
  /** YYYY-MM-DD, resolved from whatever format is printed; "" when unreadable. */
  date: Text;
  notes: string;
};

const TEXT = {
  type: "object",
  properties: { value: { type: "string" }, sourceText: { type: "string" } },
  required: ["value", "sourceText"],
};

const SCHEMA = {
  type: "object",
  properties: {
    societyNameOnDocument: TEXT,
    date: TEXT,
    notes: { type: "string" },
  },
  required: ["societyNameOnDocument", "date", "notes"],
};

const PROMPT = `You are reading a GATE PASS — a short form used to let an installation or
survey crew onto a residential society's premises in India, usually
handwritten or a simple printed form, sometimes a photo of it.

Read exactly two things:
1. The SOCIETY name printed or written on the form — the residential
   society/apartment complex being visited, verbatim, including whatever
   capitalisation and spelling it was written with. This is not FirsThing's
   own name; it is the society being visited.
2. The DATE the pass was issued/signed, resolved to YYYY-MM-DD. Indian forms
   are usually DD/MM/YYYY; read it that way unless something on the page says
   otherwise. If no date is legible at all, return "" for the date.

Rules:
- Every field carries "sourceText": the words on the page it was read from,
  verbatim. If you cannot point to text for a field, its value is "".
- Do not guess a society name from a logo or letterhead alone unless a name
  is actually written on the form — gate passes are usually handwritten, not
  stationery.
- "notes": one short sentence if anything about the reading is uncertain
  (poor handwriting, a smudged date), otherwise "".`;

export async function extractGatePass(params: { base64: string; mimeType: string }): Promise<ExtractedGatePass> {
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
    return JSON.parse(interaction.output_text) as ExtractedGatePass;
  });
}

export async function readGatePassWithRetry(bytes: Uint8Array, mimeType: string): Promise<ExtractedGatePass> {
  const base64 = Buffer.from(bytes).toString("base64");
  return readWithOneRetry(() => extractGatePass({ base64, mimeType }));
}

/**
 * Whether what was read disagrees with what the operator already chose.
 * Pure, so the rule is tested once rather than trusted by eye — a false
 * "mismatch" interrupts every single filing with a warning that means
 * nothing, and a missed one defeats the whole point of asking.
 *
 * A reading that could not be resolved to anything (no society match, no
 * legible date) is never itself a mismatch — there is nothing to compare,
 * and "the document could not be read" is not evidence the operator's
 * choice is wrong.
 */
export function gatePassMismatch(input: {
  matchedSocietyId: string | null;
  readDate: string;
  chosenSocietyId: string;
  chosenPeriod: string;
}): boolean {
  const societyMismatch = input.matchedSocietyId !== null && input.matchedSocietyId !== input.chosenSocietyId;
  const dateMismatch = input.readDate !== "" && input.readDate.slice(0, 7) !== input.chosenPeriod;
  return societyMismatch || dateMismatch;
}
