/**
 * Reads the EMS vendor's daily pump-room export — columns `ts, kw, kwh,
 * total_flow` — out of a workbook already read by `readWorkbook` (xlsx.ts).
 *
 * Deliberately NOT reusing xlsx-readings.ts, which is shaped for the
 * existing meter-reading CSV pipeline's different date/consumption-pair
 * layout. This is a small, dedicated parser for a different vendor shape.
 *
 * `parsePumpRoomSheet` takes `Sheet[]` directly (not raw bytes) so it can
 * be unit-tested against a hand-built fixture with no real zip file
 * involved; `readPumpRoomWorkbook` is the one-call convenience for real
 * bytes.
 */

import { readWorkbook, type Sheet } from "@/lib/xlsx";

export type PumpRoomRow = { ts: Date; kw: number | null; kwh: number; totalFlow: number | null };

export type PumpRoomParseResult = {
  rows: PumpRoomRow[];
  rowsUnparseable: number;
  problems: string[];
};

const HEADER_NAMES = ["ts", "kw", "kwh", "total_flow"] as const;

function findHeaderRow(sheet: Sheet): { rowIndex: number; col: Partial<Record<(typeof HEADER_NAMES)[number], number>> } | null {
  // Columns are located by header name, not position — the vendor's own
  // column order is not guaranteed. Scanned over the sheet's first few rows
  // so a title row above the real header does not defeat this.
  for (let i = 0; i < Math.min(sheet.rows.length, 10); i++) {
    const row = sheet.rows[i].map((c) => c.trim().toLowerCase());
    const col: Partial<Record<(typeof HEADER_NAMES)[number], number>> = {};
    for (const name of HEADER_NAMES) {
      const idx = row.indexOf(name);
      if (idx >= 0) col[name] = idx;
    }
    if (col.ts !== undefined && col.kwh !== undefined) return { rowIndex: i, col };
  }
  return null;
}

/**
 * The `ts` cell: an Excel serial (full precision, kept whole for
 * time-of-day — deliberately not xlsx.ts's own `serialToIso`, which
 * truncates to a date) or a "YYYY-MM-DD HH:mm[:ss]" text fallback. The
 * printed wall-clock numbers are stamped via `Date.UTC` directly with no
 * IST conversion — reading-normalize.ts's own house convention for every
 * vendor export in this codebase, applied here for the same reason.
 */
function parseTs(cell: string): Date | null {
  const trimmed = cell.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    // 25569 = days between Excel's epoch (1899-12-30) and 1970-01-01 — the
    // same constant xlsx.ts's own serialToIso uses, kept here rather than
    // calling that function because it would truncate the time of day.
    const ms = Math.round((serial - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = m[6] ? Number(m[6]) : 0;
  const ts = Date.UTC(y, mo - 1, d, hh, mi, ss);
  const check = new Date(ts);
  // Rejects a rolled-over date (31 February and friends), same guard
  // reading-normalize.ts's own parseTimestamp applies.
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return check;
}

function parseNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const t = cell.trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parsePumpRoomSheet(sheets: Sheet[]): PumpRoomParseResult {
  let header: { sheet: Sheet; rowIndex: number; col: Partial<Record<(typeof HEADER_NAMES)[number], number>> } | null = null;
  for (const sheet of sheets) {
    const found = findHeaderRow(sheet);
    if (found) {
      header = { sheet, ...found };
      break;
    }
  }
  if (!header) {
    return { rows: [], rowsUnparseable: 0, problems: ["No sheet with ts/kwh columns was found in this file."] };
  }
  const { sheet, rowIndex, col } = header;
  const rows: PumpRoomRow[] = [];
  let rowsUnparseable = 0;
  for (let i = rowIndex + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    if (r.every((c) => c.trim() === "")) continue; // a blank trailing row
    const ts = parseTs(r[col.ts!] ?? "");
    const kwh = parseNumber(r[col.kwh!]);
    if (!ts || kwh === null) {
      rowsUnparseable++;
      continue;
    }
    rows.push({
      ts,
      kw: col.kw !== undefined ? parseNumber(r[col.kw]) : null,
      kwh,
      totalFlow: col.total_flow !== undefined ? parseNumber(r[col.total_flow]) : null,
    });
  }
  rows.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const problems: string[] = [];
  if (rowsUnparseable > 0) {
    problems.push(`${rowsUnparseable} row${rowsUnparseable === 1 ? "" : "s"} could not be read (missing timestamp or kwh value).`);
  }
  return { rows, rowsUnparseable, problems };
}

export function readPumpRoomWorkbook(bytes: Uint8Array): PumpRoomParseResult {
  return parsePumpRoomSheet(readWorkbook(bytes));
}
