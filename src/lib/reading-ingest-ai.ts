// FEAT-043 / FEAT-044 — the AI half of CON-30's ingest: infer a vendor
// export's shape, and say so when it isn't sure.
//
// This module's contract with the rest of the pipeline is narrow on purpose.
// It returns a *proposal* — a mapping, a confidence, and any questions worth
// asking a human — and never a number. `reading-normalize.ts` does all the
// arithmetic. See src/lib/gemini.ts for why.

import { inferStructure, sampleForInference } from "./gemini";
import type { ReadingMapping } from "./reading-normalize";

export type ClarifyingQuestion = {
  id: string;
  question: string;
  options: string[];
};

export type MappingProposal = {
  mapping: ReadingMapping;
  confidence: "high" | "medium" | "low";
  columnNames: string[];
  questions: ClarifyingQuestion[];
  notes: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    delimiter: { type: "string", enum: [",", ";", "\t", "|"] },
    headerRowIndex: {
      type: "integer",
      description: "0-based index of the header among non-empty lines; -1 if the file has no header",
    },
    dateColumn: { type: "integer", description: "0-based column index holding the date" },
    timeColumn: {
      type: "integer",
      description: "0-based column index holding the time, or -1 if the date column already carries it or the data is daily",
    },
    valueColumn: { type: "integer", description: "0-based column index holding the reading" },
    valueUnit: { type: "string", enum: ["kWh", "Wh", "MWh"] },
    dateFormat: {
      type: "string",
      enum: ["ISO", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"],
    },
    granularity: { type: "string", enum: ["sub_daily", "daily"] },
    valueKind: {
      type: "string",
      enum: ["interval", "cumulative"],
      description: "interval = consumption during that interval; cumulative = a running meter register",
    },
    footerRowsToIgnore: { type: "integer" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    columnNames: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["id", "question", "options"],
      },
    },
    notes: { type: "string" },
  },
  required: [
    "delimiter",
    "headerRowIndex",
    "dateColumn",
    "timeColumn",
    "valueColumn",
    "valueUnit",
    "dateFormat",
    "granularity",
    "valueKind",
    "footerRowsToIgnore",
    "confidence",
    "columnNames",
    "questions",
    "notes",
  ],
} as const;

const PROMPT = `You are reading a smart electricity meter's export file for a single lighting circuit
in an Indian residential society. Your only job is to describe the file's STRUCTURE so a
deterministic parser can read it. Do not compute, sum, or transform any values.

Determine:
- the delimiter, and which line (0-based, counting only non-empty lines) is the header
- which column holds the date, which holds the time (if separate), and which holds the reading
- the date format, choosing between DD/MM/YYYY and MM/DD/YYYY using evidence: a day value above 12
  anywhere in the column settles it. If nothing in the sample settles it, do NOT guess — set
  confidence to "low" and ask a question about it. This file is Indian in origin, so DD/MM/YYYY is
  more likely, but "more likely" is not evidence.
- the unit. If a header says kWh, trust it. If values are in the thousands for an hourly lighting
  circuit, suspect Wh.
- whether the reading column is consumption for that interval, or a cumulative meter register that
  only ever increases. This distinction matters more than any other: a register read as consumption
  produces a monthly total orders of magnitude too large. If the column rises monotonically across
  the whole sample, it is cumulative.
- how many trailing rows are totals/footers rather than readings.

Ask a clarifying question whenever the file is genuinely ambiguous — an unlabelled column, two
plausible value columns, an undecidable date format. Each question needs concrete options a person
can pick between. Ask nothing if the file is unambiguous. Never invent a column that isn't there.

Report the column names you found in file order, so a human can check your mapping against them.`;

type RawProposal = {
  delimiter: string;
  headerRowIndex: number;
  dateColumn: number;
  timeColumn: number;
  valueColumn: number;
  valueUnit: string;
  dateFormat: string;
  granularity: string;
  valueKind: string;
  footerRowsToIgnore: number;
  confidence: string;
  columnNames: string[];
  questions: ClarifyingQuestion[];
  notes: string;
};

export async function proposeMapping(fileText: string, answers?: Record<string, string>): Promise<MappingProposal> {
  const answerBlock =
    answers && Object.keys(answers).length > 0
      ? `\n\nThe operator has answered your earlier questions. Treat these as settled fact and re-propose the mapping accordingly:\n${Object.entries(
          answers,
        )
          .map(([q, a]) => `- ${q} → ${a}`)
          .join("\n")}`
      : "";

  const raw = await inferStructure<RawProposal>({
    sample: sampleForInference(fileText),
    prompt: PROMPT + answerBlock,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  return {
    mapping: {
      delimiter: (raw.delimiter as ReadingMapping["delimiter"]) ?? ",",
      headerRowIndex: raw.headerRowIndex,
      dateColumn: raw.dateColumn,
      // The schema uses -1 rather than null for "no time column": a nullable
      // integer is the field most likely to come back as the string "null".
      timeColumn: raw.timeColumn >= 0 ? raw.timeColumn : null,
      valueColumn: raw.valueColumn,
      valueUnit: (raw.valueUnit as ReadingMapping["valueUnit"]) ?? "kWh",
      dateFormat: (raw.dateFormat as ReadingMapping["dateFormat"]) ?? "ISO",
      granularity: raw.granularity === "daily" ? "daily" : "sub_daily",
      valueKind: raw.valueKind === "cumulative" ? "cumulative" : "interval",
      footerRowsToIgnore: Math.max(0, raw.footerRowsToIgnore ?? 0),
    },
    confidence: (raw.confidence as MappingProposal["confidence"]) ?? "low",
    columnNames: raw.columnNames ?? [],
    questions: raw.questions ?? [],
    notes: raw.notes ?? "",
  };
}
