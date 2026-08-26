// CON-45 — known vendor-export signatures, matched before any AI call.
//
// A format we have seen before should not cost a model call or carry model
// uncertainty: the mapping is a fact, not a proposal. On an exact match the
// operator still sees the mapping and can override it; on no match the
// existing AI proposal path (reading-ingest-ai.ts) runs unchanged. Adding a
// manufacturer later is one entry here, not a new code path.

import type { ReadingMapping } from "./reading-normalize";

export type FormatMatch = {
  vendor: string;
  mapping: ReadingMapping;
  /** Intervals a complete day holds under this format — 24 for hourly. */
  expectedIntervalsPerDay: number;
};

/** Strips a UTF-8 BOM, which SONOFF exports carry on the header row. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() !== "") return line.trim();
  }
  return "";
}

/**
 * SONOFF smart-meter history export. Verified against a real file
 * (2026-08-17): UTF-8 BOM; header exactly `data,time,consumption/KWh` (note
 * "data", not "date"); ISO dates; the time cell is an hour RANGE
 * ("13:00-14:00" — the parser takes its start); the last slot of a day is
 * "23:00-24:00"; values are interval kWh, never a cumulative register.
 */
const SONOFF_HEADER = "data,time,consumption/kwh";

/**
 * The same export pasted into a workbook, which is how a society's own
 * history usually reaches us (Ace City, 2026-08-26): the time column is
 * dropped, leaving the day repeated once per hourly reading. Produced by
 * xlsx-readings.ts, and matched here rather than special-cased there so a
 * hand-made CSV of the same shape is read identically.
 */
const WORKBOOK_HEADER = "data,consumption/kwh";

export function matchKnownFormat(rawText: string): FormatMatch | null {
  const header = firstNonEmptyLine(stripBom(rawText)).toLowerCase();
  if (header === SONOFF_HEADER) {
    return {
      vendor: "sonoff",
      expectedIntervalsPerDay: 24,
      mapping: {
        delimiter: ",",
        headerRowIndex: 0,
        dateColumn: 0,
        timeColumn: 1,
        valueColumn: 2,
        valueUnit: "kWh",
        dateFormat: "ISO",
        granularity: "sub_daily",
        valueKind: "interval",
        footerRowsToIgnore: 0,
      },
    };
  }
  if (header === WORKBOOK_HEADER) {
    return {
      vendor: "sonoff_workbook",
      expectedIntervalsPerDay: 24,
      mapping: {
        delimiter: ",",
        headerRowIndex: 0,
        dateColumn: 0,
        // No time column: every reading of a day carries the same date, and
        // the rollup sums them. Safe because these are interval readings —
        // a cumulative register would need the order the time gives.
        timeColumn: null,
        valueColumn: 1,
        valueUnit: "kWh",
        dateFormat: "ISO",
        granularity: "sub_daily",
        valueKind: "interval",
        footerRowsToIgnore: 0,
      },
    };
  }
  return null;
}
