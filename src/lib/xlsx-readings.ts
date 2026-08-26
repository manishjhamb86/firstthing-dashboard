/**
 * A meter workbook → the delimited text the reading pipeline already reads.
 *
 * Ace City's history (2026-08-26) is the shape this exists for: five sheets,
 * two circuits, and each readings sheet holding the hourly series in several
 * side-by-side blocks of (date, consumption) — a SONOFF export pasted into
 * Excel in chunks rather than one long column.
 *
 * The conversion stops at text on purpose. Everything after it — the format
 * signature, the mapping, interval→daily, the row-by-row review — is already
 * built and proven, and re-deriving a figure from the raw file plus a stored
 * mapping is what INV-02 rests on. A second parallel pipeline for workbooks
 * would be a second place for the arithmetic to differ.
 */

import { serialToIso, type Sheet } from "./xlsx";

/** One (date, value) block within a sheet. */
export type ColumnPair = { dateColumn: number; valueColumn: number };

export type ReadingSheet = {
  name: string;
  pairs: ColumnPair[];
  headerRow: number;
  /** Readings the sheet yields across all its blocks. */
  readingCount: number;
};

const DATE_HEADER = /^(data|date|timestamp|day)$/i;
const VALUE_HEADER = /consumption|kwh|energy|units?$/i;

/**
 * Blocks in one row: a date-ish header with a value-ish header within the
 * next two columns. Two columns of slack, because a blank spacer between
 * blocks is how these files are actually laid out.
 */
export function findColumnPairs(header: string[]): ColumnPair[] {
  const pairs: ColumnPair[] = [];
  for (let i = 0; i < header.length; i++) {
    if (!DATE_HEADER.test(header[i] ?? "")) continue;
    for (let j = i + 1; j <= i + 2 && j < header.length; j++) {
      if (VALUE_HEADER.test(header[j] ?? "")) {
        pairs.push({ dateColumn: i, valueColumn: j });
        i = j;
        break;
      }
    }
  }
  return pairs;
}

/** A date cell, however the sheet spells it. */
export function cellToIso(cell: string): string | null {
  const s = (cell ?? "").trim();
  if (s === "") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  // A whole-looking serial and a fractional one are the same thing; the
  // fraction is the time of day, which the daily rollup does not need.
  return Number.isFinite(n) ? serialToIso(Math.floor(n)) : null;
}

/**
 * Every sheet that holds readings at all, most substantial first — the
 * operator picks, because a workbook covering two circuits cannot be
 * resolved from the file alone and guessing would file one circuit's
 * consumption against the other.
 */
export function readingSheets(sheets: Sheet[]): ReadingSheet[] {
  const found: ReadingSheet[] = [];
  for (const sheet of sheets) {
    for (let r = 0; r < Math.min(5, sheet.rows.length); r++) {
      const pairs = findColumnPairs(sheet.rows[r] ?? []);
      if (pairs.length === 0) continue;
      const readingCount = countReadings(sheet, pairs, r);
      if (readingCount > 0) found.push({ name: sheet.name, pairs, headerRow: r, readingCount });
      break;
    }
  }
  return found.sort((a, b) => b.readingCount - a.readingCount);
}

function countReadings(sheet: Sheet, pairs: ColumnPair[], headerRow: number): number {
  let n = 0;
  for (let r = headerRow + 1; r < sheet.rows.length; r++) {
    for (const p of pairs) {
      const row = sheet.rows[r] ?? [];
      if (cellToIso(row[p.dateColumn] ?? "") && Number.isFinite(Number(row[p.valueColumn] ?? ""))) n++;
    }
  }
  return n;
}

export const WORKBOOK_HEADER = "data,consumption/KWh";

/**
 * The blocks stacked into one series. Order is not preserved and does not
 * need to be: the pipeline sorts by timestamp, and every reading here is an
 * interval, never a running register whose order would carry meaning.
 */
export function sheetToReadingCsv(sheet: Sheet, chosen: ReadingSheet): string {
  const lines = [WORKBOOK_HEADER];
  for (let r = chosen.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    for (const p of chosen.pairs) {
      const date = cellToIso(row[p.dateColumn] ?? "");
      const raw = (row[p.valueColumn] ?? "").trim();
      if (!date || raw === "") continue;
      const value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      lines.push(`${date},${value}`);
    }
  }
  return lines.join("\n");
}
