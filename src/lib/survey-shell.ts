// The survey shell (05-field.md §0.5, 19-field-app.md §16): four sections
// of one container, their state, the submission gate and the lock. Pure, so
// the phone, the sync route and the office read one set of rules.

export const SURVEY_SECTIONS = ["profile", "inventory", "circuits", "pump_room"] as const;
export type SurveySection = (typeof SURVEY_SECTIONS)[number];
export type SectionState = "not_started" | "in_progress" | "complete" | "flagged" | "queried";

export const SECTION_LABEL: Record<SurveySection, string> = {
  profile: "Society profile & access",
  inventory: "Lighting inventory",
  circuits: "Circuit selection",
  pump_room: "Pump room",
};

/** Every section's state, with the ones never touched read as not started. */
export function sectionStates(rows: { section: SurveySection; state: SectionState }[]): Record<SurveySection, SectionState> {
  const out = Object.fromEntries(SURVEY_SECTIONS.map((s) => [s, "not_started"])) as Record<SurveySection, SectionState>;
  for (const r of rows) out[r.section] = r.state;
  return out;
}

/** Where to resume: the first section neither complete nor flagged. */
export function resumeSection(states: Record<SurveySection, SectionState>): SurveySection {
  return SURVEY_SECTIONS.find((s) => states[s] !== "complete" && states[s] !== "flagged") ?? "profile";
}

/**
 * Who may write to a survey section now, or why not. A draft survey is open to
 * field work. After submission it is read-only for the field team — except in
 * a section the office has queried — while operations, reviewing it, may still
 * correct (the office's forward-only count correction must keep working).
 */
export function refuseSurveyWrite(input: {
  status: "draft" | "submitted";
  sectionState: SectionState;
  isOps: boolean;
}): string | null {
  if (input.status === "draft") return null;
  if (input.isOps) return null;
  if (input.sectionState === "queried") return null;
  return "This survey has been submitted, so it is read-only. The office can reopen a section if something needs correcting.";
}

// ── section completion ───────────────────────────────────────────────────

/** India's bounding box, generously — a pin outside it is certainly wrong. */
export function coordinatesPlausible(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
}

/** What still stops the profile section completing, named (SCR-010). */
export function profileGaps(input: {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  currentMembers: number;
  primaryContact: boolean;
}): string[] {
  const gaps: string[] = [];
  if (!coordinatesPlausible(input.latitude, input.longitude)) gaps.push("Drop the pin on the building — the location is missing or outside India.");
  if (!input.address?.trim()) gaps.push("Add the address — the next person to visit needs it.");
  if (input.currentMembers === 0) gaps.push("Add at least one committee member with a mobile number.");
  else if (!input.primaryContact) gaps.push("Mark one member as the primary contact — offers, reports and invoices go to them.");
  return gaps;
}

export type InventoryRowForGaps = { area: string; lightType: string; count: number; method: string; note: string | null };

/** What still stops the inventory section completing (SCR-011). */
export function inventoryGaps(rows: InventoryRowForGaps[], contestedAreas: string[]): string[] {
  const gaps: string[] = [];
  if (rows.length === 0) gaps.push("Add each area that has common lighting.");
  for (const r of rows) {
    if (!r.lightType.trim()) gaps.push(`${r.area}: which type of lighting is this?`);
    if (!(r.count >= 1)) gaps.push(`${r.area}: enter how many lights are in this area.`);
    if (r.method === "estimated" && !r.note?.trim()) gaps.push(`${r.area}: say how the estimate was made.`);
  }
  for (const a of contestedAreas) gaps.push(`${a} was counted by two people — settle it before completing.`);
  return gaps;
}

/**
 * What still stops the circuit section completing (SCR-012): every light type
 * from the inventory needs an outcome — a candidate circuit recorded (eligible,
 * awaiting an exception, or ineligible with a replacement pending is NOT an
 * outcome), or the type marked unresolvable with a reason.
 */
export function circuitGaps(input: {
  inventoryTypes: { key: string; label: string }[];
  resolvedTypeKeys: Set<string>;
}): string[] {
  if (input.inventoryTypes.length === 0) return ["Count the lighting first — that decides which circuits are needed."];
  return input.inventoryTypes
    .filter((t) => !input.resolvedTypeKeys.has(t.key))
    .map((t) => `${t.label}: select a circuit, or say why none is eligible.`);
}

// ── submission ───────────────────────────────────────────────────────────

/**
 * What stops the survey being submitted, each named (§0.5): a section neither
 * complete nor flagged, a contested area, and a teammate whose phone still
 * holds work — the submitter cannot sync someone else's phone, so the screen
 * says who to chase.
 */
export function submitBlockers(input: {
  states: Record<SurveySection, SectionState>;
  contestedAreas: string[];
  teammatesPending: { name: string; count: number }[];
}): string[] {
  const out: string[] = [];
  for (const s of SURVEY_SECTIONS) {
    const st = input.states[s];
    if (st !== "complete" && st !== "flagged") out.push(`${SECTION_LABEL[s]} is ${st === "queried" ? "reopened by the office" : "not finished"}.`);
  }
  for (const a of input.contestedAreas) out.push(`${a} was counted by two people — settle it first.`);
  for (const t of input.teammatesPending) {
    out.push(`${t.name}'s phone still has ${t.count} item${t.count === 1 ? "" : "s"} to send — ask them to open the app with signal.`);
  }
  return out;
}

// ── area claims (§0.1b) ──────────────────────────────────────────────────

/** The identity of an area for claiming: its type and its own name, case- and space-insensitive. */
export function areaKeyOf(areaType: string | null, label: string | null, area: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (areaType) return `${norm(areaType)}|${norm(label ?? "")}`;
  return `|${norm(area)}`;
}

/** The display name of an area row: "Staircase — Tower B", or the office's free text. */
export function areaDisplay(areaTypeLabel: string | null, label: string | null, area: string): string {
  if (!areaTypeLabel) return area;
  return label?.trim() ? `${areaTypeLabel} — ${label.trim()}` : areaTypeLabel;
}

/**
 * Areas counted by more than one person (live rows only). A contest is never
 * resolved by summing or de-duplicating — it is listed until someone settles it.
 */
export function contestedAreas<T extends { areaKey: string; countedById: string | null }>(rows: T[]): Map<string, T[]> {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const list = byKey.get(r.areaKey) ?? [];
    list.push(r);
    byKey.set(r.areaKey, list);
  }
  const out = new Map<string, T[]>();
  for (const [k, list] of byKey) {
    const people = new Set(list.map((r) => r.countedById ?? "office"));
    if (people.size > 1) out.set(k, list);
  }
  return out;
}

export const FIELD_AREA_TYPES: [string, string][] = [
  ["basement", "Basement parking"],
  ["stilt", "Stilt parking"],
  ["lift_lobby", "Lift lobby"],
  ["staircase", "Staircase"],
  ["external", "External"],
  ["other", "Other"],
];

export const MEMBER_POSTS_HINT = "Security in-charge and the electrician are who a field worker actually calls — record them too.";
