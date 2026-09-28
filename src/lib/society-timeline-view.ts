import { formatDate } from "@/lib/format-date";
import {
  gapLabel,
  spanLabel,
  type Branch,
  type ChronologySummary,
  type EditRef,
  type Issue,
  type Step,
} from "@/lib/society-chronology";
import { encodeValue, TIMELINE_FIELDS, type TimelineField } from "@/lib/timeline-fields";

/**
 * The checked tree as plain, serialisable rows for the timeline's client
 * component (2026-09-28): every date already formatted through format-date,
 * every state already decided, so the browser only folds, filters and edits.
 */

export type RowState = "ok" | "bad" | "warn" | "none" | "info" | "later" | "record";

export type EditVM = {
  field: TimelineField;
  entityId: string;
  label: string;
  range: boolean;
  /** `YYYY-MM-DD` or `YYYY-MM-DD/YYYY-MM-DD`, as on record. */
  value: string | null;
  /** Can be changed by request after go-live. */
  live: boolean;
};

export type RequestVM = {
  id: string;
  from: string;
  to: string;
  reason: string;
  by: string;
  at: string;
  mine: boolean;
};

export type RequestCardData = {
  id: string;
  societyId: string;
  context: string;
  label: string;
  from: string;
  to: string;
  reason: string;
  by: string;
  at: string;
  warnings: string[];
  mine: boolean;
  /** The recorded date moved after this was asked — it can only be closed. */
  stale: boolean;
  status: string;
  statusLabel: string;
  decision: string | null;
};

export type RowVM = {
  id: string;
  label: string;
  state: RowState;
  dateText: string | null;
  endText: string | null;
  gap: string | null;
  chip: { text: string; tone: "ok" | "warn" | "bad" | "info" | "neu" } | null;
  messages: { tone: "bad" | "warn" | "info"; text: string }[];
  note: string | null;
  chain: { label: string; dateText: string | null; edit: EditVM | null }[];
  edit: EditVM | null;
  requests: RequestVM[];
};

export type BranchVM = {
  id: string;
  kind: Branch["kind"];
  title: string;
  name: string;
  meta: string | null;
  struck: string | null;
  counts: { bad: number; warn: number; missing: number };
  steps: RowVM[];
  children: BranchVM[];
  after: RowVM[];
};

const refKey = (e: EditRef) => `${e.field}|${e.entityId}`;

function editOf(e: EditRef | null | undefined, value: string | null): EditVM | null {
  if (!e) return null;
  const meta = TIMELINE_FIELDS[e.field];
  return { field: e.field, entityId: e.entityId, label: meta.label, range: meta.range, value, live: meta.live };
}

export function buildTimelineView(root: Branch, issues: Issue[], requests: Map<string, RequestVM[]>): BranchVM {
  const byStep = new Map<string, Issue[]>();
  for (const i of issues) byStep.set(i.stepId, [...(byStep.get(i.stepId) ?? []), i]);

  const rows = (steps: Step[]): RowVM[] => {
    let prev: Date | null = null;
    return steps.map((s) => {
      const mine = byStep.get(s.id) ?? [];
      const worst = mine.some((i) => i.severity === "error")
        ? "bad"
        : mine.some((i) => i.kind === "check")
          ? "warn"
          : mine.some((i) => i.kind === "missing")
            ? "none"
            : mine.some((i) => i.kind === "borrowed")
              ? "info"
              : null;
      const state: RowState = worst ?? (s.recordOnly && s.date ? "record" : s.date ? "ok" : "later");
      const span = s.end !== undefined ? spanLabel(s.date, s.end) : null;
      const gap = s.recordOnly ? null : gapLabel(prev, s.date);
      if (s.date && !s.recordOnly) prev = s.end ?? s.date;
      const chip =
        s.chip ??
        (state === "bad"
          ? { text: mine.some((i) => i.kind === "future") ? "In the future" : "Out of order", tone: "bad" as const }
          : state === "warn"
            ? { text: "Check", tone: "warn" as const }
            : state === "none"
              ? { text: "Not recorded", tone: "warn" as const }
              : state === "info"
                ? { text: "Borrowed date", tone: "info" as const }
                : null);
      const value = s.edit ? (TIMELINE_FIELDS[s.edit.field].range ? encodeValue(s.date, s.end ?? null) : encodeValue(s.date)) : null;
      const edits = [s.edit, ...(s.chain ?? []).map((c) => c.edit)].filter((e): e is EditRef => !!e);
      return {
        id: s.id,
        label: s.label,
        state,
        dateText: s.date ? `${s.borrowed ? "≈ " : ""}${formatDate(s.date)}` : null,
        endText: s.end ? formatDate(s.end) : null,
        gap: [span, gap].filter(Boolean).join(" · ") || null,
        chip,
        messages: mine.map((i) => ({ tone: i.severity === "error" ? "bad" : i.severity === "warning" ? "warn" : "info", text: i.message }) as const),
        note: [s.recordOnly, s.note].filter(Boolean).join(" ") || null,
        chain: (s.chain ?? []).map((c) => ({ label: c.label, dateText: c.date ? formatDate(c.date) : null, edit: editOf(c.edit, encodeValue(c.date)) })),
        edit: editOf(s.edit, value),
        requests: edits.flatMap((e) => requests.get(refKey(e)) ?? []),
      };
    });
  };

  const build = (b: Branch): BranchVM => {
    const steps = rows(b.steps);
    const after = rows(b.after ?? []);
    const children = b.children.map(build);
    const own = [...steps, ...after];
    const counts = {
      bad: own.filter((r) => r.state === "bad").length + children.reduce((n, c) => n + c.counts.bad, 0),
      warn: own.filter((r) => r.state === "warn").length + children.reduce((n, c) => n + c.counts.warn, 0),
      missing: own.filter((r) => r.state === "none").length + children.reduce((n, c) => n + c.counts.missing, 0),
    };
    return { id: b.id, kind: b.kind, title: b.title, name: b.name, meta: b.meta ?? null, struck: b.struck ?? null, counts, steps, children, after };
  };

  return build(root);
}

/** The bar at the top, worded like the rows it counts. */
export function summaryLine(s: ChronologySummary): { tone: "ok" | "warn" | "bad"; headline: string } {
  const bad = s.order + s.future;
  if (bad > 0) {
    return { tone: "bad", headline: `${bad} ${bad === 1 ? "date is" : "dates are"} out of order${s.future ? " or in the future" : ""}` };
  }
  if (s.check + s.missing > 0) {
    const n = s.check + s.missing;
    return { tone: "warn", headline: `${n} ${n === 1 ? "date needs" : "dates need"} a look` };
  }
  return {
    tone: "ok",
    headline: `All ${s.inOrder} dates are in order${s.notReached ? ` · ${s.notReached} not yet reached` : ""}`,
  };
}

export { refKey };
