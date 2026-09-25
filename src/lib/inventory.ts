// Inventory & device lifecycle rules (2026-09-25) — pure, one place.
// docs/engineering/17-inventory-lifecycle.md holds the decisions.

export type UnitStatus = "in_stock" | "deployed" | "faulty" | "returned_to_supplier" | "scrapped" | "lost";
export type MoveKind =
  | "receive"
  | "transfer"
  | "deploy"
  | "return_to_office"
  | "mark_faulty"
  | "repair"
  | "return_to_supplier"
  | "scrap"
  | "lost"
  | "adjust";

export const MOVE_LABEL: Record<MoveKind, string> = {
  receive: "Received",
  transfer: "Moved to another office",
  deploy: "Deployed",
  return_to_office: "Brought back to office",
  mark_faulty: "Marked faulty",
  repair: "Repaired",
  return_to_supplier: "Returned to supplier",
  scrap: "Scrapped",
  lost: "Lost",
  adjust: "Stock corrected",
};

export const STATUS_LABEL: Record<UnitStatus, string> = {
  in_stock: "In stock",
  deployed: "Deployed",
  faulty: "Faulty",
  returned_to_supplier: "Returned to supplier",
  scrapped: "Scrapped",
  lost: "Lost",
};

/** B{YYMM}-{nnn} — the batch code printed on every unit of the batch. */
export function batchCode(receivedOn: Date, seq: number): string {
  const yy = String(receivedOn.getUTCFullYear()).slice(2);
  const mm = String(receivedOn.getUTCMonth() + 1).padStart(2, "0");
  return `B${yy}${mm}-${String(seq).padStart(3, "0")}`;
}

/** The next free sequence for a month, from the codes already used in it. */
export function nextBatchSeq(codesThisMonth: string[]): number {
  const used = codesThisMonth.map((c) => Number(c.split("-")[1])).filter((n) => Number.isFinite(n));
  return (used.length ? Math.max(...used) : 0) + 1;
}

/** {batch}-{nnnnn} — one unit's own printed code. */
export function unitCode(batch: string, n: number): string {
  return `${batch}-${String(n).padStart(5, "0")}`;
}

export type Transition = { status: UnitStatus; to: "office" | "site" | "keep" | "none" };

/**
 * What a movement does to a serialized unit, or why it cannot happen. The
 * ledger is only ever appended to, so a refused move is refused in words
 * rather than written and corrected afterwards.
 */
export function nextState(status: UnitStatus, kind: MoveKind): Transition | { error: string } {
  const terminal: UnitStatus[] = ["returned_to_supplier", "scrapped", "lost"];
  if (terminal.includes(status)) return { error: `It is ${STATUS_LABEL[status].toLowerCase()} — nothing further can be recorded against it.` };
  switch (kind) {
    case "transfer":
      return status === "in_stock" || status === "faulty" ? { status, to: "office" } : { error: "Only stock at an office can be moved between offices — bring it back first." };
    case "deploy":
      return status === "in_stock" ? { status: "deployed", to: "site" } : { error: status === "deployed" ? "It is already deployed." : "A faulty unit cannot be deployed — repair it first." };
    case "return_to_office":
      return status === "deployed" || status === "faulty" ? { status: status === "faulty" ? "faulty" : "in_stock", to: "office" } : { error: "It is already at an office." };
    case "mark_faulty":
      return status === "in_stock" || status === "deployed" ? { status: "faulty", to: "keep" } : { error: "It is already marked faulty." };
    case "repair":
      return status === "faulty" ? { status: "in_stock", to: "keep" } : { error: "Only a faulty unit can be repaired." };
    case "return_to_supplier":
    case "scrap":
      return status === "deployed" ? { error: "Bring it back to an office first." } : { status: kind === "scrap" ? "scrapped" : "returned_to_supplier", to: "none" };
    case "lost":
      return { status: "lost", to: "none" };
    default:
      return { error: "That movement does not apply to a single unit." };
  }
}

/** When a unit's warranty ends, or null when the batch states none. */
export function warrantyUntil(input: {
  warrantyMonths: number | null;
  basis: "purchase" | "install";
  purchaseDate: Date;
  deployedOn: Date | null;
}): Date | null {
  if (!input.warrantyMonths) return null;
  const start = input.basis === "install" ? input.deployedOn : input.purchaseDate;
  if (!start) return null; // install-based, not yet installed: the clock has not started
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + input.warrantyMonths);
  return d;
}

export type WarrantyState = "none" | "not_started" | "valid" | "expiring" | "expired";

export function warrantyState(until: Date | null, hasWarranty: boolean, now: Date, expiringWithinDays = 60): WarrantyState {
  if (!hasWarranty) return "none";
  if (!until) return "not_started";
  const days = (until.getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return "expired";
  return days <= expiringWithinDays ? "expiring" : "valid";
}

/** Quantity at a location from the ledger: everything that came in, less everything that left. */
export function balanceAt(
  movements: Array<{ quantity: number; fromLocationId: string | null; toLocationId: string | null }>,
  locationId: string,
): number {
  let n = 0;
  for (const m of movements) {
    if (m.toLocationId === locationId) n += m.quantity;
    if (m.fromLocationId === locationId) n -= m.quantity;
  }
  return Math.round(n * 1000) / 1000;
}

/** Why a quantity/length move cannot be made from what is there, or null. */
export function refuseQuantityMove(available: number, quantity: number, unit: string): string | null {
  if (!(quantity > 0)) return "Enter how much to move.";
  if (quantity > available + 1e-9) return `Only ${available} ${unit} of this batch is there.`;
  return null;
}

// ---- scanning (2026-09-25) ------------------------------------------------
const UNIT_OR_BATCH = /^B\d{4}-\d{3}(-\d{5})?$/;

/**
 * The code a scan carries. A label's QR is a link (`…/i/B2609-001-00042`) so a
 * phone's own camera opens the unit; older labels carry the bare code; a USB
 * scanner types whatever is on the label. All three give the same code.
 * Anything else is passed back trimmed — it may be a maker's serial.
 */
export function codeFromScan(text: string): string {
  const t = text.trim();
  const m = t.match(/\/(?:i|units)\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/);
  const candidate = (m ? decodeURIComponent(m[1]) : t).toUpperCase();
  return UNIT_OR_BATCH.test(candidate) ? candidate : t;
}

/** Whether a scanned code is one of ours (a unit or a batch). */
export function isStockCode(code: string): boolean {
  return UNIT_OR_BATCH.test(code);
}

/** The link printed in a label's QR code. */
export function labelLink(base: string, code: string): string {
  return `${base.replace(/\/$/, "")}/i/${code}`;
}

// ---- stock value (2026-09-25) -----------------------------------------------
export type Holding = { locationId: string; quantity: number; unitCost: number | null };
export type LocationValue = { value: number; uncosted: number };

/**
 * What each location holds, valued at the cost it was bought at (the batch's
 * cost per piece or metre, before GST). A holding whose batch has no cost is
 * counted in `uncosted`, never valued at zero — a total that silently treats
 * unknown stock as free understates what is on the shelves.
 */
export function valueHoldings(rows: Holding[]): Map<string, LocationValue> {
  const out = new Map<string, LocationValue>();
  for (const r of rows) {
    if (!(r.quantity > 0)) continue;
    const v = out.get(r.locationId) ?? { value: 0, uncosted: 0 };
    if (r.unitCost === null) v.uncosted += r.quantity;
    else v.value += r.quantity * r.unitCost;
    out.set(r.locationId, v);
  }
  for (const v of out.values()) v.value = Math.round(v.value * 100) / 100;
  return out;
}

/** Why a cost cannot be stored as entered, or null. Empty means "not known". */
export function refuseUnitCost(cost: number | null): string | null {
  if (cost === null) return null;
  if (!Number.isFinite(cost) || cost < 0) return "The cost must be a positive amount in rupees.";
  if (cost > 10_000_000) return "That cost looks wrong — it is per piece or per metre, not for the whole delivery.";
  return null;
}
