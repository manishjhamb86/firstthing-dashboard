import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.6-flash";

/**
 * Built on first use, not at import. A client constructed at module scope
 * reads process.env before anything has had a chance to load it — which is
 * invisible under `next dev` (the framework loads env first) and fails the
 * moment the module is imported from a script or a test.
 */
let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Reading a historical document, and ASKING when it is not clear.
 *
 * This deliberately does what `inferStructure` refuses to do — it lets the
 * model return values — and the reason the two differ is the artefact, not a
 * change of mind. A meter CSV is ~720 rows a month across hundreds of
 * circuits: too much to send, too much to check, and INV-02 needs the
 * transform replayable, so there the model only proposes a mapping. A savings
 * report or an agreement is one document with a few dozen printed figures a
 * person can verify on screen — the shape the archived invoice extraction
 * handled, and the shape it was judged safe for.
 *
 * The design was rewritten against REAL samples (2026-08-26), which is what
 * taught it the ambiguities it now has to ask about rather than resolve:
 *
 *  - **The same report varies by society and by revision.** Gaur Saundaryam's
 *    is a savings report over six months with four separate reading windows;
 *    Himalaya Pride's and The Princely States' are "analysis and
 *    recommendation" reports before and after a demo. One rigid field map
 *    would fit one of them.
 *  - **Reading tables print the day and month but not the year** ("06/12",
 *    "01/01"); the year lives in a heading above ("06–10 Dec 2025"). A
 *    January table under a December heading is a year rollover, and guessing
 *    it wrong moves a reading twelve months.
 *  - **Figures are adjusted in prose, not in the table.** Gaur Saundaryam
 *    deducts 2.16 kWh/day for five unreplaced surface lights from BOTH sides
 *    of the comparison, so the same day appears as 20.37 and as 18.21. Which
 *    one is "the meter reading" is a decision with a number attached, so it
 *    is asked, never assumed.
 *  - **Documents contradict themselves.** That same report's May table
 *    averages to 8.01 while the sentence under it says 8.58. A model that
 *    silently picks one has made a billing decision nobody reviewed.
 *  - **A revenue share is a share OF someone.** Hyde Park's agreement says
 *    "35% of the energy savings" — FirsThing's share, so the society's is
 *    65%, and the system's own default is 58/42 the other way round. This
 *    project has shipped that inversion twice; the schema therefore forces
 *    the model to say WHOSE share it read, and never stores a bare percentage.
 */

export type Figure = {
  value: number | null;
  /** Verbatim from the page — the reviewer's check, and the audit trail. */
  sourceText: string;
};

export type DailyReading = {
  /** YYYY-MM-DD, resolved. Empty when the year could not be established. */
  date: string;
  kwh: number | null;
  /** Which window of the document this row came from, in its own words. */
  window: string;
  sourceText: string;
};

/**
 * Something the document does not settle. The model must raise these rather
 * than choose — every one of them has a number or a party on the other side.
 */
export type Clarification = {
  id: string;
  question: string;
  /** Why it matters, in plain words, so the answer is an informed one. */
  because: string;
  /** The readings the model can see; the operator picks or types their own. */
  options: string[];
  /** What the document says around the ambiguity. */
  sourceText: string;
};

/**
 * One kind of fixture on the circuit, as the document describes it.
 *
 * The single lightCount/wattagePerLight pair below is not enough to build a
 * circuit from: Gaur Saundaryam's has 42 tube lights at 20W being retrofitted
 * AND 5 surface lights at 18W that are not, and the extraction correctly
 * refused to collapse them into one number. A circuit's inventory is a LIST,
 * so the extraction has to return one.
 */
export type ExtractedFixture = {
  label: string;
  count: number | null;
  watts: number | null;
  hoursPerDay: number | null;
  /**
   * Whether the document says this kind was replaced. Null when it does not
   * say — the operator is asked rather than it being assumed, because getting
   * it wrong moves the shared-load deduction and with it the savings figure.
   */
  retrofitted: boolean | null;
  sourceText: string;
};

export type ExtractedDocument = {
  documentKind: string;
  societyNameOnDocument: string;
  areaOrCircuit: string;
  periodStart: string;
  periodEnd: string;

  lightCount: Figure;
  wattagePerLight: Figure;
  operatingHoursPerDay: Figure;
  theoreticalDailyKwh: Figure;

  baselineDailyKwh: Figure;
  afterDailyKwh: Figure;
  savingsPct: Figure;

  /** Agreements only — and each share says whose it is, never a bare number. */
  firsthingSharePct: Figure;
  societySharePct: Figure;
  contractTermMonths: Figure;
  contractedLightCount: Figure;
  monthlyServiceChargeInr: Figure;

  /** Each kind of fixture on the circuit, as the document describes it. */
  fixtures: ExtractedFixture[];

  /** Every daily meter reading printed anywhere in the document. */
  dailyReadings: DailyReading[];

  clarifications: Clarification[];
  notFound: string[];
  notes: string;
};

const FIGURE = {
  type: "object",
  properties: { value: { type: ["number", "null"] }, sourceText: { type: "string" } },
  required: ["value", "sourceText"],
};

const SCHEMA = {
  type: "object",
  properties: {
    documentKind: { type: "string" },
    societyNameOnDocument: { type: "string" },
    areaOrCircuit: { type: "string" },
    periodStart: { type: "string" },
    periodEnd: { type: "string" },
    lightCount: FIGURE,
    wattagePerLight: FIGURE,
    operatingHoursPerDay: FIGURE,
    theoreticalDailyKwh: FIGURE,
    baselineDailyKwh: FIGURE,
    afterDailyKwh: FIGURE,
    savingsPct: FIGURE,
    firsthingSharePct: FIGURE,
    societySharePct: FIGURE,
    contractTermMonths: FIGURE,
    contractedLightCount: FIGURE,
    monthlyServiceChargeInr: FIGURE,
    fixtures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          count: { type: ["number", "null"] },
          watts: { type: ["number", "null"] },
          hoursPerDay: { type: ["number", "null"] },
          retrofitted: { type: ["boolean", "null"] },
          sourceText: { type: "string" },
        },
        required: ["label", "count", "watts", "hoursPerDay", "retrofitted", "sourceText"],
      },
    },
    dailyReadings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          kwh: { type: ["number", "null"] },
          window: { type: "string" },
          sourceText: { type: "string" },
        },
        required: ["date", "kwh", "window", "sourceText"],
      },
    },
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
    "documentKind", "societyNameOnDocument", "areaOrCircuit", "periodStart", "periodEnd",
    "lightCount", "wattagePerLight", "operatingHoursPerDay", "theoreticalDailyKwh",
    "baselineDailyKwh", "afterDailyKwh", "savingsPct",
    "firsthingSharePct", "societySharePct", "contractTermMonths", "contractedLightCount",
    "monthlyServiceChargeInr", "fixtures", "dailyReadings", "clarifications", "notFound", "notes",
  ],
};

const PROMPT = `You are reading a lighting energy document for an Indian housing society —
a savings report, a pre- or post-demo analysis report, or a service agreement.
These documents are written by hand and vary in layout, wording and completeness.

Extract only what the document actually states. These rules are absolute:

1. NEVER calculate, infer or estimate a figure that is not printed. Set the
   value to null and name it in "notFound". These numbers describe money: a
   null is useful, a confident guess is dangerous.
2. Every figure carries "sourceText" — the words you read it from, copied
   verbatim including the unit as printed. If you cannot quote it, you did not
   read it: set the value to null.
3. Reading tables often print only day and month ("06/12", "01/01"). Take the
   year from the nearest heading or sentence. If a table crosses into a new
   year, or the year cannot be established at all, leave "date" empty and RAISE
   A CLARIFICATION rather than assuming.
4. A document may ADJUST a figure in prose — for example deducting the load of
   fixtures that were not replaced, so the same day appears twice with
   different values. Put the RAW METERED value in "dailyReadings" and raise a
   clarification describing the adjustment. Never silently apply it.
5. If the document contradicts itself — a table average that differs from the
   average stated in the text beside it — extract neither. Raise a
   clarification giving both values and where each came from.
6. A revenue or service share is always a share OF SOMEONE. Record
   "firsthingSharePct" and "societySharePct" separately, and only from what is
   printed. If the document says one of them, leave the other null rather than
   subtracting from 100 yourself, and say in "notes" which one was printed.
7. Put every genuine ambiguity in "clarifications": something a careful reader
   would have to ask about. Each needs a plain question, why it matters, the
   candidate answers you can see, and the surrounding text. Do not raise a
   clarification for something the document states plainly.
8. "dailyReadings" must include every dated meter reading printed anywhere in
   the document, tagged with the window it appeared under in that document's
   own words ("Before installation", "Re-verification May 2026").
9. "fixtures" is one entry per KIND of light or appliance on the metered
   circuit — "42 Basement Tube Lights - 20W each" and "5 Surface Lights - 18W
   each" are two entries, never one. Set "retrofitted" true only where the
   document says that kind was replaced, false only where it says it was not,
   and null when it does not say. Do not infer it from the fixture's name.
   If the document mentions a circuit but never breaks it down by kind,
   return an empty array rather than inventing a single line.`;

export async function extractDocument(params: {
  base64: string;
  mimeType: string;
}): Promise<ExtractedDocument> {
  const interaction = await gemini().interactions.create({
    model: MODEL,
    input: [
      { type: "text", text: PROMPT },
      { type: "document", data: params.base64, mime_type: params.mimeType },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
  });
  if (!interaction.output_text) throw new Error("Gemini returned no output");
  return JSON.parse(interaction.output_text) as ExtractedDocument;
}

/** Which document types carry figures worth reading. */
export const EXTRACTABLE_TYPES = new Set([
  "savingsReport",
  "preDemoReport",
  "postDemoReport",
  "inspectionReport",
  "agreement",
]);
