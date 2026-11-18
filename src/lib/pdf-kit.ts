import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { COMPANY } from "./company";

/**
 * The shared pieces of every PDF this app generates (2026-11-18): A4 page
 * geometry, the palette, WinAnsi-safe text, wrapping, the letterhead and the
 * footer. The inspection report and the monthly savings report both build
 * on it, so the two documents carry one letterhead.
 */
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const M = 40;
export const CONTENT_W = PAGE_W - 2 * M;
export const FOOTER_H = 34;

export const INK = rgb(0.11, 0.13, 0.16);
export const MUTED = rgb(0.38, 0.41, 0.46);
export const LINE = rgb(0.8, 0.82, 0.85);
export const SOFT = rgb(0.95, 0.96, 0.97);
export const BRAND = rgb(0x2e / 255, 0x9e / 255, 0x68 / 255);
export const LIME = rgb(0xb8 / 255, 0xe2 / 255, 0x3f / 255);
export const BAD = rgb(0.72, 0.16, 0.16);
export const WARN = rgb(0.64, 0.42, 0.04);

const REPLACEMENTS: Record<string, string> = {
  "₹": "Rs.",
  "→": "->",
  "←": "<-",
  "≤": "<=",
  "≥": ">=",
  "×": "x",
  " ": " ",
};

/** Make a string drawable in a WinAnsi standard font — known look-alikes first, then "?" for anything else. */
export function safe(text: string, font: PDFFont): string {
  const allowed = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.replace(/\r?\n/g, " ")) {
    const mapped = REPLACEMENTS[ch] ?? ch;
    for (const c of mapped) out += allowed.has(c.codePointAt(0)!) ? c : "?";
  }
  return out;
}

/** Break text into lines no wider than `width`, breaking a single over-long word if it has to. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text, font).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  for (let word of words) {
    while (!fits(word)) {
      // An unbroken run wider than the column: cut it rather than overflow.
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut -= 1;
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

export type Ctx = { doc: PDFDocument; page: PDFPage; y: number; regular: PDFFont; bold: PDFFont };

export function text(ctx: Ctx, s: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) {
  const font = opts.font ?? ctx.regular;
  ctx.page.drawText(safe(s, font), { x, y, size: opts.size ?? 9.5, font, color: opts.color ?? INK });
}

export function drawLogo(page: PDFPage, x: number, top: number, size: number) {
  const s = size / 100;
  // The FT monogram (src/app/icon.svg), drawn as vectors so it is crisp at any zoom.
  page.drawSvgPath("M 26 6 L 74 6 Q 94 6 94 26 L 94 74 Q 94 94 74 94 L 26 94 Q 6 94 6 74 L 6 26 Q 6 6 26 6 Z", { x, y: top, scale: s, color: BRAND });
  const stroke = { x, y: top, scale: s, borderColor: rgb(1, 1, 1), borderWidth: 9, borderLineCap: 1 as const };
  page.drawSvgPath("M 36 36 L 36 67 M 36 36 L 67 36 M 36 52 L 53 52", stroke);
  page.drawSvgPath("M 60 36 L 60 67", stroke);
  page.drawCircle({ x: x + 60 * s, y: top - 23 * s, size: 8.5 * s, color: LIME });
}

export function header(ctx: Ctx) {
  const top = PAGE_H - M;
  drawLogo(ctx.page, M, top + 2, 30);
  text(ctx, COMPANY.brand, M + 38, top - 13, { size: 13, font: ctx.bold });
  text(ctx, COMPANY.legalName, M + 38, top - 26, { size: 8.5, color: MUTED });
  const right = (s: string, y: number, size: number, font = ctx.regular, color = MUTED) => {
    const w = font.widthOfTextAtSize(safe(s, font), size);
    text(ctx, s, PAGE_W - M - w, y, { size, font, color });
  };
  right(COMPANY.website, top - 13, 8.5);
  right(COMPANY.email, top - 26, 8.5);
  ctx.page.drawLine({ start: { x: M, y: top - 36 }, end: { x: PAGE_W - M, y: top - 36 }, thickness: 1.2, color: BRAND });
  ctx.y = top - 52;
}

export function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  header(ctx);
}

/** Start a new page unless `needed` points still fit above the footer. */
export function ensure(ctx: Ctx, needed: number): boolean {
  if (ctx.y - needed >= M + FOOTER_H) return false;
  newPage(ctx);
  return true;
}


/** The footer on every page: company line, address, page number. Call once the document is complete. */
export function footers(ctx: Ctx) {
  const pages = ctx.doc.getPages();
  pages.forEach((p, i) => {
    const pageCtx: Ctx = { ...ctx, page: p };
    p.drawLine({ start: { x: M, y: M + 22 }, end: { x: PAGE_W - M, y: M + 22 }, thickness: 0.5, color: LINE });
    text(pageCtx, `${COMPANY.brand} | ${COMPANY.legalName} | ${COMPANY.website} | ${COMPANY.email}`, M, M + 11, { size: 7, color: MUTED });
    if (COMPANY.address) text(pageCtx, wrap(COMPANY.address, ctx.regular, 7, CONTENT_W - 60)[0], M, M + 1, { size: 7, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    text(pageCtx, n, PAGE_W - M - ctx.regular.widthOfTextAtSize(n, 7), M + 11, { size: 7, color: MUTED });
  });
}
