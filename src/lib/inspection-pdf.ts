import { PDFDocument, StandardFonts } from "pdf-lib";
import type { InspectionSensorStatus } from "@prisma/client";
import { COMPANY } from "./company";
import { formatDateTime, monthLabel } from "./format-date";
import { SENSOR_STATUS_META } from "./inspection";
import { BAD, CONTENT_W, INK, LINE, M, MUTED, PAGE_H, PAGE_W, SOFT, WARN, ensure, footers, header, text, wrap, type Ctx } from "./pdf-kit";

export { safe, wrap } from "./pdf-kit";

/**
 * The inspection report as a real PDF (2026-11-18, user-asked): generated
 * from the filed inspection on demand, so it always says what the record says
 * and nothing is stored that could fall out of step with it. The society
 * representative prints it, signs it on paper, and a photo or scan of the
 * signed copy is uploaded back against the inspection.
 *
 * Pure: data in, bytes out. pdf-lib (MIT, pure JS) with the standard
 * Helvetica faces — no font files to ship. Those faces only carry WinAnsi,
 * so every string goes through `safe()` first; a character the font cannot
 * draw would otherwise throw and take the whole download down.
 *
 * One A4 portrait page for an ordinary visit; a long fixture list carries on
 * to further pages with the table header repeated, and the signature block
 * always sits whole on the last page.
 */

export type InspectionPdfData = {
  id: string;
  societyName: string;
  societyLocation: string | null;
  area: string;
  period: string; // YYYY-MM
  inspectedAt: Date; // wall clock, read with UTC parts
  inspectorName: string;
  inspectorContact: string;
  totalLightsChecked: number;
  societyRepName: string | null;
  notes: string | null;
  findings: {
    srNo: number;
    location: string;
    sensorStatus: InspectionSensorStatus;
    physicalDamage: boolean;
    actionReplace: boolean;
    remarks: string | null;
  }[];
  generatedAt: Date;
};

const COLS = [
  { key: "sr", label: "Sr", w: 26 },
  { key: "location", label: "Location", w: 150 },
  { key: "sensor", label: "Sensor", w: 54 },
  { key: "damage", label: "Damage", w: 50 },
  { key: "replace", label: "Replace", w: 50 },
  { key: "remarks", label: "Remarks", w: CONTENT_W - 26 - 150 - 54 - 50 - 50 },
] as const;
const CELL_PAD = 5;
const ROW_SIZE = 9;
const ROW_LEAD = 11.5;

function tableHeader(ctx: Ctx) {
  const h = 18;
  ctx.page.drawRectangle({ x: M, y: ctx.y - h, width: CONTENT_W, height: h, color: SOFT });
  let x = M;
  for (const c of COLS) {
    text(ctx, c.label.toUpperCase(), x + CELL_PAD, ctx.y - 12, { size: 7.5, font: ctx.bold, color: MUTED });
    x += c.w;
  }
  ctx.y -= h;
}

export async function buildInspectionPdf(data: InspectionPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Inspection report — ${data.societyName} — ${monthLabel(data.period)}`);
  doc.setAuthor(COMPANY.brand);
  doc.setCreator(COMPANY.brand);
  doc.setCreationDate(data.generatedAt);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: 0, regular, bold };
  header(ctx);

  // Title
  text(ctx, "Motion sensor light — inspection report", M, ctx.y - 6, { size: 16, font: bold });
  ctx.y -= 22;
  text(ctx, `${monthLabel(data.period)} · Report ${data.id}`, M, ctx.y - 4, { size: 8.5, color: MUTED });
  ctx.y -= 20;

  // Visit details — two columns of label / value.
  const details: [string, string][] = [
    ["Society", data.societyName],
    ["Location", data.societyLocation ?? "—"],
    ["Area / circuit", data.area || "Whole society"],
    ["Inspected on", formatDateTime(data.inspectedAt)],
    ["Inspector", data.inspectorName],
    ["Inspector contact", data.inspectorContact],
  ];
  const colW = CONTENT_W / 2;
  for (let i = 0; i < details.length; i += 2) {
    const rowTop = ctx.y;
    let rowH = 0;
    for (let j = 0; j < 2 && i + j < details.length; j++) {
      const [label, value] = details[i + j];
      const x = M + j * colW;
      text(ctx, label.toUpperCase(), x, rowTop - 8, { size: 7, font: bold, color: MUTED });
      const lines = wrap(value, regular, 10, colW - 12);
      lines.forEach((l, k) => text(ctx, l, x, rowTop - 21 - k * 12, { size: 10 }));
      rowH = Math.max(rowH, 18 + lines.length * 12);
    }
    ctx.y -= rowH + 4;
  }

  // Summary figures.
  const faulty = data.findings.length;
  const pct = data.totalLightsChecked > 0 ? (faulty / data.totalLightsChecked) * 100 : 0;
  ctx.y -= 4;
  const tiles: [string, string][] = [
    ["Lights checked", data.totalLightsChecked.toLocaleString("en-IN")],
    ["Faulty / notable", String(faulty)],
    ["Faulty share", `${pct.toFixed(1)}%`],
  ];
  const tileW = (CONTENT_W - 16) / 3;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tileW + 8);
    ctx.page.drawRectangle({ x, y: ctx.y - 44, width: tileW, height: 44, borderColor: LINE, borderWidth: 0.8 });
    text(ctx, label.toUpperCase(), x + 10, ctx.y - 14, { size: 7, font: bold, color: MUTED });
    text(ctx, value, x + 10, ctx.y - 34, { size: 15, font: bold });
  });
  ctx.y -= 60;

  // Findings.
  text(ctx, "Faulty or notable fixtures", M, ctx.y - 8, { size: 11, font: bold });
  ctx.y -= 14;
  text(ctx, "Only fixtures needing attention are listed; every other light checked was working.", M, ctx.y - 8, { size: 8, color: MUTED });
  ctx.y -= 16;

  if (data.findings.length === 0) {
    ctx.page.drawRectangle({ x: M, y: ctx.y - 26, width: CONTENT_W, height: 26, borderColor: LINE, borderWidth: 0.8 });
    text(ctx, "No faulty fixtures found on this visit.", M + 10, ctx.y - 17, { size: 9.5 });
    ctx.y -= 34;
  } else {
    tableHeader(ctx);
    for (const f of data.findings) {
      const meta = SENSOR_STATUS_META[f.sensorStatus];
      const cells: Record<(typeof COLS)[number]["key"], string[]> = {
        sr: [String(f.srNo)],
        location: wrap(f.location, regular, ROW_SIZE, COLS[1].w - 2 * CELL_PAD),
        sensor: [meta.label],
        damage: [f.physicalDamage ? "Yes" : "—"],
        replace: [f.actionReplace ? "Replace" : "—"],
        remarks: wrap(f.remarks ?? "", regular, ROW_SIZE, COLS[5].w - 2 * CELL_PAD),
      };
      const lines = Math.max(...Object.values(cells).map((c) => c.length));
      const h = lines * ROW_LEAD + 8;
      if (ensure(ctx, h)) tableHeader(ctx);
      let x = M;
      for (const c of COLS) {
        const color =
          c.key === "sensor" ? (meta.tone === "bad" ? BAD : meta.tone === "warn" ? WARN : INK)
          : (c.key === "damage" && f.physicalDamage) || (c.key === "replace" && f.actionReplace) ? BAD
          : INK;
        const font = c.key === "sensor" || ((c.key === "damage" || c.key === "replace") && cells[c.key][0] !== "—") ? bold : regular;
        cells[c.key].forEach((l, k) => text(ctx, l, x + CELL_PAD, ctx.y - 12 - k * ROW_LEAD, { size: ROW_SIZE, font, color }));
        x += c.w;
      }
      ctx.y -= h;
      ctx.page.drawLine({ start: { x: M, y: ctx.y }, end: { x: PAGE_W - M, y: ctx.y }, thickness: 0.5, color: LINE });
    }
    ctx.y -= 12;
  }

  // Notes.
  if (data.notes && data.notes.trim()) {
    const lines = wrap(data.notes, regular, 9.5, CONTENT_W);
    ensure(ctx, 22 + lines.length * 12);
    text(ctx, "Notes", M, ctx.y - 8, { size: 11, font: bold });
    ctx.y -= 22;
    lines.forEach((l) => { text(ctx, l, M, ctx.y - 2, { size: 9.5 }); ctx.y -= 12; });
    ctx.y -= 8;
  }

  // Signatures — kept whole on one page.
  const sigH = 150;
  ensure(ctx, sigH);
  text(ctx, "Signatures", M, ctx.y - 8, { size: 11, font: bold });
  ctx.y -= 18;
  const boxW = (CONTENT_W - 12) / 2;
  const boxTop = ctx.y;
  const signBox = (x: number, title: string, name: string, nameIsBlank: boolean, stamp: boolean) => {
    ctx.page.drawRectangle({ x, y: boxTop - 124, width: boxW, height: 124, borderColor: LINE, borderWidth: 0.8 });
    text(ctx, title.toUpperCase(), x + 10, boxTop - 14, { size: 7, font: bold, color: MUTED });
    text(ctx, "Name", x + 10, boxTop - 32, { size: 8, color: MUTED });
    if (nameIsBlank) ctx.page.drawLine({ start: { x: x + 40, y: boxTop - 34 }, end: { x: x + boxW - 10, y: boxTop - 34 }, thickness: 0.6, color: LINE });
    else text(ctx, wrap(name, regular, 9.5, boxW - 52)[0], x + 40, boxTop - 32, { size: 9.5 });
    const lineW = stamp ? boxW - 100 : boxW - 20;
    text(ctx, "Signature", x + 10, boxTop - 74, { size: 8, color: MUTED });
    ctx.page.drawLine({ start: { x: x + 10, y: boxTop - 64 }, end: { x: x + 10 + lineW, y: boxTop - 64 }, thickness: 0.6, color: INK });
    text(ctx, "Date", x + 10, boxTop - 106, { size: 8, color: MUTED });
    ctx.page.drawLine({ start: { x: x + 10, y: boxTop - 96 }, end: { x: x + 10 + lineW, y: boxTop - 96 }, thickness: 0.6, color: INK });
    if (stamp) {
      ctx.page.drawRectangle({ x: x + boxW - 82, y: boxTop - 112, width: 72, height: 72, borderColor: LINE, borderWidth: 0.8, borderDashArray: [3, 2] });
      const label = "Society stamp";
      text(ctx, label, x + boxW - 46 - regular.widthOfTextAtSize(label, 7) / 2, boxTop - 80, { size: 7, color: MUTED });
    }
  };
  signBox(M, "Inspected by (FirsThing)", data.inspectorName, false, false);
  signBox(M + boxW + 12, "Society representative", data.societyRepName ?? "", !data.societyRepName, true);
  ctx.y = boxTop - 132;

  footers(ctx);

  return doc.save();
}

/** The download's file name: society, month, short id — safe for any OS. */
export function inspectionPdfFileName(societyName: string, period: string, id: string): string {
  const slug = societyName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${slug}_Inspection_${period}_${id.slice(-6)}.pdf`;
}
