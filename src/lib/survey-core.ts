import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normaliseMobile, refuseMember } from "@/lib/society-members";
import {
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
  let visit = await tx.fieldVisit.findFirst({ where: { sourceType: "SiteSurvey", sourceId: surveyId }, select: { id: true } });
  if (!visit) {
    visit = await tx.fieldVisit.create({
      data: { type: "survey", sourceType: "SiteSurvey", sourceId: surveyId, societyId, state: "in_progress" },
      select: { id: true },
    });
  }
  await tx.fieldVisitParticipant.upsert({
    where: { fieldVisitId_userId: { fieldVisitId: visit.id, userId: actorId } },
    create: { fieldVisitId: visit.id, userId: actorId, acceptedAt: new Date() },
    update: {},
  });
  return visit.id;
}

/** Move a section from not started to in progress; leave any other state alone. */
export async function touchSection(tx: Tx, surveyId: string, section: SurveySection, actorId: string) {
  const row = await tx.surveySection.findUnique({ where: { siteSurveyId_section: { siteSurveyId: surveyId, section } } });
  if (!row) {
    await tx.surveySection.create({ data: { siteSurveyId: surveyId, section, state: "in_progress", updatedById: actorId } });
  } else if (row.state === "not_started") {
    await tx.surveySection.update({ where: { id: row.id }, data: { state: "in_progress", updatedById: actorId } });
  }
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
  void surveyId;
  return ["The lighting inventory is recorded on the office screen for now."];
}
async function circuitGapsFor(surveyId: string): Promise<string[]> {
  void surveyId;
  return ["Circuits are selected on the office screen for now."];
}
async function pumpRoomGapsFor(surveyId: string): Promise<string[]> {
  void surveyId;
  return ["The pump room audit is not built yet — flag it if the room was not surveyed."];
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

/** Areas counted by two people, by name (filled in with the inventory, 8b). */
export async function contestedAreaNames(surveyId: string): Promise<string[]> {
  void surveyId;
  return [];
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
