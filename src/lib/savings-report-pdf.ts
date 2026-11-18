import { PDFDocument, StandardFonts } from "pdf-lib";
import { COMPANY } from "./company";
import { monthLabel } from "./format-date";
import type { SavingsReportSnapshot } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/report-data";
import { BAD, CONTENT_W, INK, LINE, M, MUTED, PAGE_H, PAGE_W, SOFT, ensure, footers, header, newPage, text, wrap, type Ctx } from "./pdf-kit";

/**
 * The month's savings report as a PDF, for the monthly-close email
 * (2026-11-18). Built from the PUBLISHED snapshots — the frozen copies the
 * society reads on its portal — so the attachment and the portal can never
 * disagree. One section per circuit, each starting on its own page.
 */

const num = (n: number | null, d = 2) => (n === null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};

function circuitSection(ctx: Ctx, s: SavingsReportSnapshot) {
  const { regular, bold } = ctx;
  text(ctx, "Monthly savings report", M, ctx.y - 6, { size: 16, font: bold });
  const month = monthLabel(s.month);
  text(ctx, month, PAGE_W - M - bold.widthOfTextAtSize(month, 14), ctx.y - 6, { size: 14, font: bold });
  ctx.y -= 24;
  text(ctx, s.societyName, M, ctx.y - 4, { size: 12, font: bold });
  ctx.y -= 16;
  for (const line of wrap(`${s.societyLocation} · ${s.circuitLabel} circuit · ${s.meteredLightCount.toLocaleString("en-IN")} metered lights`, regular, 9, CONTENT_W)) {
    text(ctx, line, M, ctx.y - 4, { size: 9, color: MUTED });
    ctx.y -= 12;
  }
  ctx.y -= 10;

  const counted = s.days.filter((d) => !d.excluded).length;
  const tiles: [string, string][] = [
    ["Verified savings", s.summary.savingsPct === null ? "—" : `${num(s.summary.savingsPct, 1)}%`],
    ["Average use, kWh/day", num(s.summary.averageKwh)],
    ["Before FirsThing, kWh/day", num(s.baselineKwhPerDay)],
    ["Days counted", `${counted} of ${s.days.length}`],
  ];
  const tileW = (CONTENT_W - 24) / 4;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tileW + 8);
    ctx.page.drawRectangle({ x, y: ctx.y - 46, width: tileW, height: 46, borderColor: LINE, borderWidth: 0.8 });
    text(ctx, label.toUpperCase(), x + 8, ctx.y - 14, { size: 6.5, font: bold, color: MUTED });
    text(ctx, value, x + 8, ctx.y - 35, { size: 14, font: bold });
  });
  ctx.y -= 58;

  if (s.benchmarkSavingsPct !== null) {
    // Both figures, no verdict: whether a month is in band depends on the
    // contract's tolerance, which the billing run judges — not this page.
    text(ctx, `Agreed saving ${num(s.benchmarkSavingsPct, 2)}% · this month ${s.summary.savingsPct === null ? "—" : `${num(s.summary.savingsPct, 1)}%`}`, M, ctx.y - 4, { size: 9.5, color: MUTED });
    ctx.y -= 18;
  }

  if (s.fee) {
    const rows: [string, string][] = [
      ["Saved this month", inr(s.fee.savedValue)],
      ["FirsThing fee (this circuit)", inr(s.fee.amount)],
      ["Society keeps", inr(s.fee.societyNet)],
    ];
    ctx.page.drawRectangle({ x: M, y: ctx.y - 16 * rows.length - 10, width: CONTENT_W, height: 16 * rows.length + 10, color: SOFT });
    rows.forEach(([l, v], i) => {
      const y = ctx.y - 16 - i * 16;
      text(ctx, l, M + 10, y, { size: 9.5 });
      text(ctx, v, PAGE_W - M - 10 - (i === 2 ? bold : regular).widthOfTextAtSize(v, 9.5), y, { size: 9.5, font: i === 2 ? bold : regular });
    });
    ctx.y -= 16 * rows.length + 22;
  }

  // Day by day, in two columns so a 31-day month stays on one page.
  const half = Math.ceil(s.days.length / 2);
  const rowH = 13;
  ensure(ctx, 34 + half * rowH + 10);
  text(ctx, "Day by day", M, ctx.y - 6, { size: 11, font: bold });
  ctx.y -= 18;
  const colW = (CONTENT_W - 16) / 2;
  const cols = [s.days.slice(0, half), s.days.slice(half)];
  const head = (x: number) => {
    ctx.page.drawRectangle({ x, y: ctx.y - 14, width: colW, height: 14, color: SOFT });
    text(ctx, "DATE", x + 6, ctx.y - 10, { size: 6.5, font: bold, color: MUTED });
    text(ctx, "KWH", x + 90, ctx.y - 10, { size: 6.5, font: bold, color: MUTED });
    text(ctx, "SAVING", x + 150, ctx.y - 10, { size: 6.5, font: bold, color: MUTED });
  };
  head(M);
  head(M + colW + 16);
  ctx.y -= 16;
  const top = ctx.y;
  cols.forEach((list, ci) => {
    const x = M + ci * (colW + 16);
    list.forEach((d, i) => {
      const y = top - 10 - i * rowH;
      const color = d.excluded ? MUTED : INK;
      text(ctx, dayLabel(d.date), x + 6, y, { size: 8.5, color });
      text(ctx, num(d.kWh), x + 90, y, { size: 8.5, color });
      const saving = d.excluded ? "not counted" : d.savingsPct === null ? "—" : `${num(d.savingsPct, 1)}%`;
      text(ctx, saving, x + 150, y, { size: 8.5, color: d.excluded ? MUTED : d.savingsPct !== null && d.savingsPct < 55 ? BAD : INK });
    });
  });
  ctx.y = top - half * rowH - 8;

  const excluded = s.days.filter((d) => d.excluded);
  if (excluded.length) {
    const note = `${excluded.length} day${excluded.length === 1 ? "" : "s"} not counted (a meter offline, or readings missing for part of the day) — they are left out of the average.`;
    for (const line of wrap(note, regular, 8, CONTENT_W)) {
      text(ctx, line, M, ctx.y - 6, { size: 8, color: MUTED });
      ctx.y -= 11;
    }
  }
}

export async function buildSavingsReportPdf(snapshots: SavingsReportSnapshot[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const first = snapshots[0];
  doc.setTitle(first ? `Savings report — ${first.societyName} — ${monthLabel(first.month)}` : "Savings report");
  doc.setAuthor(COMPANY.brand);
  doc.setCreator(COMPANY.brand);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: 0, regular, bold };
  header(ctx);
  snapshots.forEach((s, i) => {
    if (i > 0) newPage(ctx);
    circuitSection(ctx, s);
  });
  footers(ctx);
  return doc.save();
}

export function savingsReportFileName(societyName: string, period: string): string {
  const slug = societyName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${slug}_Savings_Report_${period}.pdf`;
}
