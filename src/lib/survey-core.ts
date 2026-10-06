import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normaliseMobile, refuseMember } from "@/lib/society-members";
import { buildDocumentKey } from "@/lib/document-keys";
import { lightTypeKey } from "@/lib/light-type";
import { fullFromTotal } from "@/lib/light-population";
import { recordCandidateAs, type CandidateLine } from "@/lib/circuit-candidate-core";
import {
  generateUnits,
  logbookMonths,
  pumpRoomGaps,
  refuseStructure,
  type Condition,
  type PumpStructure,
  type UnitAnswer,
} from "@/lib/pump-room";
import {
  areaDisplay,
  areaKeyOf,
  circuitGaps,
  contestedAreas,
  FIELD_AREA_TYPES,
  inventoryGaps,
  coordinatesPlausible,
  profileGaps,
  refuseSurveyWrite,
  sectionStates,
  submitBlockers,
  SECTION_LABEL,
  type SectionState,
  type SurveySection,
} from "@/lib/survey-shell";

// The survey shell's acts (19-field-app.md §16), shared by the field sync
// route and the back office. Each takes the account; the caller has checked
// field access. Every write passes the lock (survey-shell.ts refuseSurveyWrite).

export type SurveyActor = { id: string; permissions: string[] };
export type Done<T = object> = ({ ok: true } & T) | { error: string };
type Tx = Prisma.TransactionClient;

export const isOps = (a: SurveyActor) => a.permissions.includes("manage_pipeline") && a.permissions.includes("manage_survey");

/** The survey and its section rows, or why it cannot be written in `section` now. */
export async function surveyForWrite(actor: SurveyActor, surveyId: string, section: SurveySection) {
  const survey = await db.siteSurvey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      status: true,
      pipelineId: true,
      latitude: true,
      longitude: true,
      address: true,
      sections: { select: { section: true, state: true } },
      pipeline: { select: { societyId: true, stage: true } },
    },
  });
  if (!survey) return { error: "That survey no longer exists." } as const;
  if (survey.pipeline.stage === "closed_lost") return { error: "This deal has been closed, so its survey is read-only." } as const;
  const states = sectionStates(survey.sections as { section: SurveySection; state: SectionState }[]);
  const refusal = refuseSurveyWrite({ status: survey.status, sectionState: states[section], isOps: isOps(actor) });
  if (refusal) {
    logger.warn("survey.write_refused_locked", { actorId: actor.id, surveyId, section });
    return { error: refusal } as const;
  }
  return { survey, states } as const;
}

/**
 * The survey's visit and this person on its team (CON-44: a visit has a team,
 * not an owner). Anyone who writes to the survey from the field joins it.
 */
export async function joinSurveyVisit(tx: Tx, surveyId: string, societyId: string, actorId: string): Promise<string> {
  // One visit per survey, by construction: its id is derived from the survey,
  // and both inserts skip a row that is already there. Two phones syncing at
  // the same moment can then never make two visits, or fail on each other.
  const id = `sv-${surveyId}`;
  await tx.fieldVisit.createMany({
    data: [{ id, type: "survey", sourceType: "SiteSurvey", sourceId: surveyId, societyId, state: "in_progress" }],
    skipDuplicates: true,
  });
  await tx.fieldVisitParticipant.createMany({
    data: [{ fieldVisitId: id, userId: actorId, acceptedAt: new Date() }],
    skipDuplicates: true,
  });
  return id;
}

/** Move a section from not started to in progress; leave any other state alone. Race-free. */
export async function touchSection(tx: Tx, surveyId: string, section: SurveySection, actorId: string) {
  await tx.surveySection.createMany({
    data: [{ siteSurveyId: surveyId, section, state: "in_progress", updatedById: actorId }],
    skipDuplicates: true,
  });
  await tx.surveySection.updateMany({
    where: { siteSurveyId: surveyId, section, state: "not_started" },
    data: { state: "in_progress", updatedById: actorId },
  });
}

// ── SCR-010 — profile & access ───────────────────────────────────────────

export type ProfileInput = {
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

export async function saveProfileAs(actor: SurveyActor, input: ProfileInput): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "profile");
  if (g.error !== undefined) return { error: g.error };
  if (input.latitude !== null && !coordinatesPlausible(input.latitude, input.longitude)) {
    return { error: "Drop the pin on the building — the location we got looks wrong." };
  }
  if (input.rwaMemberCount !== null && (!Number.isInteger(input.rwaMemberCount) || input.rwaMemberCount < 0 || input.rwaMemberCount > 20000)) {
    return { error: "The RWA member count must be a whole number up to 20,000." };
  }
  if (input.nextElectionDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextElectionDate)) return { error: "Unreadable election date." };
  if (input.gateContactPhone.trim() && !normaliseMobile(input.gateContactPhone)) return { error: "The gate contact's number is not a 10-digit mobile number." };
  if (input.noticeRequired === "days" && !(input.noticeDays && input.noticeDays > 0)) return { error: "How many days' notice?" };

  await db.$transaction(async (tx) => {
    await tx.siteSurvey.update({
      where: { id: input.surveyId },
      data: {
        address: input.address.trim() || null,
        latitude: input.latitude,
        longitude: input.longitude,
        locationAccuracyM: input.accuracyM,
        locationManual: input.manual,
        rwaMemberCount: input.rwaMemberCount,
        nextElectionDate: input.nextElectionDate ? new Date(`${input.nextElectionDate}T00:00:00Z`) : null,
        gateContactName: input.gateContactName.trim() || null,
        gateContactPhone: input.gateContactPhone.trim() ? normaliseMobile(input.gateContactPhone) : null,
        accessHours: input.accessHours.trim() || null,
        noticeRequired: input.noticeRequired || null,
        noticeDays: input.noticeRequired === "days" ? input.noticeDays : null,
        parkingNotes: input.parkingNotes.trim() || null,
        passIdNotes: input.passIdNotes.trim() || null,
      },
    });
    await joinSurveyVisit(tx, input.surveyId, g.survey.pipeline.societyId, actor.id);
    await touchSection(tx, input.surveyId, "profile", actor.id);
  });
  logger.info("survey.profile_saved", { actorId: actor.id, surveyId: input.surveyId, manualPin: input.manual, accuracyM: input.accuracyM });
  return { ok: true };
}

/**
 * A committee member, written into the society's member register (the
 * register's rules win — 19-field-app.md §16). The id is made on the phone,
 * so a replay finds the member instead of adding them twice.
 */
export async function addCommitteeMemberAs(
  actor: SurveyActor,
  input: { surveyId: string; memberId: string; name: string; mobile: string; email: string; positionId: string; primary: boolean },
): Promise<Done<{ memberId: string }>> {
  const g = await surveyForWrite(actor, input.surveyId, "profile");
  if (g.error !== undefined) return { error: g.error };
  const societyId = g.survey.pipeline.societyId;

  const existing = await db.societyMember.findUnique({ where: { id: input.memberId }, select: { societyId: true } });
  if (existing) {
    if (existing.societyId !== societyId) return { error: "That member belongs to another society." };
    return { ok: true, memberId: input.memberId };
  }
  const refusal = refuseMember({ name: input.name, mobile: input.mobile, email: input.email, positionId: input.positionId, newPosition: "" });
  if (refusal) return { error: refusal };
  const position = await db.memberPosition.findUnique({ where: { id: input.positionId }, select: { active: true } });
  if (!position?.active) return { error: "Choose their position from the list." };
  const mobile = normaliseMobile(input.mobile)!;
  const dup = await db.societyMember.findFirst({ where: { societyId, mobile, endedOn: null }, select: { name: true } });
  if (dup) return { error: `${dup.name} is already on the committee on this mobile number.` };

  await db.$transaction(async (tx) => {
    if (input.primary) {
      await tx.societyMember.updateMany({ where: { societyId, endedOn: null, primaryContact: true }, data: { primaryContact: false } });
    }
    await tx.societyMember.create({
      data: {
        id: input.memberId,
        societyId,
        name: input.name.trim(),
        mobile,
        email: input.email.trim().toLowerCase() || null,
        positionId: input.positionId,
        primaryContact: input.primary,
        notes: "Recorded on the site survey.",
        createdById: actor.id,
      },
    });
    await joinSurveyVisit(tx, input.surveyId, societyId, actor.id);
    await touchSection(tx, input.surveyId, "profile", actor.id);
  });
  logger.info("survey.member_added", { actorId: actor.id, surveyId: input.surveyId, memberId: input.memberId, primary: input.primary });
  return { ok: true, memberId: input.memberId };
}

/** Move the primary-contact mark to this member (never duplicate it). */
export async function setPrimaryContactAs(actor: SurveyActor, input: { surveyId: string; memberId: string }): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "profile");
  if (g.error !== undefined) return { error: g.error };
  const societyId = g.survey.pipeline.societyId;
  const m = await db.societyMember.findUnique({ where: { id: input.memberId }, select: { societyId: true, endedOn: true } });
  if (!m || m.societyId !== societyId || m.endedOn) return { error: "That person is not a current member of this society." };
  await db.$transaction(async (tx) => {
    await tx.societyMember.updateMany({ where: { societyId, endedOn: null, primaryContact: true, id: { not: input.memberId } }, data: { primaryContact: false } });
    await tx.societyMember.update({ where: { id: input.memberId }, data: { primaryContact: true } });
  });
  logger.info("survey.primary_contact_set", { actorId: actor.id, surveyId: input.surveyId, memberId: input.memberId });
  return { ok: true };
}

// ── section state ────────────────────────────────────────────────────────

async function profileGapsFor(surveyId: string): Promise<string[]> {
  const s = await db.siteSurvey.findUnique({
    where: { id: surveyId },
    select: { latitude: true, longitude: true, address: true, pipeline: { select: { societyId: true } } },
  });
  if (!s) return ["That survey no longer exists."];
  const members = await db.societyMember.findMany({ where: { societyId: s.pipeline.societyId, endedOn: null }, select: { primaryContact: true } });
  return profileGaps({
    latitude: s.latitude,
    longitude: s.longitude,
    address: s.address,
    currentMembers: members.length,
    primaryContact: members.some((m) => m.primaryContact),
  });
}
/** What still stops a section being marked complete, each named. */
export async function sectionGaps(surveyId: string, section: SurveySection): Promise<string[]> {
  switch (section) {
    case "profile":
      return profileGapsFor(surveyId);
    case "inventory":
      return inventoryGapsFor(surveyId);
    case "circuits":
      return circuitGapsFor(surveyId);
    case "pump_room":
      return pumpRoomGapsFor(surveyId);
  }
}

// Filled in with their sections (8b–8d).
async function inventoryGapsFor(surveyId: string): Promise<string[]> {
  const rows = await liveInventory(surveyId);
  return inventoryGaps(rows, await contestedAreaNames(surveyId));
}
async function circuitGapsFor(surveyId: string): Promise<string[]> {
  const [rows, circuits, outcomes] = await Promise.all([
    liveInventory(surveyId),
    db.circuit.findMany({ where: { siteSurveyId: surveyId, voidedAt: null }, select: { lightType: true, state: true } }),
    db.surveyTypeOutcome.findMany({ where: { siteSurveyId: surveyId }, select: { lightTypeKey: true } }),
  ]);
  const types = new Map<string, string>();
  for (const r of rows) types.set(lightTypeKey(r.lightType), r.lightType);
  // A type is resolved by a circuit recorded for it — eligible, or waiting on
  // an exception — or by being marked unresolvable. An ineligible candidate is
  // evidence, not an outcome: another circuit is needed.
  const resolved = new Set<string>([
    ...circuits.filter((c) => c.state !== "ineligible").map((c) => lightTypeKey(c.lightType)),
    ...outcomes.map((o) => o.lightTypeKey),
  ]);
  return circuitGaps({ inventoryTypes: [...types].map(([key, label]) => ({ key, label })), resolvedTypeKeys: resolved });
}
async function pumpRoomGapsFor(surveyId: string): Promise<string[]> {
  const room = await loadPumpRoom(surveyId);
  return pumpRoomGaps({ structure: room.structure, answers: room.answers, logbookNotMaintained: room.logbookNotMaintained, logbookPages: room.logbookPages.length });
}

/**
 * Complete, flag (with a reason — a partial survey is "common and normal"),
 * or reopen a section. Complete is refused while the section has gaps, and
 * each gap is named.
 */
export async function setSectionAs(
  actor: SurveyActor,
  input: { surveyId: string; section: SurveySection; state: "complete" | "flagged" | "in_progress"; reason: string },
): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, input.section);
  if (g.error !== undefined) return { error: g.error };
  if (input.state === "flagged" && !input.reason.trim()) return { error: "Say why this section is being left incomplete — the office sees the reason." };
  if (input.state === "complete") {
    const gaps = await sectionGaps(input.surveyId, input.section);
    if (gaps.length > 0) return { error: `${SECTION_LABEL[input.section]} is not finished. ${gaps.join(" ")}` };
  }
  // A queried section answered by the field goes back to the state it is set to.
  await db.$transaction(async (tx) => {
    await tx.surveySection.upsert({
      where: { siteSurveyId_section: { siteSurveyId: input.surveyId, section: input.section } },
      create: { siteSurveyId: input.surveyId, section: input.section, state: input.state, flagReason: input.state === "flagged" ? input.reason.trim() : null, updatedById: actor.id },
      update: { state: input.state, flagReason: input.state === "flagged" ? input.reason.trim() : null, updatedById: actor.id },
    });
    await joinSurveyVisit(tx, input.surveyId, g.survey.pipeline.societyId, actor.id);
  });
  logger.info("survey.section_set", { actorId: actor.id, surveyId: input.surveyId, section: input.section, state: input.state });
  return { ok: true };
}

// ── team and submission ──────────────────────────────────────────────────

/** Areas counted by two people, by name — never summed, never merged (§0.1b). */
export async function contestedAreaNames(surveyId: string): Promise<string[]> {
  const rows = await liveInventory(surveyId);
  return [...contestedAreas(rows).values()].map((list) => list[0].area);
}

/** Teammates (not the actor) whose phones last reported unsent work for this survey. */
export async function teammatesPending(surveyId: string, actorId: string): Promise<{ name: string; count: number }[]> {
  const visit = await db.fieldVisit.findFirst({
    where: { sourceType: "SiteSurvey", sourceId: surveyId },
    select: { participants: { where: { userId: { not: actorId }, pendingCount: { gt: 0 } }, select: { pendingCount: true, user: { select: { name: true, email: true } } } } },
  });
  return (visit?.participants ?? []).map((p) => ({ name: p.user.name ?? p.user.email, count: p.pendingCount ?? 0 }));
}

/** What the phone still holds for a survey, as it last said (§0.1b's "unsynced contributor"). */
export async function reportPendingAs(actor: SurveyActor, pending: Record<string, number>): Promise<Done> {
  const at = new Date();
  for (const [surveyId, count] of Object.entries(pending)) {
    if (!Number.isInteger(count) || count < 0) continue;
    const visit = await db.fieldVisit.findFirst({ where: { sourceType: "SiteSurvey", sourceId: surveyId }, select: { id: true } });
    if (!visit) continue;
    await db.fieldVisitParticipant.updateMany({ where: { fieldVisitId: visit.id, userId: actor.id }, data: { pendingCount: count, pendingReportedAt: at } });
  }
  return { ok: true };
}

/**
 * Submit the survey (FEAT-010): every section complete or flagged, no
 * contested area, no teammate with unsent work. It then becomes read-only for
 * the field team. The society gets the surveyed coordinates when it has none.
 */
export async function submitSurveyAs(actor: SurveyActor, surveyId: string): Promise<Done> {
  const survey = await db.siteSurvey.findUnique({
    where: { id: surveyId },
    select: {
      status: true,
      latitude: true,
      longitude: true,
      sections: { select: { section: true, state: true } },
      pipeline: { select: { societyId: true, society: { select: { latitude: true, longitude: true } } } },
    },
  });
  if (!survey) return { error: "That survey no longer exists." };
  if (survey.status === "submitted") return { error: "This survey has already been submitted." };
  const blockers = submitBlockers({
    states: sectionStates(survey.sections as { section: SurveySection; state: SectionState }[]),
    contestedAreas: await contestedAreaNames(surveyId),
    teammatesPending: await teammatesPending(surveyId, actor.id),
  });
  if (blockers.length > 0) {
    logger.warn("survey.submit_refused", { actorId: actor.id, surveyId, blockers });
    return { error: `Not ready to submit. ${blockers.join(" ")}` };
  }
  await db.$transaction(async (tx) => {
    await tx.siteSurvey.update({ where: { id: surveyId }, data: { status: "submitted", submittedAt: new Date(), submittedById: actor.id } });
    const soc = survey.pipeline.society;
    if (soc.latitude === null && survey.latitude !== null) {
      await tx.society.update({ where: { id: survey.pipeline.societyId }, data: { latitude: survey.latitude, longitude: survey.longitude } });
    }
  });
  logger.info("survey.submitted", { actorId: actor.id, surveyId });
  return { ok: true };
}

/**
 * The office queries a section of a submitted survey: that section only is
 * reopened, for the whole team, with the note pinned at its top.
 */
export async function querySectionAs(actor: SurveyActor, input: { surveyId: string; section: SurveySection; note: string }): Promise<Done> {
  if (!isOps(actor)) return { error: "Querying a submitted survey is the operations lead's review." };
  if (!input.note.trim()) return { error: "Say what needs checking — the surveyor reads this on site." };
  const survey = await db.siteSurvey.findUnique({ where: { id: input.surveyId }, select: { status: true } });
  if (!survey) return { error: "That survey no longer exists." };
  if (survey.status !== "submitted") return { error: "Only a submitted survey can be queried — this one is still open." };
  await db.surveySection.upsert({
    where: { siteSurveyId_section: { siteSurveyId: input.surveyId, section: input.section } },
    create: { siteSurveyId: input.surveyId, section: input.section, state: "queried", queryNote: input.note.trim(), updatedById: actor.id },
    update: { state: "queried", queryNote: input.note.trim(), updatedById: actor.id },
  });
  logger.info("survey.section_queried", { actorId: actor.id, surveyId: input.surveyId, section: input.section });
  return { ok: true };
}

// ── SCR-011 — the lighting inventory, and area claims (§0.1b) ────────────

const AREA_TYPE_LABEL = new Map(FIELD_AREA_TYPES);

/** The live inventory rows with their area keys (a settled contest's losing rows are voided). */
export async function liveInventory(surveyId: string) {
  const rows = await db.lightingInventoryArea.findMany({
    where: { siteSurveyId: surveyId, voidedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, area: true, areaType: true, label: true, lightType: true, count: true, method: true, note: true, countedById: true },
  });
  return rows.map((r) => ({ ...r, areaKey: areaKeyOf(r.areaType, r.label, r.area) }));
}

export type InventoryRowInput = {
  surveyId: string;
  rowId: string;
  areaType: string;
  label: string;
  lightType: string;
  count: number;
  method: "walked" | "records" | "estimated";
  note: string;
};

function refuseRow(input: Omit<InventoryRowInput, "surveyId" | "rowId">): string | null {
  if (!AREA_TYPE_LABEL.has(input.areaType)) return "Which area is this?";
  if (input.label.length > 40) return "Keep the area's name under 40 characters.";
  if (!input.lightType.trim()) return "Which type of lighting is this? It decides which circuit represents it.";
  if (!Number.isInteger(input.count) || input.count < 0) return "A count can't be negative.";
  if (input.count === 0) return "Zero lights? Remove the area instead — we only record areas that exist.";
  if (input.count > 20000) return "That count is not believable for one area.";
  if (!["walked", "records", "estimated"].includes(input.method)) return "How was this counted?";
  if (input.method === "estimated" && !input.note.trim()) return "Say how the estimate was made — ops will see this.";
  return null;
}

/**
 * An area counted on the phone. The row records who counted it — that is the
 * claim. Counting an area someone else has counted is allowed (the phone warns
 * first); the area is then contested until one count is chosen. The id is
 * made on the phone, so a replay finds the row instead of adding it twice.
 */
export async function addInventoryRowAs(actor: SurveyActor, input: InventoryRowInput): Promise<Done<{ rowId: string; contested: boolean }>> {
  const g = await surveyForWrite(actor, input.surveyId, "inventory");
  if (g.error !== undefined) return { error: g.error };
  const existing = await db.lightingInventoryArea.findUnique({ where: { id: input.rowId }, select: { siteSurveyId: true } });
  if (existing) {
    if (existing.siteSurveyId !== input.surveyId) return { error: "That row belongs to another survey." };
    return { ok: true, rowId: input.rowId, contested: false };
  }
  const refusal = refuseRow(input);
  if (refusal) return { error: refusal };
  const area = areaDisplay(AREA_TYPE_LABEL.get(input.areaType)!, input.label, "");
  await db.$transaction(async (tx) => {
    await tx.lightingInventoryArea.create({
      data: {
        id: input.rowId,
        siteSurveyId: input.surveyId,
        area,
        areaType: input.areaType,
        label: input.label.trim() || null,
        lightType: input.lightType.trim(),
        count: input.count,
        method: input.method,
        note: input.note.trim() || null,
        countedById: actor.id,
      },
    });
    await joinSurveyVisit(tx, input.surveyId, g.survey.pipeline.societyId, actor.id);
    await touchSection(tx, input.surveyId, "inventory", actor.id);
  });
  const key = areaKeyOf(input.areaType, input.label, area);
  const contested = contestedAreas(await liveInventory(input.surveyId)).has(key);
  logger.info("survey.area_counted", { actorId: actor.id, surveyId: input.surveyId, rowId: input.rowId, area, count: input.count, method: input.method, contested });
  return { ok: true, rowId: input.rowId, contested };
}

/** Correct a row's count, type, method or note (sets values; a replay changes nothing). */
export async function updateInventoryRowAs(
  actor: SurveyActor,
  input: { surveyId: string; rowId: string; lightType: string; count: number; method: "walked" | "records" | "estimated"; note: string },
): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "inventory");
  if (g.error !== undefined) return { error: g.error };
  const row = await db.lightingInventoryArea.findUnique({ where: { id: input.rowId }, select: { siteSurveyId: true, areaType: true, label: true, voidedAt: true } });
  if (!row || row.siteSurveyId !== input.surveyId || row.voidedAt) return { error: "That area is no longer on the survey." };
  const refusal = refuseRow({ areaType: row.areaType ?? "other", label: row.label ?? "", lightType: input.lightType, count: input.count, method: input.method, note: input.note });
  if (refusal) return { error: refusal };
  await db.lightingInventoryArea.update({
    where: { id: input.rowId },
    data: { lightType: input.lightType.trim(), count: input.count, method: input.method, note: input.note.trim() || null },
  });
  logger.info("survey.area_corrected", { actorId: actor.id, surveyId: input.surveyId, rowId: input.rowId, count: input.count });
  return { ok: true };
}

/** Remove an area row on a draft survey. Removing one already gone is not an error. */
export async function removeInventoryRowAs(actor: SurveyActor, input: { surveyId: string; rowId: string }): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "inventory");
  if (g.error !== undefined) return { error: g.error };
  const row = await db.lightingInventoryArea.findUnique({ where: { id: input.rowId }, select: { siteSurveyId: true } });
  if (!row) return { ok: true };
  if (row.siteSurveyId !== input.surveyId) return { error: "That row belongs to another survey." };
  await db.lightingInventoryArea.delete({ where: { id: input.rowId } });
  logger.info("survey.area_removed", { actorId: actor.id, surveyId: input.surveyId, rowId: input.rowId });
  return { ok: true };
}

/**
 * Settle a contested area (§0.1b "Reconciliation"): keep one person's count and
 * void the others' rows with the stated reason. Never a sum, never a merge.
 * The voided rows stay on record, and who chose is recorded.
 */
export async function settleContestAs(actor: SurveyActor, input: { surveyId: string; areaKey: string; keepCountedBy: string; reason: string }): Promise<Done<{ voided: number }>> {
  const g = await surveyForWrite(actor, input.surveyId, "inventory");
  if (g.error !== undefined) return { error: g.error };
  if (input.reason.trim().length < 5) return { error: "Say why this count is the right one — it is kept with the decision." };
  const contest = contestedAreas(await liveInventory(input.surveyId)).get(input.areaKey);
  if (!contest) return { ok: true, voided: 0 }; // already settled (a replay, or a teammate did it)
  const keep = input.keepCountedBy;
  if (!contest.some((r) => (r.countedById ?? "office") === keep)) return { error: "Choose one of the counts recorded for this area." };
  const losers = contest.filter((r) => (r.countedById ?? "office") !== keep).map((r) => r.id);
  await db.lightingInventoryArea.updateMany({
    where: { id: { in: losers } },
    data: { voidedAt: new Date(), voidedById: actor.id, voidReason: `Contested area settled: ${input.reason.trim()}` },
  });
  logger.info("survey.contest_settled", { actorId: actor.id, surveyId: input.surveyId, areaKey: input.areaKey, kept: keep, voided: losers.length });
  return { ok: true, voided: losers.length };
}

// ── survey photos ────────────────────────────────────────────────────────

/** One sitting's photos of a subject that can be photographed again later (a pump unit, a logbook month). */
export const PHOTO_BATCH_RE = /^[a-z0-9]{6,12}$/;

/** The most photos one survey subject (the site, a circuit, a pump unit…) may carry. */
export const MAX_SUBJECT_PHOTOS = 12;
export type PhotoSubject = "site" | "area" | "circuit" | "pump_unit" | "logbook";

/**
 * A survey photo's S3 key — deterministic per survey, subject and number, so a
 * photo re-sent after a dropped connection overwrites itself, and checkable,
 * so the sync route accepts only keys it would itself have issued. The period
 * is the survey's own month (it documents the survey visit).
 */
export function surveyPhotoKey(input: { societyName: string; surveyCreatedAt: Date; surveyId: string; subject: PhotoSubject; subjectKey: string; index: number }): string {
  return buildDocumentKey({
    society: input.societyName,
    month: input.surveyCreatedAt.toISOString().slice(0, 7),
    docType: "surveyPhoto",
    dateLabel: input.subject,
    identifier: `${input.subjectKey || input.surveyId}-${input.index + 1}`,
    extension: "jpg",
  });
}

/** Record photos already uploaded for a subject, refusing any key this app did not issue. */
export async function attachSurveyPhotos(input: {
  surveyId: string;
  subject: PhotoSubject;
  subjectKey: string;
  keys: string[];
  month?: string | null;
  actorId: string;
}): Promise<Done> {
  if (input.keys.length === 0) return { ok: true };
  if (input.keys.length > MAX_SUBJECT_PHOTOS) return { error: `At most ${MAX_SUBJECT_PHOTOS} photos here.` };
  const survey = await db.siteSurvey.findUnique({ where: { id: input.surveyId }, select: { createdAt: true, pipeline: { select: { society: { select: { name: true } } } } } });
  if (!survey) return { error: "That survey no longer exists." };
  const issued = new Set(
    Array.from({ length: MAX_SUBJECT_PHOTOS }, (_, index) =>
      surveyPhotoKey({ societyName: survey.pipeline.society.name, surveyCreatedAt: survey.createdAt, surveyId: input.surveyId, subject: input.subject, subjectKey: input.subjectKey, index }),
    ),
  );
  if (input.keys.some((k) => !issued.has(k))) return { error: "A photo was not uploaded for this part of the survey." };
  await db.surveyPhoto.createMany({
    data: input.keys.map((key) => ({ siteSurveyId: input.surveyId, subject: input.subject, subjectKey: input.subjectKey, month: input.month ?? null, key, takenById: input.actorId })),
    skipDuplicates: true,
  });
  return { ok: true };
}

// ── SCR-012 — circuit selection per light type ───────────────────────────

export type FieldCandidateInput = {
  surveyId: string;
  circuitId: string;
  lightType: string;
  location: string;
  lines: CandidateLine[];
  workingHours: number | null;
  wifiReachable: boolean;
  fixturesUnder15ft: boolean;
  notOnDrivewayOrRamp: boolean;
  notInStiltParking: boolean;
  typicalityNote: string;
  photoKeys: string[];
};

/**
 * A candidate circuit recorded on the phone, through the office's own
 * candidate rules (circuit-candidate-core.ts). The phone adds what the spec
 * asks of the field: a typicality answer and a photo of the panel. The
 * represented count is not typed — it is the type's surveyed total less the
 * lights on this circuit (the demo's own lights), from the live inventory.
 */
export async function recordFieldCandidateAs(actor: SurveyActor, input: FieldCandidateInput): Promise<Done<{ circuitId: string; state: string }>> {
  const g = await surveyForWrite(actor, input.surveyId, "circuits");
  if (g.error !== undefined) return { error: g.error };
  const existing = await db.circuit.findUnique({ where: { id: input.circuitId }, select: { siteSurveyId: true, state: true } });
  if (existing) {
    if (existing.siteSurveyId !== input.surveyId) return { error: "That circuit belongs to another survey." };
    const photos = await attachSurveyPhotos({ surveyId: input.surveyId, subject: "circuit", subjectKey: input.circuitId, keys: input.photoKeys, actorId: actor.id });
    if ("error" in photos) return photos;
    return { ok: true, circuitId: input.circuitId, state: existing.state };
  }
  if (input.typicalityNote.trim().length < 20) {
    return { error: "Ops can't check this from a desk — describe why this circuit represents the rest (at least a sentence)." };
  }
  if (input.photoKeys.length === 0) return { error: "Photograph the panel — the installer finds the circuit by it." };
  if (!input.location.trim()) return { error: "Name the panel and where it is, so the installer finds it." };

  const typeKey = lightTypeKey(input.lightType);
  const surveyed = (await liveInventory(input.surveyId)).filter((r) => lightTypeKey(r.lightType) === typeKey).reduce((n, r) => n + r.count, 0);
  const metered = input.lines.reduce((n, l) => n + (Number.isFinite(l.count) ? l.count : 0), 0);
  const represented = fullFromTotal(surveyed, metered);
  if (surveyed === 0) return { error: `No ${input.lightType} lights are in the inventory — count them first; the circuit represents them.` };
  if (represented <= 0) return { error: `The inventory counts ${surveyed} ${input.lightType} lights and this circuit alone has ${metered} — recount the inventory; the circuit is a sample of the rest.` };

  const pipeline = await db.pipeline.findUnique({ where: { id: g.survey.pipelineId }, select: { societyId: true, serviceLine: true } });
  if (!pipeline) return { error: "That deal no longer exists." };
  const r = await recordCandidateAs(actor, {
    siteSurveyId: input.surveyId,
    societyId: pipeline.societyId,
    serviceLine: pipeline.serviceLine,
    lightType: input.lightType,
    location: input.location,
    representedLightCount: represented,
    lines: input.lines,
    workingHours: input.workingHours ?? undefined,
    wifiReachable: input.wifiReachable,
    fixturesUnder15ft: input.fixturesUnder15ft,
    notOnDrivewayOrRamp: input.notOnDrivewayOrRamp,
    notInStiltParking: input.notInStiltParking,
    circuitId: input.circuitId,
    typicalityNote: input.typicalityNote,
  });
  if ("error" in r) return { error: r.error };
  const photos = await attachSurveyPhotos({ surveyId: input.surveyId, subject: "circuit", subjectKey: input.circuitId, keys: input.photoKeys, actorId: actor.id });
  if ("error" in photos) return photos;
  await db.$transaction(async (tx) => {
    await joinSurveyVisit(tx, input.surveyId, pipeline.societyId, actor.id);
    await touchSection(tx, input.surveyId, "circuits", actor.id);
  });
  return { ok: true, circuitId: r.circuitId, state: r.state };
}

/**
 * No eligible circuit for a light type, with what was found (SCR-012). The
 * office decides — leave the type out, or approve an exception — and neither
 * may be silent. Setting it again replaces the reason.
 */
export async function markTypeUnresolvableAs(actor: SurveyActor, input: { surveyId: string; lightType: string; reason: string }): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "circuits");
  if (g.error !== undefined) return { error: g.error };
  if (input.reason.trim().length < 10) return { error: "Say what you found — the office decides from this." };
  const key = lightTypeKey(input.lightType);
  await db.surveyTypeOutcome.upsert({
    where: { siteSurveyId_lightTypeKey: { siteSurveyId: input.surveyId, lightTypeKey: key } },
    create: { siteSurveyId: input.surveyId, lightType: input.lightType.trim(), lightTypeKey: key, reason: input.reason.trim(), recordedById: actor.id },
    update: { reason: input.reason.trim(), recordedById: actor.id },
  });
  await db.$transaction(async (tx) => {
    await joinSurveyVisit(tx, input.surveyId, g.survey.pipeline.societyId, actor.id);
    await touchSection(tx, input.surveyId, "circuits", actor.id);
  });
  logger.info("survey.type_unresolvable", { actorId: actor.id, surveyId: input.surveyId, lightType: input.lightType });
  return { ok: true };
}

// ── SCR-013 — pump room audit & logbook ──────────────────────────────────

/** The room as recorded: its structure, each unit's answer (with its photo count), the logbook. */
export async function loadPumpRoom(surveyId: string) {
  const [audit, photos] = await Promise.all([
    db.pumpRoomAudit.findUnique({ where: { siteSurveyId: surveyId }, include: { units: true } }),
    db.surveyPhoto.findMany({ where: { siteSurveyId: surveyId, subject: { in: ["pump_unit", "logbook"] } }, select: { subject: true, subjectKey: true, month: true, key: true } }),
  ]);
  const unitPhotos = new Map<string, number>();
  // A unit's photos are keyed "{unitKey}.{batch}" — one batch per sitting, so a
  // later sitting's photos never overwrite an earlier one's.
  for (const p of photos) {
    if (p.subject !== "pump_unit") continue;
    const unitKey = p.subjectKey.slice(0, p.subjectKey.lastIndexOf("."));
    unitPhotos.set(unitKey, (unitPhotos.get(unitKey) ?? 0) + 1);
  }
  const structure: PumpStructure | null = audit
    ? {
        pumpType: audit.pumpType ?? "",
        pumpHp: audit.pumpHp,
        pumpCount: audit.pumpCount,
        feedPipe: audit.feedPipe ?? "",
        outflowPipe: audit.outflowPipe ?? "",
        vfdArrangement: (audit.vfdArrangement ?? "") as PumpStructure["vfdArrangement"],
        towers: (audit.towers ?? []) as PumpStructure["towers"],
      }
    : null;
  const answers = new Map<string, UnitAnswer>(
    (audit?.units ?? []).map((u) => [
      u.unitKey,
      { installed: u.installed, brand: u.brand ?? "", model: u.model ?? "", condition: (u.condition as Condition | null) ?? null, photos: unitPhotos.get(u.unitKey) ?? 0 },
    ]),
  );
  return {
    structure,
    answers,
    logbookNotMaintained: audit?.logbookNotMaintained ?? false,
    logbookPages: photos.filter((p) => p.subject === "logbook").map((p) => ({ month: p.month ?? "", key: p.key })),
  };
}

/**
 * Pass 1 — the room's structure. Sets values; the generated unit rows follow
 * it: rows the new structure implies are added, rows it no longer implies are
 * removed (the phone warns before that drops an answered one).
 */
export async function savePumpStructureAs(actor: SurveyActor, input: { surveyId: string; structure: PumpStructure }): Promise<Done<{ units: number }>> {
  const g = await surveyForWrite(actor, input.surveyId, "pump_room");
  if (g.error !== undefined) return { error: g.error };
  const refusal = refuseStructure(input.structure);
  if (refusal) return { error: refusal };
  const s = input.structure;
  const units = generateUnits(s);
  await db.$transaction(async (tx) => {
    const data = {
      pumpType: s.pumpType.trim(),
      pumpHp: s.pumpHp,
      pumpCount: s.pumpCount,
      feedPipe: s.feedPipe.trim(),
      outflowPipe: s.outflowPipe.trim(),
      vfdArrangement: s.vfdArrangement || null,
      towers: s.towers.map((t) => ({ name: t.name.trim(), tanks: t.tanks.map((k) => ({ type: k.type.trim(), capacityL: k.capacityL })) })),
      updatedById: actor.id,
    };
    const audit = await tx.pumpRoomAudit.upsert({ where: { siteSurveyId: input.surveyId }, create: { siteSurveyId: input.surveyId, ...data }, update: data });
    await tx.pumpRoomUnit.createMany({
      data: units.map((u) => ({ auditId: audit.id, unitKey: u.unitKey, category: u.category })),
      skipDuplicates: true,
    });
    await tx.pumpRoomUnit.deleteMany({ where: { auditId: audit.id, unitKey: { notIn: units.map((u) => u.unitKey) } } });
    await joinSurveyVisit(tx, input.surveyId, g.survey.pipeline.societyId, actor.id);
    await touchSection(tx, input.surveyId, "pump_room", actor.id);
  });
  logger.info("survey.pump_structure_saved", { actorId: actor.id, surveyId: input.surveyId, units: units.length });
  return { ok: true, units: units.length };
}

/** Pass 2 — one unit: fitted or not, and when fitted its brand, model, condition and photos. */
export async function recordPumpUnitAs(
  actor: SurveyActor,
  input: { surveyId: string; unitKey: string; installed: boolean; brand: string; model: string; condition: Condition | null; photoKeys: string[]; photoBatch: string },
): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "pump_room");
  if (g.error !== undefined) return { error: g.error };
  const audit = await db.pumpRoomAudit.findUnique({ where: { siteSurveyId: input.surveyId }, select: { id: true } });
  if (!audit) return { error: "Record the room first — how many pumps, towers and tanks." };
  const unit = await db.pumpRoomUnit.findUnique({ where: { auditId_unitKey: { auditId: audit.id, unitKey: input.unitKey } } });
  if (!unit) return { error: "That unit is no longer in the room's structure — the tank or pump count changed." };
  if (input.installed) {
    if (!input.brand.trim() || !input.model.trim()) return { error: "Brand and model — read it off the label, or write 'label unreadable'." };
    if (!input.condition) return { error: "What condition is it in?" };
  }
  if (input.photoKeys.length > 0 && !PHOTO_BATCH_RE.test(input.photoBatch)) return { error: "The photos have no valid batch." };
  const photos = await attachSurveyPhotos({ surveyId: input.surveyId, subject: "pump_unit", subjectKey: `${input.unitKey}.${input.photoBatch}`, keys: input.photoKeys, actorId: actor.id });
  if ("error" in photos) return photos;
  await db.pumpRoomUnit.update({
    where: { id: unit.id },
    data: input.installed
      ? { installed: true, brand: input.brand.trim(), model: input.model.trim(), condition: input.condition, updatedById: actor.id }
      : { installed: false, brand: null, model: null, condition: null, updatedById: actor.id },
  });
  logger.info("survey.pump_unit_recorded", { actorId: actor.id, surveyId: input.surveyId, unitKey: input.unitKey, installed: input.installed, photos: input.photoKeys.length });
  return { ok: true };
}

/** "Logbook not maintained" — an answer, not an empty state (FEAT-009 AC-2). Reversible. */
export async function setLogbookNotMaintainedAs(actor: SurveyActor, input: { surveyId: string; notMaintained: boolean }): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "pump_room");
  if (g.error !== undefined) return { error: g.error };
  await db.pumpRoomAudit.upsert({
    where: { siteSurveyId: input.surveyId },
    create: { siteSurveyId: input.surveyId, logbookNotMaintained: input.notMaintained, updatedById: actor.id },
    update: { logbookNotMaintained: input.notMaintained, updatedById: actor.id },
  });
  return { ok: true };
}

/** Logbook pages for one month — the month chosen, never inferred (CON-25). */
export async function addLogbookPagesAs(actor: SurveyActor, input: { surveyId: string; month: string; photoKeys: string[]; photoBatch: string }): Promise<Done> {
  const g = await surveyForWrite(actor, input.surveyId, "pump_room");
  if (g.error !== undefined) return { error: g.error };
  if (!logbookMonths(new Date()).includes(input.month)) return { error: "Which month is this page? This month or one of the 12 before it." };
  if (input.photoKeys.length === 0) return { error: "Photograph the page." };
  if (!PHOTO_BATCH_RE.test(input.photoBatch)) return { error: "The photos have no valid batch." };
  return attachSurveyPhotos({ surveyId: input.surveyId, subject: "logbook", subjectKey: `${input.month}.${input.photoBatch}`, keys: input.photoKeys, month: input.month, actorId: actor.id });
}
