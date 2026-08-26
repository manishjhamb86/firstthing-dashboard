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
 * The blocks as one series — with the overlap resolved, which is the whole
 * difficulty.
 *
 * The blocks are not consecutive chunks. They are separate exports of the
 * same meter taken on different days, so they overlap: in Ace City's own
 * workbook two blocks share 128 dates and, on 126 of them, repeat the hourly
 * readings value for value. Stacking them blindly sums each of those hours
 * twice, which does not look wrong — every day is simply about double — and
 * lands in a baseline a society is billed against.
 *
 * So a date belongs to ONE block: the one holding the most readings for it.
 * With no time column there is no way to tell a day split across two blocks
 * from a day repeated in both, and the two mistakes are not equal. Taking the
 * fullest block can only under-report a day, which surfaces as a partial day
 * and is excluded from averages; summing both silently inflates consumption,
 * and on the pre-install side that inflates the saving, and the fee that is a
 * share of it.
 *
 * Order within the file is not preserved and need not be: the pipeline sorts
 * by timestamp, and these are interval readings, never a running register
 * whose order would carry meaning.
 */
export function sheetToReadingCsv(sheet: Sheet, chosen: ReadingSheet): string {
  const byDate = new Map<string, number[][]>();
  for (let r = chosen.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    chosen.pairs.forEach((p, block) => {
      const date = cellToIso(row[p.dateColumn] ?? "");
      const raw = (row[p.valueColumn] ?? "").trim();
      if (!date || raw === "") return;
      const value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value)) return;
      const blocks = byDate.get(date) ?? chosen.pairs.map(() => [] as number[]);
      blocks[block].push(value);
      byDate.set(date, blocks);
    });
  }

  const lines = [WORKBOOK_HEADER];
  for (const [date, blocks] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Ties go to the earlier block, so the same workbook always converts the
    // same way — a figure that moved between two identical uploads would be
    // unexplainable.
    const fullest = blocks.reduce((best, b) => (b.length > best.length ? b : best), blocks[0]);
    for (const value of fullest) lines.push(`${date},${value}`);
  }
  return lines.join("\n");
}
