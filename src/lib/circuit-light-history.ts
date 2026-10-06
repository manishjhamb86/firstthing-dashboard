import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";

/**
 * The circuit's full-installation/demo split, as a history (2026-10-05,
 * user-asked: "if number of lights changed on any demo circuit... in
 * inventory tab it should reflect the same... with proper history when it
 * was changed, so user have clear picture").
 *
 * A correction to the demo's own count and the compensating move of the
 * full installation are always written in the SAME transaction
 * (`setDemoLightCount`, `correctLockedCount`) and carry the same `demoId` —
 * but NOT the same `at` instant: verified directly against Postgres
 * (2026-10-05) that Prisma's `@default(now())` is evaluated per statement,
 * not shared across a transaction the way the database's own `now()`
 * would be, so the two rows land tens of milliseconds apart. Paired here by
 * walking each demoId's own rows in chronological order instead: a
 * `circuit` row always immediately follows the `circuit_demo` row it
 * belongs to, before the next `circuit_demo` row for that same demo.
 *
 * A SECOND, separate source feeds the same history (2026-10-06, user-asked:
 * "have you made the changes to show the history of light count changed
 * here? in a way customer understands"): `BenchmarkRescaleEvent` (INV-07) —
 * a genuine, verified change in how many lights are on the metered circuit
 * itself, not a correction of a typing mistake. It has its own phrasing
 * ("changed", not "corrected" — nothing was wrong before) and is dated by
 * its EFFECTIVE date, not when it was typed in, since that's the date a
 * resident would actually recognise ("changed 34 → 76 on 01-Sep-2026").
 * Only live (non-voided) events are read — a voided entry already carries
 * no weight in the replay, and showing it as "history" would misstate what
 * actually happened.
 */
export type LightCountHistoryEntry = {
  at: string;
  kind: "correction" | "rescale";
  reason: string | null;
  demoFrom: number | null;
  demoTo: number | null;
  fullFrom: number | null;
  fullTo: number | null;
  /** The underlying row id(s) this entry was built from. What `setLightHistoryExcluded`/`deleteLightHistoryEntries` act on — only meaningful for `kind: "correction"`; a rescale entry's own lifecycle (void/correct) lives on the circuit's rescale panel instead. */
  ids: string[];
  /** Set when an operator has hidden this entry from the customer-facing read — see `filterCustomerRelevant`. */
  excludedAt: string | null;
  excludedReason: string | null;
};

type Row = {
  id: string;
  at: Date;
  entity: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  demoId: string | null;
  excludedAt: Date | null;
  excludedReason: string | null;
};

const num = (v: unknown): number | null => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v));

function toEntry(demoRow: Row | null, circuitRow: Row | null): LightCountHistoryEntry {
  const at = circuitRow?.at ?? demoRow?.at;
  const ids = [demoRow?.id, circuitRow?.id].filter((x): x is string => !!x);
  const excludedAt = demoRow?.excludedAt ?? circuitRow?.excludedAt ?? null;
  return {
    at: at ? formatDate(at) : "",
    kind: "correction",
    reason: circuitRow?.reason ?? demoRow?.reason ?? null,
    demoFrom: demoRow ? num(demoRow.oldValue) : null,
    demoTo: demoRow ? num(demoRow.newValue) : null,
    fullFrom: circuitRow ? num(circuitRow.oldValue) : null,
    fullTo: circuitRow ? num(circuitRow.newValue) : null,
    ids,
    excludedAt: excludedAt ? formatDate(excludedAt) : null,
    excludedReason: demoRow?.excludedReason ?? circuitRow?.excludedReason ?? null,
  };
}

function pair(rows: Row[]): { at: Date; entry: LightCountHistoryEntry }[] {
  const byDemo = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.demoId ?? "";
    byDemo.set(key, [...(byDemo.get(key) ?? []), r]);
  }
  const out: { at: Date; entry: LightCountHistoryEntry }[] = [];
  for (const group of byDemo.values()) {
    const sorted = [...group].sort((a, b) => a.at.getTime() - b.at.getTime());
    let current: Row | null = null;
    for (const r of sorted) {
      if (r.entity === "circuit_demo") {
        if (current) out.push({ at: current.at, entry: toEntry(current, null) });
        current = r;
      } else {
        out.push({ at: r.at, entry: toEntry(current, r) });
        current = null;
      }
    }
    if (current) out.push({ at: current.at, entry: toEntry(current, null) });
  }
  return out;
}

type RescaleRow = {
  id: string;
  circuitId: string;
  previousLightCount: number;
  newLightCount: number;
  verificationNote: string;
  effectiveDate: Date;
};

function rescaleToEntry(r: RescaleRow): { at: Date; entry: LightCountHistoryEntry } {
  return {
    at: r.effectiveDate,
    entry: {
      at: formatDate(r.effectiveDate),
      kind: "rescale",
      reason: r.verificationNote,
      demoFrom: r.previousLightCount,
      demoTo: r.newLightCount,
      fullFrom: null,
      fullTo: null,
      ids: [r.id],
      excludedAt: null,
      excludedReason: null,
    },
  };
}

const SELECT = { id: true, at: true, entity: true, oldValue: true, newValue: true, reason: true, demoId: true, excludedAt: true, excludedReason: true } as const;
const RESCALE_SELECT = { id: true, circuitId: true, previousLightCount: true, newLightCount: true, verificationNote: true, effectiveDate: true } as const;

export async function circuitLightCountHistory(circuitId: string): Promise<LightCountHistoryEntry[]> {
  const [rows, rescales] = await Promise.all([
    db.changeLog.findMany({
      where: {
        circuitId,
        OR: [
          { entity: "circuit_demo", field: "meteredLightCount" },
          { entity: "circuit", field: "representedLightCount" },
        ],
      },
      select: SELECT,
    }),
    db.benchmarkRescaleEvent.findMany({ where: { circuitId, voidedAt: null }, select: RESCALE_SELECT }),
  ]);
  const combined = [...pair(rows), ...rescales.map(rescaleToEntry)];
  return combined.sort((a, b) => b.at.getTime() - a.at.getTime()).map((p) => p.entry);
}

/** The same, for several circuits at once — one query per source, not one per circuit. */
export async function circuitLightCountHistoryByCircuit(circuitIds: string[]): Promise<Map<string, LightCountHistoryEntry[]>> {
  if (circuitIds.length === 0) return new Map();
  const [rows, rescales] = await Promise.all([
    db.changeLog.findMany({
      where: {
        circuitId: { in: circuitIds },
        OR: [
          { entity: "circuit_demo", field: "meteredLightCount" },
          { entity: "circuit", field: "representedLightCount" },
        ],
      },
      select: { ...SELECT, circuitId: true },
    }),
    db.benchmarkRescaleEvent.findMany({ where: { circuitId: { in: circuitIds }, voidedAt: null }, select: RESCALE_SELECT }),
  ]);
  const byCircuit = new Map<string, { at: Date; entry: LightCountHistoryEntry }[]>();
  const push = (circuitId: string | null, item: { at: Date; entry: LightCountHistoryEntry }) => {
    if (!circuitId) return;
    byCircuit.set(circuitId, [...(byCircuit.get(circuitId) ?? []), item]);
  };

  const byDemoRows = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.circuitId ?? "";
    byDemoRows.set(key, [...(byDemoRows.get(key) ?? []), r]);
  }
  for (const [circuitId, circuitRows] of byDemoRows) for (const item of pair(circuitRows)) push(circuitId, item);
  for (const r of rescales) push(r.circuitId, rescaleToEntry(r));

  const out = new Map<string, LightCountHistoryEntry[]>();
  for (const [circuitId, items] of byCircuit) out.set(circuitId, items.sort((a, b) => b.at.getTime() - a.at.getTime()).map((p) => p.entry));
  return out;
}

/**
 * "The demo's count was corrected 40 → 44 — the full installation moved
 * 911 → 907 the other way, so the total installed stayed at 951." The one
 * sentence every screen uses, so the admin side and the portal never say
 * this two different ways. A verified rescale reads differently — "changed",
 * never "corrected": nothing about the earlier count was wrong, the circuit
 * genuinely carries a different count now.
 */
export function describeLightCountChange(e: LightCountHistoryEntry): string {
  if (e.kind === "rescale" && e.demoFrom !== null && e.demoTo !== null) {
    return `The light count on this circuit changed ${e.demoFrom} → ${e.demoTo}${e.reason ? ` — ${e.reason}` : ""}.`;
  }
  if (e.demoFrom !== null && e.demoTo !== null && e.fullFrom !== null && e.fullTo !== null) {
    const total = e.demoTo + e.fullTo;
    return `The demo's count was corrected ${e.demoFrom} → ${e.demoTo} — the full installation moved ${e.fullFrom} → ${e.fullTo} the other way, so the total installed stayed at ${total.toLocaleString("en-IN")}.`;
  }
  if (e.demoFrom !== null && e.demoTo !== null) return `The demo's count was corrected ${e.demoFrom} → ${e.demoTo}.`;
  if (e.fullFrom !== null && e.fullTo !== null) return `The full installation was corrected ${e.fullFrom} → ${e.fullTo}.`;
  return "A correction was recorded.";
}

/** Does `later` exactly undo `earlier` — the same field(s), reversed? */
function isExactReversal(earlier: LightCountHistoryEntry, later: LightCountHistoryEntry): boolean {
  if (earlier.demoFrom === null || earlier.demoTo === null || later.demoFrom === null || later.demoTo === null) return false;
  if (!(later.demoFrom === earlier.demoTo && later.demoTo === earlier.demoFrom)) return false;
  // When both sides carry the paired full-installation move too, it must
  // reverse the identical way — never call two corrections of different
  // shapes "the same mistake undone" just because their demo figures match.
  const earlierPaired = earlier.fullFrom !== null && earlier.fullTo !== null;
  const laterPaired = later.fullFrom !== null && later.fullTo !== null;
  if (earlierPaired !== laterPaired) return false;
  if (earlierPaired && laterPaired) return later.fullFrom === earlier.fullTo && later.fullTo === earlier.fullFrom;
  return true;
}

/**
 * Collapses an exact back-and-forth out of what a CUSTOMER sees (2026-10-06,
 * user-caught: two real corrections, five minutes apart, that exactly
 * cancelled — 34 → 76, then 76 → 34 — read as nonsensical junk on the
 * portal: nothing the resident can check ever actually moved, and showing
 * "it was 76 for a while" when it never meaningfully was is worse than
 * showing nothing). Still visible to operations on the admin side, which
 * reads the raw, unfiltered history — this only filters the customer read.
 *
 * A manually excluded entry (`excludedAt`, the backend's own fallback for
 * whatever this automatic rule doesn't catch) is dropped outright too.
 *
 * General on purpose: a chain of several cancelling corrections collapses
 * in one pass via a stack, the same way matched parentheses do, rather than
 * only handling exactly two — and it is kind-agnostic, so a correction and a
 * rescale that happen to exactly reverse each other cancel too. `entries` is
 * newest-first, matching every caller's existing convention; returned in the
 * same order.
 */
export function filterCustomerRelevant(entries: LightCountHistoryEntry[]): LightCountHistoryEntry[] {
  const notExcluded = entries.filter((e) => e.excludedAt === null);
  const ascending = [...notExcluded].reverse(); // oldest-first, to walk the real sequence of events
  const stack: LightCountHistoryEntry[] = [];
  for (const entry of ascending) {
    const top = stack[stack.length - 1];
    if (top && isExactReversal(top, entry)) {
      stack.pop(); // the pair cancels — neither is relevant to a customer
      continue;
    }
    stack.push(entry);
  }
  return stack.reverse();
}
