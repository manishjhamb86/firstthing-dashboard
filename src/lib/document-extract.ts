import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.6-flash";

/**
 * Reading the figures out of a historical report.
 *
 * This deliberately does what `inferStructure` refuses to do — it lets the
 * model return VALUES — and the reason the two differ is the shape of the
 * artefact, not a change of mind. A meter CSV is ~720 rows a month across
 * hundreds of circuits: too much to send, too much to check, and INV-02
 * needs the transform replayable, so there the model only proposes a mapping.
 * A savings report is one document with a handful of printed figures that a
 * person can verify on screen in seconds — the same shape the archived
 * invoice extraction handled, and the same shape it was judged safe for.
 *
 * Three rules make it safe here, and all three are enforced by the schema
 * rather than by the prompt alone:
 *
 *  1. **Every figure is nullable and the model is told to leave it null
 *     rather than guess.** A missing number the operator can fill in beats a
 *     plausible one nobody checks.
 *  2. **Every figure carries the verbatim text it came from.** The reviewer
 *     checks a number against the words beside it instead of hunting through
 *     the PDF, which is what makes the review real rather than a rubber
 *     stamp.
 *  3. **Nothing is written until a human confirms it.** The result is a
 *     proposal; `confirmDocumentExtraction` is the only path to a stored
 *     figure, and even then it is stored as "read from this document",
 *     pointing at the scan — never merged into the reading store a bill is
 *     computed from, whose grain (a day, traceable to a raw file) a monthly
 *     printed total cannot satisfy.
 */
export type ExtractedFigure = {
  value: number | null;
  /** The words on the page this was read from — the reviewer's check. */
  sourceText: string;
};

export type ExtractedReport = {
  societyNameOnDocument: string;
  areaOrCircuit: string;
  periodStart: string; // YYYY-MM-DD, or "" when the document does not say
  periodEnd: string;
  lightCount: ExtractedFigure;
  wattagePerLight: ExtractedFigure;
  consumptionBeforeKwh: ExtractedFigure;
  consumptionAfterKwh: ExtractedFigure;
  savingsPct: ExtractedFigure;
  /** Anything the model could not find, named — so gaps are visible. */
  notFound: string[];
  notes: string;
};

const FIGURE_SCHEMA = {
  type: "object",
  properties: {
    value: { type: ["number", "null"] },
    sourceText: { type: "string" },
  },
  required: ["value", "sourceText"],
};

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    societyNameOnDocument: { type: "string" },
    areaOrCircuit: { type: "string" },
    periodStart: { type: "string" },
    periodEnd: { type: "string" },
    lightCount: FIGURE_SCHEMA,
    wattagePerLight: FIGURE_SCHEMA,
    consumptionBeforeKwh: FIGURE_SCHEMA,
    consumptionAfterKwh: FIGURE_SCHEMA,
    savingsPct: FIGURE_SCHEMA,
    notFound: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
  required: [
    "societyNameOnDocument",
    "areaOrCircuit",
    "periodStart",
    "periodEnd",
    "lightCount",
    "wattagePerLight",
    "consumptionBeforeKwh",
    "consumptionAfterKwh",
    "savingsPct",
    "notFound",
    "notes",
  ],
};

const PROMPT = `You are reading a lighting energy report for an Indian housing society.

Extract only what the document actually states. These rules are absolute:

- If a figure is not printed in the document, set its value to null and add its
  name to "notFound". NEVER calculate, infer or estimate a missing figure —
  a null is useful, a guess is dangerous, because these numbers describe money.
- For every figure, put the exact words you read it from into "sourceText",
  copied verbatim from the document including the unit as printed. If you
  cannot quote it, you did not read it: set the value to null.
- Consumption figures must be in kWh. If the document prints another unit,
  record the number AS PRINTED and say the unit in sourceText — do not convert.
- "consumptionBeforeKwh" is usage BEFORE the LED retrofit (the baseline);
  "consumptionAfterKwh" is usage after it. If the report covers only one of
  them, leave the other null rather than assuming they are the same period.
- Dates as YYYY-MM-DD. If the document gives only a month, use the first day
  of that month for periodStart and the last day for periodEnd. If it gives no
  period at all, leave both empty strings.
- "societyNameOnDocument" is the society name exactly as printed, not corrected.
- Put anything ambiguous or contradictory in "notes" rather than resolving it
  yourself.`;

export async function extractReportFigures(params: {
  base64: string;
  mimeType: string;
}): Promise<ExtractedReport> {
  const interaction = await ai.interactions.create({
    model: MODEL,
    input: [
      { type: "text", text: PROMPT },
      { type: "document", data: params.base64, mime_type: params.mimeType },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: REPORT_SCHEMA },
  });
  if (!interaction.output_text) throw new Error("Gemini returned no output");
  return JSON.parse(interaction.output_text) as ExtractedReport;
}

/** Which document types carry figures worth reading. */
export const EXTRACTABLE_TYPES = new Set(["savingsReport", "preDemoReport", "postDemoReport", "inspectionReport"]);
