/**
 * Ace City's demo days, read from the meter workbook rather than the report.
 *
 * Its basement report exists only as a PDF whose text extracts a glyph at a
 * time, and the workbook is the same meter's own hourly record for exactly
 * those days — it reproduces the report's printed averages to four places
 * (48.6987 pre, 16.3629 post), so nothing is lost by preferring it, and
 * every day comes with its interval count as evidence it is whole.
 */
import { readFileSync } from "node:fs";
import { readWorkbook } from "../src/lib/xlsx";
import { readingSheets, sheetToReadingCsv } from "../src/lib/xlsx-readings";
import { matchKnownFormat } from "../src/lib/reading-formats";
import { applyMapping } from "../src/lib/reading-normalize";

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
// By name, wherever the sample folders have been reorganised to today.
function findSample(name: string, dir: string, depth = 0): string | undefined {
  if (depth > 4 || !existsSync(dir)) return undefined;
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === name)) return join(dir, name);
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const found = findSample(name, join(dir, e.name), depth + 1);
    if (found) return found;
  }
  return undefined;
}
const F =
  findSample("Ace City Meter Reading.xlsx", process.env.HOME + "/Downloads/Document Samples") ?? "";
const SHEET = "BasementReadings";
const BLOCKS = [
  { phase: "pre", period: "2025-08", from: "2025-08-03", to: "2025-08-10", stated: 48.6987 },
  { phase: "post", period: "2025-10", from: "2025-10-16", to: "2025-10-22", stated: 16.3629 },
];

const wb = readWorkbook(readFileSync(F));
const chosen = readingSheets(wb).find((s) => s.name === SHEET)!;
const csv = sheetToReadingCsv(wb.find((s) => s.name === SHEET)!, chosen);
const map = matchKnownFormat(csv)!.mapping;

for (const b of BLOCKS) {
  const days = applyMapping(csv, map, b.period).days
    .map((d) => ({ iso: d.date.toISOString().slice(0, 10), kWh: d.kWh, n: d.intervalCount }))
    .filter((d) => d.iso >= b.from && d.iso <= b.to);
  const partial = days.filter((d) => d.n !== 24);
  if (partial.length) throw new Error(`part-days in ${b.phase}: ${partial.map((d) => d.iso).join(", ")}`);
  const mean = days.reduce((a, d) => a + d.kWh, 0) / days.length;
  if (Math.abs(mean - b.stated) > 0.0001) {
    throw new Error(`${b.phase}: workbook gives ${mean.toFixed(4)}, the report prints ${b.stated}`);
  }
  console.error(`demo 1 ${b.phase.padEnd(4)} ${days.length} days ${b.from}..${b.to} mean ${mean.toFixed(4)} OK`);
  for (const d of days) console.log(`Ace City,Basement,1,${b.phase},${d.iso},${d.kWh.toFixed(2)}`);
}
