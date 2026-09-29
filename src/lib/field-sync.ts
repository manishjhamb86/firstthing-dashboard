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

export const OUTBOX_KINDS = [
  "inspection.file",
  "inspection.photo",
  "stock.move",
  "demo.meter",
  "demo.replacement",
  "installation.day",
  "installation.blocker",
  "installation.certificate",
  "survey.profile",
  "survey.member",
  "survey.primary",
  "survey.section",
  "survey.submit",
  "survey.area",
  "survey.area_update",
  "survey.area_remove",
  "survey.settle",
  "survey.circuit",
  "survey.unresolvable",
  "survey.pump_structure",
  "survey.pump_unit",
  "survey.logbook",
  "survey.logbook_page",
] as const;
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

/**
 * One installation day, as the crew records it (installation-core.ts
 * recordDayAs). The photos travel as keys the service worker filled in after
 * uploading them; the route checks each is a key it issued for this day.
 */
export type FieldInstallationDayPayload = {
  pipelineId: string;
  plannedDayId: string;
  installedCount: number;
  removedFittingsCount: number;
  skippedCount: number;
  skippedReason: string;
  locationDetail: string;
  workedOn: string; // YYYY-MM-DD
  photosWaivedReason: string;
  photoKeys: string[];
};

const count = (v: unknown) => (v === "" || v === null || v === undefined ? 0 : Number(v));

export function parseInstallationDayPayload(p: unknown): FieldInstallationDayPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.pipelineId) || !str(o.plannedDayId)) return { error: "The installation day this belongs to is missing." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(o.workedOn))) return { error: "Pick the day the work was done." };
  const installedCount = count(o.installedCount);
  const removedFittingsCount = count(o.removedFittingsCount);
  const skippedCount = count(o.skippedCount);
  for (const [n, label] of [[installedCount, "installed"], [removedFittingsCount, "removed"], [skippedCount, "skipped"]] as const) {
    if (!Number.isInteger(n) || n < 0) return { error: `The ${label} count must be a whole number.` };
  }
  const photoKeys = Array.isArray(o.photoKeys) ? o.photoKeys.filter((k): k is string => typeof k === "string") : [];
  return {
    pipelineId: str(o.pipelineId),
    plannedDayId: str(o.plannedDayId),
    installedCount,
    removedFittingsCount,
    skippedCount,
    skippedReason: str(o.skippedReason),
    locationDetail: str(o.locationDetail),
    workedOn: str(o.workedOn),
    photosWaivedReason: str(o.photosWaivedReason),
    photoKeys,
  };
}

export const BLOCKER_TYPES = ["stock_shortage", "access_denied", "site_condition", "count_discrepancy", "equipment_fault"] as const;
export type FieldBlockerType = (typeof BLOCKER_TYPES)[number];

export type FieldBlockerPayload = {
  pipelineId: string;
  type: FieldBlockerType;
  areaKey: string;
  detail: string;
  affectedDate: string | null;
  discoveredLightCount: number | null;
};

export function parseBlockerPayload(p: unknown): FieldBlockerPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.pipelineId)) return { error: "The installation this belongs to is missing." };
  if (!(BLOCKER_TYPES as readonly string[]).includes(str(o.type))) return { error: "Pick what kind of blocker it is." };
  const affected = str(o.affectedDate);
  if (affected && !/^\d{4}-\d{2}-\d{2}$/.test(affected)) return { error: "Unreadable affected date." };
  const found = o.discoveredLightCount === null || o.discoveredLightCount === "" || o.discoveredLightCount === undefined ? null : Number(o.discoveredLightCount);
  if (found !== null && (!Number.isInteger(found) || found < 0)) return { error: "The count found on site must be a whole number." };
  return {
    pipelineId: str(o.pipelineId),
    type: str(o.type) as FieldBlockerType,
    areaKey: str(o.areaKey),
    detail: str(o.detail),
    affectedDate: affected || null,
    discoveredLightCount: found,
  };
}

export type FieldCertificatePayload = { pipelineId: string; signedAt: string; signatoryName: string; signatoryRole: string };

export function parseCertificatePayload(p: unknown): FieldCertificatePayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.pipelineId)) return { error: "The installation this belongs to is missing." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(o.signedAt))) return { error: "Pick the day the certificate was signed." };
  return { pipelineId: str(o.pipelineId), signedAt: str(o.signedAt), signatoryName: str(o.signatoryName), signatoryRole: str(o.signatoryRole) };
}

// ── the survey shell (19-field-app.md §16) ──

const num = (v: unknown): number | null => (v === "" || v === null || v === undefined ? null : Number(v));

export type FieldSurveyProfilePayload = {
  surveyId: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  manual: boolean;
  rwaMemberCount: number | null;
  nextElectionDate: string | null;
  gateContactName: string;
  gateContactPhone: string;
  accessHours: string;
  noticeRequired: "none" | "same_day" | "days" | "";
  noticeDays: number | null;
  parkingNotes: string;
  passIdNotes: string;
};

export function parseSurveyProfilePayload(p: unknown): FieldSurveyProfilePayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.surveyId)) return { error: "The survey this belongs to is missing." };
  const lat = num(o.latitude);
  const lng = num(o.longitude);
  if ((lat === null) !== (lng === null)) return { error: "A location needs both a latitude and a longitude." };
  const notice = str(o.noticeRequired);
  if (notice && !["none", "same_day", "days"].includes(notice)) return { error: "Unknown notice requirement." };
  return {
    surveyId: str(o.surveyId),
    address: str(o.address),
    latitude: lat,
    longitude: lng,
    accuracyM: num(o.accuracyM),
    manual: o.manual === true,
    rwaMemberCount: num(o.rwaMemberCount),
    nextElectionDate: str(o.nextElectionDate) || null,
    gateContactName: str(o.gateContactName),
    gateContactPhone: str(o.gateContactPhone),
    accessHours: str(o.accessHours),
    noticeRequired: notice as FieldSurveyProfilePayload["noticeRequired"],
    noticeDays: num(o.noticeDays),
    parkingNotes: str(o.parkingNotes),
    passIdNotes: str(o.passIdNotes),
  };
}

export type FieldSurveyMemberPayload = { surveyId: string; memberId: string; name: string; mobile: string; email: string; positionId: string; primary: boolean };

export function parseSurveyMemberPayload(p: unknown): FieldSurveyMemberPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.surveyId)) return { error: "The survey this belongs to is missing." };
  if (!UUID_RE.test(str(o.memberId))) return { error: "The member has no valid id." };
  return {
    surveyId: str(o.surveyId),
    memberId: str(o.memberId),
    name: str(o.name),
    mobile: str(o.mobile),
    email: str(o.email),
    positionId: str(o.positionId),
    primary: o.primary === true,
  };
}

export const SURVEY_SECTION_KEYS = ["profile", "inventory", "circuits", "pump_room"] as const;

export type FieldSurveySectionPayload = {
  surveyId: string;
  section: (typeof SURVEY_SECTION_KEYS)[number];
  state: "complete" | "flagged" | "in_progress";
  reason: string;
};

export function parseSurveySectionPayload(p: unknown): FieldSurveySectionPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.surveyId)) return { error: "The survey this belongs to is missing." };
  if (!(SURVEY_SECTION_KEYS as readonly string[]).includes(str(o.section))) return { error: "Unknown survey section." };
  if (!["complete", "flagged", "in_progress"].includes(str(o.state))) return { error: "Unknown section state." };
  return {
    surveyId: str(o.surveyId),
    section: str(o.section) as FieldSurveySectionPayload["section"],
    state: str(o.state) as FieldSurveySectionPayload["state"],
    reason: str(o.reason),
  };
}

export type FieldAreaPayload = {
  surveyId: string;
  rowId: string;
  areaType: string;
  label: string;
  lightType: string;
  count: number;
  method: "walked" | "records" | "estimated";
  note: string;
};

export function parseAreaPayload(p: unknown): FieldAreaPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.surveyId)) return { error: "The survey this belongs to is missing." };
  if (!UUID_RE.test(str(o.rowId))) return { error: "The area has no valid id." };
  const method = str(o.method);
  if (!["walked", "records", "estimated"].includes(method)) return { error: "How was this counted?" };
  return {
    surveyId: str(o.surveyId),
    rowId: str(o.rowId),
    areaType: str(o.areaType),
    label: str(o.label),
    lightType: str(o.lightType),
    count: Number(o.count),
    method: method as FieldAreaPayload["method"],
    note: str(o.note),
  };
}

export type FieldCircuitPayload = {
  surveyId: string;
  circuitId: string;
  lightType: string;
  location: string;
  lines: { deviceTypeId: string; count: number; wattage: number; hoursPerDay: number; excludedFromCalculation: boolean }[];
  workingHours: number | null;
  wifiReachable: boolean;
  fixturesUnder15ft: boolean;
  notOnDrivewayOrRamp: boolean;
  typicalityNote: string;
  photoKeys: string[];
};

export function parseCircuitPayload(p: unknown): FieldCircuitPayload | { error: string } {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!str(o.surveyId)) return { error: "The survey this belongs to is missing." };
  if (!UUID_RE.test(str(o.circuitId))) return { error: "The circuit has no valid id." };
  if (!str(o.lightType).trim()) return { error: "Which light type does this circuit represent?" };
  const lines = (Array.isArray(o.lines) ? o.lines : []).map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    return {
      deviceTypeId: str(l.deviceTypeId),
      count: Number(l.count),
      wattage: Number(l.wattage),
      hoursPerDay: Number(l.hoursPerDay),
      excludedFromCalculation: l.excludedFromCalculation === true,
    };
  });
  const wh = num(o.workingHours);
  return {
    surveyId: str(o.surveyId),
    circuitId: str(o.circuitId),
    lightType: str(o.lightType),
    location: str(o.location),
    lines,
    workingHours: wh,
    wifiReachable: o.wifiReachable === true,
    fixturesUnder15ft: o.fixturesUnder15ft === true,
    notOnDrivewayOrRamp: o.notOnDrivewayOrRamp === true,
    typicalityNote: str(o.typicalityNote),
    photoKeys: Array.isArray(o.photoKeys) ? o.photoKeys.filter((k): k is string => typeof k === "string") : [],
  };
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
