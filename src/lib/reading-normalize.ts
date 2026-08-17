// CON-30 / FEAT-043 / FEAT-044 — turning a vendor meter export into the
// system's canonical daily readings.
//
// The whole of this module is deliberately pure and deterministic. The AI's
// only job is to *propose* the mapping below (see src/lib/gemini.ts for why);
// everything that touches an actual number happens here, so normalisation can
// be replayed from the raw file and the stored mapping alone. That is what
// makes FEAT-047-AC-1's provenance chain a chain to something reproducible
// rather than to a one-off model response.

export type Delimiter = "," | ";" | "\t" | "|";

export type DateFormat =
  | "ISO" // 2026-08-01, or a full ISO timestamp
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD-MM-YYYY"
  | "YYYY/MM/DD";

export type ReadingMapping = {
  delimiter: Delimiter;
  /** Index into the file's non-empty lines. -1 means the file has no header. */
  headerRowIndex: number;
  dateColumn: number;
  /** Separate time column, where the vendor splits date and time. */
  timeColumn: number | null;
  valueColumn: number;
  valueUnit: "kWh" | "Wh" | "MWh";
  dateFormat: DateFormat;
  granularity: "sub_daily" | "daily";
  /**
   * Whether the value column is the consumption *for* that interval or a
   * cumulative meter register. Getting this wrong is the single most
   * destructive mis-mapping available — a register read as consumption
   * produces a monthly total roughly a thousand times too large, and it
   * looks like a plausible number in a column of plausible numbers.
   */
  valueKind: "interval" | "cumulative";
  /** Trailing rows to drop — vendor exports often end with a totals line. */
  footerRowsToIgnore: number;
};

export type DailyReading = {
  /** UTC midnight of the calendar day. */
  date: Date;
  kWh: number;
  intervalCount: number;
};

export type ParseResult = {
  days: DailyReading[];
  /** Data rows the mapping produced a usable (timestamp, value) pair from. */
  rowsParsed: number;
  /** Data rows attempted, excluding header and footer. */
  rowsAttempted: number;
  /** Rows whose timestamp did not parse under the chosen format. */
  rowsUnparseable: number;
  /** Rows that parsed but fell outside the operator's selected period. */
  rowsOutOfPeriod: number;
  /** Cumulative-register rows where the value went backwards. */
  rowsNegative: number;
  problems: string[];
};

const UNIT_TO_KWH: Record<ReadingMapping["valueUnit"], number> = {
  kWh: 1,
  Wh: 0.001,
  MWh: 1000,
};

/**
 * A minimal RFC-4180-ish splitter: quoted fields, doubled quotes inside them.
 * The commissioning CSV parser (`monitoring-window.ts`) deliberately skips
 * this because its only content is a date and a number. Vendor exports are
 * not ours to constrain, and a quoted field containing the delimiter is
 * common enough that ignoring it would silently shift every column right.
 */
export function splitDelimitedLine(line: string, delimiter: Delimiter): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function nonEmptyLines(text: string): string[] {
  // SONOFF exports open with a UTF-8 BOM; left in place it corrupts the
  // first cell of whichever line it lands on (the header today, a date cell
  // in a headerless file tomorrow).
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return clean.split(/\r?\n/).filter((l) => l.trim() !== "");
}

/**
 * Parses a date cell (plus an optional separate time cell) to a UTC instant.
 * Everything downstream is UTC because every calendar day in this schema is
 * stored at UTC midnight — a local `getDate()` would shift a month-boundary
 * reading into the wrong month, the same trap `billing-start.ts` documents.
 */
export function parseTimestamp(
  dateCell: string,
  timeCell: string | null,
  format: DateFormat,
): Date | null {
  const d = dateCell.trim();
  if (!d) return null;

  let y: number, m: number, day: number;
  let timeFromDateCell: string | null = null;

  if (format === "ISO") {
    // Accept a bare date or a full timestamp; take the time from whichever
    // half actually carries it.
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
    if (!match) return null;
    y = Number(match[1]);
    m = Number(match[2]);
    day = Number(match[3]);
    timeFromDateCell = match[4] ?? null;
  } else {
    // A non-ISO cell often carries the time inline — "01/07/2026 00:00" is a
    // real vendor shape, and reading it as a date alone makes every row in
    // the file unparseable. Split the time off first and treat it exactly as
    // the ISO branch treats its own.
    const [datePart, ...rest] = d.split(/\s+/);
    if (rest.length > 0) timeFromDateCell = rest.join(" ");
    const parts = datePart.split(/[/-]/).map((p) => p.trim());
    if (parts.length < 3) return null;
    const nums = parts.slice(0, 3).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return null;
    if (format === "YYYY/MM/DD") [y, m, day] = nums;
    else if (format === "MM/DD/YYYY") [m, day, y] = nums;
    else [day, m, y] = nums; // DD/MM/YYYY and DD-MM-YYYY
  }

  if (m < 1 || m > 12 || day < 1 || day > 31) return null;

  let hh = 0;
  let mm = 0;
  const time = (timeCell ?? timeFromDateCell)?.trim();
  if (time) {
    const t = time.match(/^(\d{1,2}):(\d{2})/);
    if (!t) return null;
    hh = Number(t[1]);
    mm = Number(t[2]);
    // A vendor exporting an end-of-day stamp as 24:00 means midnight closing
    // that day, not the next one. Clamping it into the same day keeps the
    // hourly rows for a day together where they belong.
    if (hh === 24 && mm === 0) {
      hh = 23;
      mm = 59;
    }
    if (hh > 23 || mm > 59) return null;
  }

  const ts = Date.UTC(y, m - 1, day, hh, mm);
  const check = new Date(ts);
  // Rejects 31 February and friends, which Date.UTC would otherwise roll over
  // into a real — and wrong — date.
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== day) return null;
  return check;
}

export function utcDayOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInPeriod(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Applies a confirmed mapping to the whole file.
 *
 * `period` is the operator's explicit selection (INV-04/CON-25). Rows outside
 * it are counted and dropped rather than trusted: the file's own contents
 * never decide which month this upload is for. A vendor export that spans a
 * month boundary is normal, and silently importing the overhang would put
 * readings into a month the operator never chose — possibly a closed one.
 */
type Point = { at: Date; value: number };

type PointsResult = {
  intervals: Point[];
  rowsAttempted: number;
  rowsUnparseable: number;
  rowsNegative: number;
  problems: string[];
};

/**
 * The shared front half of both parse paths: rows → timestamped points →
 * consumption intervals. Cumulative registers are differenced here, so no
 * caller can ever mistake a register for consumption.
 */
function parseIntervals(text: string, mapping: ReadingMapping): PointsResult {
  const problems: string[] = [];
  const lines = nonEmptyLines(text);
  const start = mapping.headerRowIndex >= 0 ? mapping.headerRowIndex + 1 : 0;
  const end = Math.max(start, lines.length - Math.max(0, mapping.footerRowsToIgnore));
  const dataLines = lines.slice(start, end);

  const points: Point[] = [];
  let rowsUnparseable = 0;

  for (const line of dataLines) {
    const cells = splitDelimitedLine(line, mapping.delimiter);
    const at = parseTimestamp(
      cells[mapping.dateColumn] ?? "",
      mapping.timeColumn === null ? null : (cells[mapping.timeColumn] ?? ""),
      mapping.dateFormat,
    );
    const raw = cells[mapping.valueColumn];
    // A blank value is not a zero. Zeros are a real, separately-detected
    // anomaly (FEAT-045); treating an empty cell as one would manufacture
    // evidence of a fault that the file never claimed.
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw.replace(/,/g, ""));
    if (!at || !Number.isFinite(value)) {
      rowsUnparseable++;
      continue;
    }
    points.push({ at, value });
  }

  points.sort((a, b) => a.at.getTime() - b.at.getTime());

  // A cumulative register becomes consumption by differencing consecutive
  // readings. The first point has no predecessor and so yields no interval —
  // which is correct, not a loss: the consumption before the first reading
  // is genuinely not in this file.
  let intervals: Point[];
  let rowsNegative = 0;
  if (mapping.valueKind === "cumulative") {
    intervals = [];
    for (let i = 1; i < points.length; i++) {
      const delta = points[i].value - points[i - 1].value;
      if (delta < 0) {
        rowsNegative++;
        continue; // meter reset or rollover — not consumption, and not ours to guess at
      }
      intervals.push({ at: points[i].at, value: delta });
    }
    if (rowsNegative > 0) {
      problems.push(
        `${rowsNegative} row${rowsNegative === 1 ? "" : "s"} went backwards against the previous register value — dropped, not treated as consumption.`,
      );
    }
  } else {
    intervals = points;
  }

  return { intervals, rowsAttempted: dataLines.length, rowsUnparseable, rowsNegative, problems };
}

export function applyMapping(text: string, mapping: ReadingMapping, period: string): ParseResult {
  const parsed = parseIntervals(text, mapping);
  const { intervals, rowsAttempted, rowsUnparseable, rowsNegative } = parsed;
  const problems = [...parsed.problems];
  const dataLines = { length: rowsAttempted };
  const scale = UNIT_TO_KWH[mapping.valueUnit];

  const byDay = new Map<number, { kWh: number; intervalCount: number }>();
  let rowsOutOfPeriod = 0;
  for (const p of intervals) {
    const day = utcDayOf(p.at);
    if (periodOf(day) !== period) {
      rowsOutOfPeriod++;
      continue;
    }
    const key = day.getTime();
    const acc = byDay.get(key) ?? { kWh: 0, intervalCount: 0 };
    acc.kWh += p.value * scale;
    acc.intervalCount += 1;
    byDay.set(key, acc);
  }

  if (rowsOutOfPeriod > 0) {
    problems.push(
      `${rowsOutOfPeriod} row${rowsOutOfPeriod === 1 ? "" : "s"} fell outside ${period} and were not imported.`,
    );
  }
  if (rowsUnparseable > 0) {
    problems.push(
      `${rowsUnparseable} of ${dataLines.length} rows could not be read with this mapping.`,
    );
  }

  const days = [...byDay.entries()]
    .map(([ts, v]) => ({ date: new Date(ts), kWh: v.kWh, intervalCount: v.intervalCount }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    days,
    rowsParsed: intervals.length,
    rowsAttempted: dataLines.length,
    rowsUnparseable,
    rowsOutOfPeriod,
    rowsNegative,
    problems,
  };
}

/** SCR-080: "must parse ≥95% of rows" before a timestamp format is accepted. */
export const MIN_PARSE_RATE = 0.95;

export function parseRate(r: ParseResult): number {
  if (r.rowsAttempted === 0) return 0;
  return (r.rowsAttempted - r.rowsUnparseable) / r.rowsAttempted;
}

export function refuseMapping(r: ParseResult, period: string): string | null {
  if (r.rowsAttempted === 0) return "This file has no data rows below the header.";
  if (parseRate(r) < MIN_PARSE_RATE) {
    return `This mapping only reads ${Math.round(parseRate(r) * 100)}% of the rows. Check the date format and which column holds the reading.`;
  }
  if (r.days.length === 0) {
    return `No rows in this file fall inside ${period}. Check you picked the right month, or the right export.`;
  }
  return null;
}

// ── CON-45 — range-scoped parsing for the circuit-page flow ──────────────

export type RangeParseResult = {
  /** Every day the file yields, in range or not — the review table shows the
   * out-of-window ones greyed rather than making them vanish. */
  days: DailyReading[];
  rowsParsed: number;
  rowsAttempted: number;
  rowsUnparseable: number;
  rowsNegative: number;
  problems: string[];
};

/**
 * The circuit-page flow's parse: no operator-chosen month. The whole file is
 * aggregated to days; windowing against the circuit's own recorded dates is
 * the caller's job (`circuit-load.ts` buildReviewRows), because which days
 * matter depends on the circuit, not on the file.
 */
export function applyMappingAllDays(text: string, mapping: ReadingMapping): RangeParseResult {
  const parsed = parseIntervals(text, mapping);
  const scale = UNIT_TO_KWH[mapping.valueUnit];

  const byDay = new Map<number, { kWh: number; intervalCount: number }>();
  for (const p of parsed.intervals) {
    const key = utcDayOf(p.at).getTime();
    const acc = byDay.get(key) ?? { kWh: 0, intervalCount: 0 };
    acc.kWh += p.value * scale;
    acc.intervalCount += 1;
    byDay.set(key, acc);
  }

  const days = [...byDay.entries()]
    .map(([ts, v]) => ({ date: new Date(ts), kWh: v.kWh, intervalCount: v.intervalCount }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    days,
    rowsParsed: parsed.intervals.length,
    rowsAttempted: parsed.rowsAttempted,
    rowsUnparseable: parsed.rowsUnparseable,
    rowsNegative: parsed.rowsNegative,
    problems: parsed.problems,
  };
}
