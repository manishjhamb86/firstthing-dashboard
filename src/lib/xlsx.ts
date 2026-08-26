/**
 * A minimal XLSX reader — enough to get a sheet's cells out as text.
 *
 * Meter data arrives as a workbook as often as a CSV: Ace City's own history
 * is five sheets, two circuits, with the readings pasted in side-by-side
 * blocks (2026-08-26). Refusing it would mean asking an operator to re-export
 * by hand, which is where transcription errors come from.
 *
 * Written rather than taken off the shelf deliberately: the whole need is
 * "cell values as strings", the ubiquitous library is an order of magnitude
 * larger than this file and carries a formula engine, and a dependency that
 * parses untrusted uploads is a supply-chain decision. The reader below only
 * inflates and reads XML — it evaluates nothing.
 */

import { inflateRawSync } from "node:zlib";

export type Sheet = {
  name: string;
  /** Row-major cells, already trimmed. Ragged rows are padded. */
  rows: string[][];
};

// ── the ZIP container ────────────────────────────────────────────────────

type Entry = { name: string; method: number; offset: number; size: number };

function readEntries(buf: Buffer): Entry[] {
  // The End of Central Directory record is at the end, after a comment of
  // unknown length — so it is found by scanning back for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    entries.push({ name: buf.toString("utf8", p + 46, p + 46 + nameLen), method, offset, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readFile(buf: Buffer, entry: Entry): string {
  // The local header repeats the name and extra fields at their own lengths —
  // the central directory's extra length is often different, so the data
  // offset has to be computed from the local header, never from the central
  // one.
  const p = entry.offset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`bad local header for ${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + (entry.method === 0 ? entry.size : buf.length - start));
  return (entry.method === 0 ? raw : inflateRawSync(raw)).toString("utf8");
}

// ── the spreadsheet ──────────────────────────────────────────────────────

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

/** `BC` → 54. Column letters are base-26 with no zero. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Excel stores a date as days since 1899-12-30. 25569 is 1970-01-01, so the
 * conversion is a subtraction — but only for a cell we already know is a
 * date, which is why this is exported rather than guessed at per cell: a
 * consumption of 45872 kWh and a date in August 2025 are the same number.
 */
export function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61 || serial > 2958465) return null;
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function readWorkbook(bytes: Uint8Array): Sheet[] {
  const buf = Buffer.from(bytes);
  const entries = readEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const get = (name: string): string | null => {
    const e = byName.get(name);
    return e ? readFile(buf, e) : null;
  };

  const workbook = get("xl/workbook.xml");
  if (!workbook) throw new Error("not an xlsx workbook");

  const relsXml = get("xl/_rels/workbook.xml.rels") ?? "";
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) {
    rels.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const shared: string[] = [];
  const sharedXml = get("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      // A string can be split across runs (<r><t>..</t></r>); the value is
      // every <t> concatenated, not the first one.
      const text = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
      shared.push(unescapeXml(text));
    }
  }

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"[^>]*\/>/g)) {
    const target = rels.get(m[2]);
    const xml = target ? get(`xl/${target}`) : null;
    if (!xml) continue;
    sheets.push({ name: unescapeXml(m[1]), rows: readSheet(xml, shared) });
  }
  return sheets;
}

function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      const at = ref ? columnIndex(ref[1]) : cells.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      let value = "";
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      while (cells.length < at) cells.push("");
      cells[at] = unescapeXml(value).trim();
    }
    rows.push(cells);
  }
  return rows;
}
