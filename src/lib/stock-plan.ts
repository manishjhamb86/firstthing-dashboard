// Stock workflow rules (2026-11-23) — plan, buy, issue, install, return.
// Pure, one place; the loaders and actions are DB shells around these.
//
// The user's calls:
//  - Lights are required from the deal; every other item is typed by hand
//    (a typed line for a light replaces the deal figure).
//  - Stock received against a purchase requirement is NOT reserved for the
//    society it was ordered for — the requirement only shows it as on order.
//  - Issued stock sits in the employee's custody until installed at the
//    society or returned to an office.

export type PlanNeed = {
  societyId: string;
  itemTypeId: string;
  required: number;
  installed: number;
  withCrews: number;
  onOrder: number;
};

export type PlanRow = PlanNeed & {
  /** Free office stock set against this need, after earlier societies took theirs. */
  freeAllocated: number;
  toBuy: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Share free office stock across every society that needs it, oldest deal
 * first, so the same 300 battens are never promised to three societies.
 * `societyOrder` lists societies oldest first; a society not in it goes last.
 */
export function allocatePlan(needs: PlanNeed[], freeByItem: Map<string, number>, societyOrder: string[]): PlanRow[] {
  const rank = new Map(societyOrder.map((id, i) => [id, i]));
  const order = [...needs.keys()].sort((a, b) => {
    const ra = rank.get(needs[a]!.societyId) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(needs[b]!.societyId) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a - b;
  });
  const left = new Map(freeByItem);
  const out: PlanRow[] = new Array(needs.length);
  for (const i of order) {
    const n = needs[i]!;
    const still = Math.max(0, n.required - n.installed - n.withCrews - n.onOrder);
    const free = Math.max(0, left.get(n.itemTypeId) ?? 0);
    const take = Math.min(still, free);
    left.set(n.itemTypeId, free - take);
    out[i] = { ...n, freeAllocated: r3(take), toBuy: r3(still - take) };
  }
  return out;
}

export type DealTerm = { circuitId: string; representedLightCount: number; demoLightCount?: number };
export type DealCircuit = {
  id: string;
  meteredLightCount: number;
  /** The circuit's fitting lines: what the demo put in (or is to put in). */
  lines: Array<{ count: number; replacementDeviceTypeId: string | null; excluded: boolean }>;
};

/**
 * How many lights of which item the deal still needs installed: each priced
 * circuit's full installation (the offer's own figure), in the light model
 * the demo used, mapped to the stock item for that model. An older offer's
 * figure includes the demo lights, which are already in — they come off.
 * A circuit whose model maps to no stock item is reported, not guessed.
 */
export function dealLightRequirements(
  terms: DealTerm[],
  circuits: Map<string, DealCircuit>,
  itemByDeviceType: Map<string, string>,
): { byItem: Map<string, number>; unmapped: string[] } {
  const byItem = new Map<string, number>();
  const unmapped: string[] = [];
  for (const t of terms) {
    const c = circuits.get(t.circuitId);
    if (!c) continue;
    const full = t.demoLightCount === undefined ? Math.max(0, t.representedLightCount - c.meteredLightCount) : t.representedLightCount;
    if (full <= 0) continue;
    const lines = c.lines.filter((l) => !l.excluded && l.replacementDeviceTypeId && l.count > 0);
    const total = lines.reduce((s, l) => s + l.count, 0);
    const mapped = lines.filter((l) => itemByDeviceType.has(l.replacementDeviceTypeId!));
    if (total === 0 || mapped.length === 0) {
      unmapped.push(t.circuitId);
      continue;
    }
    // Split by the demo's own mix; the last line takes the rounding remainder.
    let given = 0;
    mapped.forEach((l, i) => {
      const share = i === mapped.length - 1 ? full - given : Math.round((full * l.count) / total);
      given += share;
      const item = itemByDeviceType.get(l.replacementDeviceTypeId!)!;
      byItem.set(item, (byItem.get(item) ?? 0) + share);
    });
    if (mapped.length < lines.length) unmapped.push(t.circuitId);
  }
  return { byItem, unmapped };
}

/** The required figure: a typed line wins; otherwise the deal's. */
export function requiredFor(dealFigure: number | undefined, typed: number | undefined): { quantity: number; source: "typed" | "deal" | "none" } {
  if (typed !== undefined) return { quantity: typed, source: "typed" };
  if (dealFigure !== undefined) return { quantity: dealFigure, source: "deal" };
  return { quantity: 0, source: "none" };
}

// ---------------------------------------------------------------------------
// Purchase requirements
// ---------------------------------------------------------------------------

export type PrLine = { id: string; itemTypeId: string; quantity: number };

/**
 * What has arrived against each line: deliveries received against the
 * requirement are counted per item and filled into its lines in order.
 */
export function receivedPerLine(lines: PrLine[], receivedByItem: Map<string, number>): Map<string, number> {
  const left = new Map(receivedByItem);
  const out = new Map<string, number>();
  for (const l of lines) {
    const have = left.get(l.itemTypeId) ?? 0;
    const take = Math.min(have, l.quantity);
    left.set(l.itemTypeId, have - take);
    out.set(l.id, r3(take));
  }
  return out;
}

export type PrStatus = "draft" | "sent" | "partly_received" | "received" | "cancelled";

/** A sent requirement's status from what has arrived. Draft and cancelled stay as they are. */
export function prStatusFrom(current: PrStatus, lines: PrLine[], received: Map<string, number>): PrStatus {
  if (current === "draft" || current === "cancelled") return current;
  const got = lines.reduce((s, l) => s + (received.get(l.id) ?? 0), 0);
  if (got <= 0) return "sent";
  return lines.every((l) => (received.get(l.id) ?? 0) + 1e-9 >= l.quantity) ? "received" : "partly_received";
}

/** Why a requirement's lines cannot be saved, or null. Ordering less than the shortfall needs a reason. */
export function refusePrLines(lines: Array<{ quantity: number; shortfall: number; unit: string; name: string; whole: boolean }>, reason: string): string | null {
  if (lines.length === 0) return "Add at least one item.";
  for (const l of lines) {
    if (!(l.quantity > 0)) return `${l.name}: enter how many to order.`;
    if (l.whole && !Number.isInteger(l.quantity)) return `${l.name} is counted in whole pieces.`;
  }
  if (lines.some((l) => l.quantity + 1e-9 < l.shortfall) && !reason.trim()) return "Ordering less than the shortfall — say why.";
  return null;
}

// ---------------------------------------------------------------------------
// Issue slips
// ---------------------------------------------------------------------------

/** {prefix}-{YYMM}-{nnn} — PR and IS codes. */
export function docCode(prefix: "PR" | "IS", on: Date, existing: string[]): string {
  const yymm = `${String(on.getUTCFullYear()).slice(2)}${String(on.getUTCMonth() + 1).padStart(2, "0")}`;
  const head = `${prefix}-${yymm}-`;
  const used = existing.filter((c) => c.startsWith(head)).map((c) => Number(c.slice(head.length))).filter(Number.isFinite);
  return `${head}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

export type SlipMove = { kind: string; itemTypeId: string; quantity: number; fromLocationId: string | null; toLocationId: string | null };

/**
 * What is still held on a slip, per item: issued, less installed at the
 * society, less returned to an office. Read from the slip's own ledger rows.
 */
export function slipOutstanding(moves: SlipMove[], employeeLocationId: string): Map<string, { issued: number; installed: number; returned: number; held: number }> {
  const out = new Map<string, { issued: number; installed: number; returned: number; held: number }>();
  const row = (id: string) => {
    let r = out.get(id);
    if (!r) out.set(id, (r = { issued: 0, installed: 0, returned: 0, held: 0 }));
    return r;
  };
  for (const m of moves) {
    const r = row(m.itemTypeId);
    if (m.toLocationId === employeeLocationId) r.issued += m.quantity;
    else if (m.fromLocationId === employeeLocationId) {
      if (m.kind === "deploy") r.installed += m.quantity;
      else r.returned += m.quantity;
    }
  }
  for (const r of out.values()) {
    r.issued = r3(r.issued);
    r.installed = r3(r.installed);
    r.returned = r3(r.returned);
    r.held = r3(r.issued - r.installed - r.returned);
  }
  return out;
}

export type SlipState = "on_time" | "due_soon" | "overdue" | "closed";

/** Overdue once the expected installation date has passed with anything still held. */
export function slipState(dueOn: Date, held: number, now: Date, soonDays = 2): SlipState {
  if (held <= 0) return "closed";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((dueOn.getTime() - today) / 86_400_000);
  if (days < 0) return "overdue";
  return days <= soonDays ? "due_soon" : "on_time";
}

export function daysLate(dueOn: Date, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - dueOn.getTime()) / 86_400_000));
}

/** Why an issue cannot be made as a whole, or null. */
export function refuseIssue(input: { employeeId: string; societyId: string; issuedOn: Date | null; dueOn: Date | null; lines: number }, now: Date): string | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!input.employeeId) return "Choose who it is issued to.";
  if (!input.societyId) return "Choose the society it is for.";
  if (!input.issuedOn || input.issuedOn.getTime() > today) return "Enter the date it was issued (not in the future).";
  if (!input.dueOn) return "Enter the expected installation date.";
  if (input.dueOn.getTime() < input.issuedOn.getTime()) return "The installation date cannot be before the issue date.";
  if (input.lines === 0) return "Add at least one item.";
  return null;
}

/**
 * Draw a quantity from batches, oldest first. Returns the per-batch amounts,
 * or the shortfall when there is not enough.
 */
export function drawFifo(batches: Array<{ batchId: string; available: number }>, quantity: number): { draws: Array<{ batchId: string; quantity: number }> } | { short: number } {
  let need = quantity;
  const draws: Array<{ batchId: string; quantity: number }> = [];
  for (const b of batches) {
    if (need <= 1e-9) break;
    const take = Math.min(b.available, need);
    if (take > 1e-9) {
      draws.push({ batchId: b.batchId, quantity: r3(take) });
      need -= take;
    }
  }
  return need > 1e-9 ? { short: r3(need) } : { draws };
}

/** The change a "set the installed count to N" makes: how many to add or take off. */
export function installedCountChange(current: number, target: number): { add: number; remove: number } {
  return target >= current ? { add: r3(target - current), remove: 0 } : { add: 0, remove: r3(current - target) };
}
