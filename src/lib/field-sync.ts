/**
 * The field app's offline outbox — the rules both ends agree on
 * (docs/engineering/19-field-app.md §4.1, 05-field.md §0.1). Pure, so they
 * unit-test without a request or a browser.
 *
 * The shape of the thing: the phone saves every piece of work locally FIRST,
 * as an outbox item carrying an id the phone generated. It sends items in
 * order; the server applies each exactly once (FieldSyncReceipt) and answers
 * in one of a few ways the phone must tell apart, because they call for
 * different reactions:
 *
 *   done      — applied (or already applied: a replay gets the stored result).
 *   refused   — the server read it and said no (a rule, not the network).
 *               Kept, retried, and after three refusals it BLOCKS the queue
 *               and is named on screen — "a silently stuck queue is how a
 *               survey is lost while the app says 3 pending" (§0.1).
 *   sign_in   — the session has gone. Nothing is wrong with the item; the
 *               person has to sign in again. Never counts as a refusal.
 *   retry     — network or server trouble. Try again later, no strike.
 */

export const OUTBOX_KINDS = ["inspection.file", "inspection.photo", "stock.move", "demo.meter", "demo.replacement"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

/** Refusals before an item blocks the queue (05-field.md §0.1 "Poison item"). */
export const BLOCK_AFTER_REFUSALS = 3;

export type Envelope = { id: string; kind: OutboxKind; payload: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The outer shape every sync request must have, or why it does not. */
export function parseEnvelope(body: unknown): Envelope | { error: string } {
  if (!body || typeof body !== "object") return { error: "Not a sync request." };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !UUID_RE.test(b.id)) return { error: "The item has no valid id." };
  if (typeof b.kind !== "string" || !(OUTBOX_KINDS as readonly string[]).includes(b.kind)) {
    return { error: `Unknown kind of work: ${String(b.kind)}.` };
  }
  return { id: b.id, kind: b.kind as OutboxKind, payload: b.payload };
}

export const SENSOR_STATUSES = ["ok", "full", "dim", "off", "flicker"] as const;
export type SensorStatus = (typeof SENSOR_STATUSES)[number];

export type FieldInspectionPayload = {
  societyId: string;
  circuitId: string | null;
  period: string; // YYYY-MM, chosen on the phone (INV-04)
  inspectedAt: string; // "YYYY-MM-DDTHH:mm", wall-clock as typed
  totalLightsChecked: number;
  societyRepName: string;
  notes: string;
  findings: {
    location: string;
    sensorStatus: SensorStatus;
    physicalDamage: boolean;
    actionReplace: boolean;
    remarks: string;
  }[];
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * A whole inspection filed from the phone — the header and the walk-through
 * together, because offline there is no server to claim the slot in between.
 * Shape only; the business rules are inspection.ts's own, applied on arrival.
 */
export function parseInspectionPayload(p: unknown): FieldInspectionPayload | { error: string } {
  if (!p || typeof p !== "object") return { error: "The inspection is empty." };
  const o = p as Record<string, unknown>;
  if (!str(o.societyId)) return { error: "Choose the society." };
  if (!/^\d{4}-\d{2}$/.test(str(o.period))) return { error: "Choose the month this inspection is for." };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str(o.inspectedAt))) return { error: "The inspection date and time are not valid." };
  const total = Number(o.totalLightsChecked);
  if (!Number.isInteger(total)) return { error: "Total lights checked must be a whole number." };
  if (!Array.isArray(o.findings)) return { error: "The fixture list is missing." };
  const findings: FieldInspectionPayload["findings"] = [];
  for (const [i, raw] of o.findings.entries()) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const status = str(f.sensorStatus);
    if (!(SENSOR_STATUSES as readonly string[]).includes(status)) return { error: `Fixture ${i + 1}: choose the sensor state.` };
    findings.push({
      location: str(f.location),
      sensorStatus: status as SensorStatus,
      physicalDamage: f.physicalDamage === true,
      actionReplace: f.actionReplace === true,
      remarks: str(f.remarks),
    });
  }
  return {
    societyId: str(o.societyId),
    circuitId: str(o.circuitId) || null,
    period: str(o.period),
    inspectedAt: str(o.inspectedAt),
    totalLightsChecked: total,
    societyRepName: str(o.societyRepName),
    notes: str(o.notes),
    findings,
  };
}

/** Attach an uploaded photo to the inspection an earlier item filed. */
export type FieldPhotoPayload = { inspectionItemId: string; key: string };

export function parsePhotoPayload(p: unknown): FieldPhotoPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (typeof o.inspectionItemId !== "string" || !UUID_RE.test(o.inspectionItemId)) return { error: "The photo is not tied to an inspection." };
  if (typeof o.key !== "string" || !o.key.startsWith("Documents/")) return { error: "The photo was not uploaded." };
  return { inspectionItemId: o.inspectionItemId, key: o.key };
}

/** The moves a scanned pile of units can take (the back office's unit kinds). */
export const UNIT_MOVE_KINDS = ["deploy", "return_to_office", "transfer", "mark_faulty", "repair", "return_to_supplier", "scrap", "lost"] as const;
export type UnitMoveKind = (typeof UNIT_MOVE_KINDS)[number];

export type FieldMovePayload = {
  codes: string[];
  kind: UnitMoveKind;
  on: string; // YYYY-MM-DD
  toOfficeId: string;
  societyId: string;
  circuitId: string;
  reason: string;
};

/**
 * A pile of scanned units, moved once (the scanner's "collect for a move").
 * Shape only; whether each unit may move is inventory.ts's nextState, applied
 * unit by unit on arrival — a refused unit is named and the rest still move.
 */
export function parseMovePayload(p: unknown): FieldMovePayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  const codes = Array.isArray(o.codes) ? o.codes.filter((c): c is string => typeof c === "string" && c.trim() !== "") : [];
  if (codes.length === 0) return { error: "Scan at least one unit." };
  if (codes.length > 500) return { error: "At most 500 units in one move." };
  const kind = str(o.kind);
  if (!(UNIT_MOVE_KINDS as readonly string[]).includes(kind)) return { error: "Choose what happened." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(o.on))) return { error: "Enter the date it happened." };
  return {
    codes,
    kind: kind as UnitMoveKind,
    on: str(o.on),
    toOfficeId: str(o.toOfficeId),
    societyId: str(o.societyId),
    circuitId: str(o.circuitId),
    reason: str(o.reason),
  };
}

/** The meter install and load test for one demo (demo-step-core.ts recordDemoMeterAs). */
export type FieldDemoMeterPayload = {
  demoId: string;
  meterId: string | null;
  installedOn: string; // YYYY-MM-DD
  displayedLoad: number | null;
};

export function parseDemoMeterPayload(p: unknown): FieldDemoMeterPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.demoId)) return { error: "The demo this belongs to is missing." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(o.installedOn))) return { error: "Pick the day the meter went in." };
  const meterId = str(o.meterId) || null;
  const load = o.displayedLoad === null || o.displayedLoad === "" || o.displayedLoad === undefined ? null : Number(o.displayedLoad);
  if (load !== null && !Number.isFinite(load)) return { error: "The displayed load must be a number of watts." };
  return { demoId: str(o.demoId), meterId, installedOn: str(o.installedOn), displayedLoad: load };
}

export type FieldReplacementLine = { lineId: string; replacementTypeId: string; count: number; wattage: number; exclude: boolean };

/** The light replacement for one demo (demo-step-core.ts recordDemoReplacementAs). */
export type FieldDemoReplacementPayload = { demoId: string; replacedOn: string; lines: FieldReplacementLine[] };

export function parseDemoReplacementPayload(p: unknown): FieldDemoReplacementPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.demoId)) return { error: "The demo this belongs to is missing." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(o.replacedOn))) return { error: "Pick the day the last light was replaced." };
  const raw = Array.isArray(o.lines) ? o.lines : [];
  const lines: FieldReplacementLine[] = [];
  for (const r of raw) {
    const l = (r ?? {}) as Record<string, unknown>;
    if (!str(l.lineId)) return { error: "A fixture line is missing its id." };
    lines.push({
      lineId: str(l.lineId),
      replacementTypeId: str(l.replacementTypeId),
      count: Number(l.count),
      wattage: Number(l.wattage),
      exclude: l.exclude === true,
    });
  }
  return { demoId: str(o.demoId), replacedOn: str(o.replacedOn), lines };
}

export type SendOutcome = "done" | "refused" | "sign_in" | "retry";

/** How the phone must read a sync reply. A thrown fetch (no signal) is "retry". */
export function classifyReply(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "done";
  if (status === 401) return "sign_in";
  // 403 = this account may no longer file field work. Retrying will not
  // change that, and it must be seen — so it counts, like any refusal.
  if (status === 400 || status === 403 || status === 409 || status === 422) return "refused";
  return "retry";
}

/**
 * Wait before the next attempt while the app is open: 15 s, doubling, capped
 * at 5 minutes (05-field.md §0.1 "Retry"). Regaining the connection skips the
 * wait. An item never expires on its own.
 */
export function retryDelayMs(failedAttempts: number): number {
  const base = 15_000;
  const cap = 5 * 60_000;
  if (failedAttempts <= 0) return base;
  return Math.min(cap, base * 2 ** failedAttempts);
}

/** After a refusal: keep trying, or block the queue and say so. */
export function afterRefusal(refusals: number): "retry" | "block" {
  return refusals >= BLOCK_AFTER_REFUSALS ? "block" : "retry";
}
