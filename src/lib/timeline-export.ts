import type { Branch, Issue, Step } from "@/lib/society-chronology";
import { formatDate } from "@/lib/format-date";

/**
 * One row per recorded date, across every society (2026-09-30, user-asked:
 * "export/download the timelines as a csv/excelsheet... all the societies
 * each circuit in a sheet"). Reuses the same tree `society-timeline-loader.ts`
 * builds and the same `checkSocietyChronology` the timeline pages already
 * check, so a downloaded row can never disagree with what the app itself
 * shows for that step — no second date-resolution path to drift from it.
 *
 * Long format rather than one row per circuit with fixed date columns: a
 * circuit's own step set varies with how many demos it has run, and a fixed
 * column list would either truncate a circuit with three demos or leave a
 * forest of empty cells for one with a single, unremarkable demo. Sorted or
 * pivoted by "Circuit" in Excel, this reads exactly as "each circuit in a
 * sheet" asks — grouped together, every one of its own dates in one place.
 */
export type TimelineExportRow = {
  society: string;
  serviceLine: string;
  deal: string;
  circuit: string;
  step: string;
  date: string;
  status: string;
  note: string;
};

type Ctx = { serviceLine: string; deal: string; circuit: string; prefix: string };

function noteFor(s: Step, issues: Issue[]): { status: string; note: string } {
  const notes: string[] = [];
  if (s.recordOnly) notes.push(`Record time: ${s.recordOnly}`);
  if (s.borrowed) notes.push(`Taken from: ${s.borrowed}`);
  if (s.note) notes.push(s.note);
  const mine = issues.filter((i) => i.stepId === s.id);
  const worst = mine.find((i) => i.severity === "error") ?? mine.find((i) => i.severity === "warning") ?? mine[0];
  const status = worst
    ? worst.severity === "error"
      ? "Out of order"
      : worst.severity === "warning"
        ? "To check"
        : "Note"
    : s.date === null
      ? s.expected
        ? "Not recorded"
        : ""
      : "In order";
  for (const i of mine) notes.push(i.message);
  return { status, note: notes.join(" · ") };
}

function rowsForStep(societyName: string, ctx: Ctx, s: Step, issues: Issue[]): TimelineExportRow[] {
  const { status, note } = noteFor(s, issues);
  const label = `${ctx.prefix}${s.label}`;
  const rows: TimelineExportRow[] = [
    {
      society: societyName,
      serviceLine: ctx.serviceLine,
      deal: ctx.deal,
      circuit: ctx.circuit,
      step: label,
      date: s.date ? formatDate(s.date) : "",
      status,
      note,
    },
  ];
  if (s.end) {
    rows.push({
      society: societyName,
      serviceLine: ctx.serviceLine,
      deal: ctx.deal,
      circuit: ctx.circuit,
      step: `${label} — end`,
      date: formatDate(s.end),
      status: "",
      note: "",
    });
  }
  return rows;
}

function walk(societyName: string, b: Branch, ctx: Ctx, issues: Issue[], out: TimelineExportRow[]) {
  const next: Ctx = { ...ctx };
  // `title` is the branch KIND's fixed label ("Service line", "Deal",
  // "Circuit") on every branch of that kind — the actual name (Lighting,
  // Basement B1, Basement) is always `name`.
  if (b.kind === "line") next.serviceLine = b.name;
  if (b.kind === "deal") next.deal = b.name;
  if (b.kind === "circuit") {
    next.circuit = b.name;
    next.prefix = "";
  }
  if (b.kind === "demo") next.prefix = `${b.title}: `;
  if (b.kind === "billing") next.prefix = "";

  const struckNote = b.struck ? ` (${b.struck})` : "";
  for (const s of b.steps) {
    for (const r of rowsForStep(societyName, next, s, issues)) {
      out.push(struckNote ? { ...r, note: r.note ? `${r.note}${struckNote}` : b.struck ?? "" } : r);
    }
  }
  for (const c of b.children) walk(societyName, c, next, issues, out);
  for (const s of b.after ?? []) out.push(...rowsForStep(societyName, next, s, issues));
}

export function flattenTimelineForExport(societyName: string, root: Branch, issues: Issue[]): TimelineExportRow[] {
  const out: TimelineExportRow[] = [];
  walk(societyName, root, { serviceLine: "", deal: "", circuit: "", prefix: "" }, issues, out);
  return out;
}

const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function rowsToCsv(rows: TimelineExportRow[]): string {
  const header = ["Society", "Service line", "Deal", "Circuit", "Step", "Date", "Status", "Note"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.society, r.serviceLine, r.deal, r.circuit, r.step, r.date, r.status, r.note].map(csvField).join(","),
    );
  }
  // \r\n and a leading BOM: Excel reads UTF-8 correctly only with one.
  return "﻿" + lines.join("\r\n");
}
