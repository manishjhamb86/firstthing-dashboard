import { istWallClock } from "@/lib/field-today";

/**
 * The monthly close desk (2026-11-18, user-specified): for each society and
 * month, publish the savings report, release the bill, then email both. The
 * rules are pure here so the list, the society page and the actions read one
 * answer about where a society stands.
 *
 * Order, the user's: report → bill → email. The email opens only once the
 * bill is released and no report is left unpublished — "share both" means
 * both are final before anything leaves FirsThing.
 */

/** Where the month's savings reports stand across a society's circuits. */
export type ReportState = "none" | "draft" | "partial" | "published";
/** Where the month's bill stands. */
export type BillState = "not_fetched" | "to_review" | "awaiting_release" | "released";
export type CloseStage = "report" | "bill" | "email" | "done";

export function reportState(circuitsWithDays: number, circuitsPublished: number): ReportState {
  if (circuitsWithDays === 0) return "none";
  if (circuitsPublished === 0) return "draft";
  return circuitsPublished >= circuitsWithDays ? "published" : "partial";
}

export function emailReady(report: ReportState, bill: BillState): boolean {
  return bill === "released" && (report === "published" || report === "none");
}

/** The next thing to do for a society this month. */
export function closeStage(i: { report: ReportState; bill: BillState; emailed: boolean }): CloseStage {
  if (i.report === "draft" || i.report === "partial") return "report";
  if (i.bill !== "released") return "bill";
  if (!i.emailed) return "email";
  return "done";
}

/** The month a close is normally for: the calendar month that has just ended, in India's time. */
export function defaultClosePeriod(now: Date = new Date()): string {
  const wall = istWallClock(now);
  const y = wall.getUTCFullYear();
  const m = wall.getUTCMonth(); // 0-based: this is already "last month" as a 1-based number
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, "0")}`;
}

export const MONTHLY_CLOSE_TEMPLATE_KEY = "monthly_close";

/** The fill-in words, each with what it becomes. */
export const TEMPLATE_WORDS = {
  society: "Society name",
  month: "The billed month, e.g. October 2026",
  savings_pct: "Savings this month, %",
  saved_rupees: "Saved this month, ₹",
  saved_kwh: "Energy saved, kWh",
  invoice_no: "Invoice number",
  invoice_total: "Invoice total, ₹",
  due_date: "Invoice due date",
} as const;
export type TemplateWord = keyof typeof TEMPLATE_WORDS;

export const DEFAULT_MONTHLY_CLOSE_TEMPLATE = {
  subject: "{society} — {month} savings report and invoice",
  body:
    "Dear {society} committee,\n\n" +
    "Please find attached your savings report and invoice for {month}.\n\n" +
    "This month your common-area lighting used {savings_pct} less electricity than before FirsThing — {saved_kwh} saved, worth {saved_rupees}. " +
    "Invoice {invoice_no} for {invoice_total} is due on {due_date}.\n\n" +
    "Both documents are also on your society portal under Documents and Billing.\n\n" +
    "Warm regards,\nTeam FirsThing\ninfo@firsthing.earth",
};

const WORD_RE = /\{([a-z_]+)\}/g;

/** Words in braces that are not fill-in words — refused on save, so a typo never reaches a society as "{socety}". */
export function unknownWords(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(WORD_RE)) if (!(m[1] in TEMPLATE_WORDS)) out.add(m[1]);
  return [...out];
}

/** Fill the words; a word with no value this month reads "—" rather than leaving the brace in the email. */
export function fillTemplate(text: string, values: Partial<Record<TemplateWord, string | null>>): string {
  return text.replace(WORD_RE, (whole, k: string) => {
    if (!(k in TEMPLATE_WORDS)) return whole;
    const v = values[k as TemplateWord];
    return v === null || v === undefined || v === "" ? "—" : v;
  });
}

export function refuseTemplate(subject: string, body: string): string | null {
  if (!subject.trim()) return "The subject cannot be empty.";
  if (!body.trim()) return "The message cannot be empty.";
  if (subject.length > 200) return "Keep the subject under 200 characters.";
  if (body.length > 10_000) return "Keep the message under 10,000 characters.";
  const bad = unknownWords(subject + "\n" + body);
  if (bad.length) return `Not a fill-in word: ${bad.map((w) => `{${w}}`).join(", ")}. Use only the words listed.`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Recipients, trimmed, lower-cased, deduplicated, and only real-looking addresses. */
export function cleanRecipients(list: string[]): string[] {
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
}

/** Plain text → simple HTML paragraphs, escaped. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
