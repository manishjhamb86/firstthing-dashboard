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
 */
export type LightCountHistoryEntry = {
  at: string;
  reason: string | null;
  demoFrom: number | null;
  demoTo: number | null;
  fullFrom: number | null;
  fullTo: number | null;
  /** The underlying `ChangeLog` row id(s) this entry was built from — one, or two for a paired correction. What `setLightHistoryExcluded`/`deleteLightHistoryEntries` act on. */
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
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const SELECT = { id: true, at: true, entity: true, oldValue: true, newValue: true, reason: true, demoId: true, excludedAt: true, excludedReason: true } as const;

export async function circuitLightCountHistory(circuitId: string): Promise<LightCountHistoryEntry[]> {
  const rows = await db.changeLog.findMany({
    where: {
      circuitId,
      OR: [
        { entity: "circuit_demo", field: "meteredLightCount" },
        { entity: "circuit", field: "representedLightCount" },
      ],
    },
    orderBy: { at: "desc" },
    select: SELECT,
  });
  return pair(rows).map((p) => p.entry);
}

/** The same, for several circuits at once — one query, not one per circuit. */
export async function circuitLightCountHistoryByCircuit(circuitIds: string[]): Promise<Map<string, LightCountHistoryEntry[]>> {
  if (circuitIds.length === 0) return new Map();
  const rows = await db.changeLog.findMany({
    where: {
      circuitId: { in: circuitIds },
      OR: [
        { entity: "circuit_demo", field: "meteredLightCount" },
        { entity: "circuit", field: "representedLightCount" },
      ],
    },
    orderBy: { at: "desc" },
    select: { ...SELECT, circuitId: true },
  });
  const byCircuit = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.circuitId) continue;
    byCircuit.set(r.circuitId, [...(byCircuit.get(r.circuitId) ?? []), r]);
  }
  const out = new Map<string, LightCountHistoryEntry[]>();
  for (const [circuitId, circuitRows] of byCircuit) out.set(circuitId, pair(circuitRows).map((p) => p.entry));
  return out;
}

/**
 * "The demo's count was corrected 40 → 44 — the full installation moved
 * 911 → 907 the other way, so the total installed stayed at 951." The one
 * sentence every screen uses, so the admin side and the portal never say
 * this two different ways.
 */
export function describeLightCountChange(e: LightCountHistoryEntry): string {
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
 * only handling exactly two. `entries` is newest-first, matching every
 * caller's existing convention; returned in the same order.
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
