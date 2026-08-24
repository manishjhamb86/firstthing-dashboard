"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { canOwn, isOperations, mayAct, teamMeta } from "@/lib/admin-teams";
import { resolveAdmin } from "@/lib/admin-permissions";
import { refuseOrderedDate } from "@/lib/step-dates";
import { resolveBackdate } from "@/lib/backdate";
import { formatDate } from "@/lib/format-date";

const SERVICE_LINES = ["lighting", "pumps", "solar", "wastewater"] as const;

// FEAT-001: log a new lead. Creates the Society (quick, prospect-only —
// full onboarding stays /admin/societies/new's job, same "minimal
// quick-create vs. full form" split PROJECT_CONTEXT.md already documents
// for the archived invoice flow) and the Pipeline record together, and
// ensures the (society, serviceLine) Engagement exists (FEAT-039-AC-1 —
// the engagement is the thing every pipeline/contract/circuit keys
// against, so a lead without one leaves the society-detail screen claiming
// an enrollment that never happened).
export async function createLead(input: {
  societyId?: string;
  newSociety?: { name: string; location: string; flatCount: number };
  serviceLine: string;
  contactName: string;
  contactPhone?: string;
  meetingDate: string;
  notes?: string;
  salesOwnerId: string;
  confirmDuplicate?: boolean;
  /** DEMO_MODE only — the day this lead was actually logged. */
  loggedOn?: string;
}): Promise<{ error?: string; duplicateOf?: string } | undefined> {
  const session = await requireAdminPermission("manage_pipeline");

  const contactName = input.contactName.trim();
  if (!contactName) return { error: "Contact name is required." };
  if (!input.meetingDate || Number.isNaN(new Date(input.meetingDate).getTime())) {
    return { error: "A valid meeting date is required." };
  }
  if (!SERVICE_LINES.includes(input.serviceLine as (typeof SERVICE_LINES)[number])) {
    return { error: "Service line is required." };
  }
  if (!input.salesOwnerId) return { error: "Choose who this lead belongs to." };

  // The picker only offers eligible accounts, but the picker is not the gate:
  // a lead may only be assigned to a team that owns leads (admin or sales).
  const owner = await db.adminUser.findFirst({
    where: { id: input.salesOwnerId, isActive: true, deletedAt: null },
    select: { id: true, team: true, name: true, email: true },
  });
  if (!owner) return { error: "That account cannot take a lead." };
  if (!canOwn(owner.team, "lead")) {
    return {
      error: `${owner.name ?? owner.email} is on the ${teamMeta(owner.team).label} team — a lead belongs to admin or sales.`,
    };
  }

  let societyId = input.societyId;
  if (!societyId) {
    const ns = input.newSociety;
    const name = ns?.name.trim();
    const location = ns?.location.trim();
    if (!name || !location) return { error: "Society name and location are required." };
    if (!ns || !Number.isFinite(ns.flatCount) || ns.flatCount <= 0) {
      return { error: "Flat count must be a positive number." };
    }

    // FEAT-085-AC-3 — a same-name/same-location duplicate is flagged for
    // review, never silently created. /admin/societies/new already had
    // this; the lead quick-create path didn't, and actually produced a
    // duplicate society row in real use before this check landed.
    if (!input.confirmDuplicate) {
      const existing = await db.society.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, location: { equals: location, mode: "insensitive" } },
      });
      if (existing) {
        logger.warn("society.duplicate_flagged", { name, location, existingId: existing.id, via: "lead" });
        return {
          error: `A society named "${existing.name}" in ${existing.location} already exists — pick it from the list above, or confirm this is genuinely a different one.`,
          duplicateOf: existing.id,
        };
      }
    }

    // A society created BY this lead cannot postdate it: backdate the
    // society to the same day rather than stamping now() and then refusing
    // the lead for preceding its own society.
    const quickCreatedAt = await resolveBackdate(input.loggedOn, "The society record");
    if (typeof quickCreatedAt === "string") return { error: quickCreatedAt };
    const society = await db.society.create({
      data: {
        name,
        location,
        flatCount: ns.flatCount,
        status: "prospect",
        ...(quickCreatedAt ? { createdAt: quickCreatedAt } : {}),
      },
    });
    societyId = society.id;
    logger.info("society.quick_created", { societyId, name, location, via: "lead" });
  }

  // CON-24 — one Pipeline per (society, serviceLine).
  const existing = await db.pipeline.findUnique({
    where: { societyId_serviceLine: { societyId, serviceLine: input.serviceLine as never } },
  });
  if (existing) {
    return { error: "This society already has a pipeline open for that service line." };
  }

  // FEAT-039 — ensure the engagement exists for this (society, serviceLine).
  // Logging a lead IS the act of engaging the society on that service line;
  // without this, the society-detail screen's service-lines panel stayed
  // empty for every society that came in through the lead flow.
  const engagement = await db.engagement.findUnique({
    where: { societyId_serviceLine: { societyId, serviceLine: input.serviceLine as never } },
  });
  if (!engagement) {
    await db.engagement.create({ data: { societyId, serviceLine: input.serviceLine as never } });
    logger.info("society.service_line_enrolled", {
      actorId: session.user.id,
      societyId,
      serviceLine: input.serviceLine,
      via: "lead",
    });
  }

  const authoritative = input.salesOwnerId === session.user.id;

  // A backdated lead is ordered against the society it belongs to; the
  // meeting is ordered the same way. Both rules hold in normal operation
  // too — they are simply satisfied for free when everything is now().
  const society = await db.society.findUnique({
    where: { id: societyId },
    select: { createdAt: true },
  });
  // Ordered against the society only when the society already existed. A
  // quick-created one is stamped now() by this very call, so ordering against
  // it refuses every backdated lead for a new society — the same circularity
  // the edit path documents.
  const loggedAt = await resolveBackdate(
    input.loggedOn,
    "The lead",
    input.societyId ? [{ label: "the society record", date: society?.createdAt ?? null }] : [],
  );
  if (typeof loggedAt === "string") return { error: loggedAt };

  // The meeting is NOT ordered against the society record. Meeting the
  // committee is what causes the record to exist, so a meeting held last week
  // for a society being entered today is the ordinary case — ordering it
  // against `society.createdAt` refused every real backdated lead, since a
  // quick-created society is always stamped now(). The lead's own logged-at
  // date above still is ordered that way, because that one IS about our
  // records. Only "not in the future" applies here.
  const meetingDate = new Date(input.meetingDate);
  const meetingRefusal = refuseOrderedDate({
    subject: "The meeting",
    date: meetingDate,
    now: new Date(),
  });
  if (meetingRefusal) return { error: meetingRefusal };

  const pipeline = await db.pipeline.create({
    data: {
      societyId,
      serviceLine: input.serviceLine as never,
      stage: "lead",
      contactName,
      contactPhone: input.contactPhone?.trim() || null,
      meetingDate,
      notes: input.notes?.trim() || null,
      salesOwnerId: input.salesOwnerId,
      loggedById: session.user.id,
      authoritative,
      ...(loggedAt ? { createdAt: loggedAt } : {}),
    },
  });

  logger.info("pipeline.lead_logged", {
    pipelineId: pipeline.id,
    societyId,
    serviceLine: input.serviceLine,
    loggedById: session.user.id,
    salesOwnerId: input.salesOwnerId,
    authoritative,
  });

  // FEAT-001-AC-2 — PER-07 is notified when logged on their behalf. Real
  // notification delivery is NFR-10/R1 (not built yet, per 12-test-plan.md's
  // own deferral) — this is the honest stand-in: a structured, greppable
  // log line, same convention as every other access-control decision.
  if (!authoritative) {
    logger.info("pipeline.pending_approval_notify", {
      pipelineId: pipeline.id,
      salesOwnerId: input.salesOwnerId,
      loggedById: session.user.id,
    });
  }

  revalidatePath("/admin/pipeline");
  redirect(`/admin/pipeline/${pipeline.id}`);
}

// FEAT-001-AC-2: the pending-approval half of the "logged on their behalf"
// flow — the pipeline was created with authoritative: false and PER-07 was
// notified (logged), but nothing previously let PER-07 actually act on that
// notification. Gated to the sales owner themselves, not manage_pipeline in
// general — this is their approval to give, not a broader permission check
// (every possible salesOwnerId already holds manage_pipeline by construction,
// since new-lead-form.tsx's own owner picker only lists such accounts).
export async function approveLead(pipelineId: string) {
  // The row, not the token — the standing rule in this codebase.
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };

  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) return { error: "Lead not found." };
  if (pipeline.authoritative) return { error: "This lead is already authoritative." };

  // Was: the sales owner ALONE. That locked the person who logged the lead
  // out of the record they had just created, and locked out ops entirely
  // (user-reported 2026-08-24). The assignee, the creator and operations may
  // all act; only the first of those is acting for themselves.
  const right = mayAct({
    actorId: actor.id,
    actorTeam: actor.team,
    ownerId: pipeline.salesOwnerId,
    creatorId: pipeline.loggedById,
  });
  if (!right.allowed) {
    logger.warn("pipeline.lead_approval_refused", { pipelineId, actorId: actor.id, reason: right.reason });
    return { error: right.reason };
  }

  await db.pipeline.update({ where: { id: pipelineId }, data: { authoritative: true } });
  logger.info("pipeline.lead_approved", {
    pipelineId,
    actorId: actor.id,
    onBehalf: right.onBehalf,
    ownerId: pipeline.salesOwnerId,
  });

  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath("/admin/pipeline");
  return {};
}

/**
 * Correct a lead's own details — who it belongs to, when the meeting was, who
 * to call.
 *
 * There was no way to change any of this after logging it (user-asked
 * 2026-08-24, pointing at a lead assigned to an inspector with the wrong
 * meeting date). Reassigning matters most: the whole team model exists so
 * that work sits with the person who does it, and a lead that landed on the
 * wrong account had no route to the right one short of logging a second lead
 * against a society that already has one — which CON-24 refuses outright.
 *
 * OPERATIONS ONLY — "make sure all these edit options are for admin only"
 * (the user, 2026-08-25). This is deliberately stricter than `mayAct`, which
 * governs acting ON a deal (the assignee, the creator and operations). This
 * is correcting what the record SAYS — the date it happened, whose it is —
 * and the whole point of the owner and creator fields is that the people they
 * name cannot quietly rewrite them.
 *
 * The row decides, not the token, as everywhere else in this file; and a lead
 * can only be handed to a team that owns leads.
 */
export async function updateLeadDetails(
  pipelineId: string,
  input: {
    contactName: string;
    contactPhone?: string;
    meetingDate: string;
    salesOwnerId: string;
    notes?: string;
    /** The day the lead was logged, when that itself needs correcting. */
    loggedOn?: string;
  },
): Promise<{ error?: string } | undefined> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team) || !actor.permissions.includes("manage_pipeline")) {
    logger.warn("pipeline.lead_update_refused", {
      pipelineId,
      actorId: actor.id,
      actorTeam: actor.team,
      reason: "not-operations",
    });
    return { error: "Correcting a lead's details is an operations action." };
  }

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: { society: { select: { createdAt: true } } },
  });
  if (!pipeline) return { error: "Lead not found." };

  const contactName = input.contactName.trim();
  if (!contactName) return { error: "Contact name is required." };

  const owner = await db.adminUser.findFirst({
    where: { id: input.salesOwnerId, isActive: true, deletedAt: null },
    select: { id: true, team: true, name: true, email: true, permissions: true },
  });
  if (!owner) return { error: "That account cannot take a lead." };
  if (!canOwn(owner.team, "lead")) {
    logger.warn("pipeline.lead_update_refused", {
      pipelineId,
      actorId: actor.id,
      reason: "owner-team",
      ownerTeam: owner.team,
    });
    return {
      error: `${owner.name ?? owner.email} is on the ${teamMeta(owner.team).label} team — a lead belongs to admin or sales.`,
    };
  }
  // The picker filters on this too, but the picker is not the gate: without
  // manage_pipeline the "owner" could not open the deal they own.
  if (!owner.permissions.includes("manage_pipeline")) {
    return {
      error: `${owner.name ?? owner.email} does not hold Manage pipeline, so they could not open this deal. Grant it on the users screen first.`,
    };
  }

  // Same rule as the create path: a meeting can predate the record it caused.
  const meetingDate = new Date(input.meetingDate);
  const refusal = refuseOrderedDate({ subject: "The meeting", date: meetingDate, now: new Date() });
  if (refusal) return { error: refusal };
  // A meeting cannot be moved to after the decision that came out of it —
  // the proposal form already refuses the mirror image of this.
  if (pipeline.proposalDecidedAt && meetingDate.getTime() > pipeline.proposalDecidedAt.getTime()) {
    return {
      error: `The meeting cannot be dated after the proposal decision (${formatDate(pipeline.proposalDecidedAt)}).`,
    };
  }

  // The logged date is NOT ordered against the society record either, and for
  // a sharper reason than the meeting: on the lead path the society row is
  // created BY the lead, so ordering one against the other is circular — it
  // refuses every correction that moves the date back, which is the only
  // direction anyone corrects it. What does bind is that a lead cannot be
  // logged in the future, nor after the decision that came out of its meeting.
  let loggedAt: Date | undefined;
  if (input.loggedOn) {
    const candidate = new Date(`${input.loggedOn}T00:00:00.000Z`);
    const loggedRefusal = refuseOrderedDate({
      subject: "The lead",
      date: candidate,
      now: new Date(),
    });
    if (loggedRefusal) return { error: loggedRefusal };
    if (pipeline.proposalDecidedAt && candidate.getTime() > pipeline.proposalDecidedAt.getTime()) {
      return {
        error: `The lead cannot be logged after the proposal decision (${formatDate(pipeline.proposalDecidedAt)}).`,
      };
    }
    loggedAt = candidate;
  }

  // Handing the lead to someone else puts it back in their hands to confirm —
  // but ONLY while it is still a lead. Flipping it on a deal that has already
  // advanced would freeze a live deal behind an approval nobody is waiting on
  // (FEAT-001-AC-2 is about the meeting that has not happened yet).
  const reassigned = owner.id !== pipeline.salesOwnerId;
  const authoritative =
    pipeline.stage !== "lead"
      ? pipeline.authoritative
      : reassigned
        ? owner.id === actor.id
        : pipeline.authoritative;

  await db.pipeline.update({
    where: { id: pipelineId },
    data: {
      contactName,
      contactPhone: input.contactPhone?.trim() || null,
      meetingDate,
      notes: input.notes?.trim() || null,
      salesOwnerId: owner.id,
      authoritative,
      ...(loggedAt ? { createdAt: loggedAt } : {}),
    },
  });

  logger.info("pipeline.lead_updated", {
    pipelineId,
    actorId: actor.id,
    reassignedFrom: reassigned ? pipeline.salesOwnerId : undefined,
    reassignedTo: reassigned ? owner.id : undefined,
    meetingDate: input.meetingDate,
    loggedOn: input.loggedOn,
    authoritative,
  });
  if (reassigned && !authoritative) {
    // Same honest stand-in for NFR-10 as the create path.
    logger.info("pipeline.pending_approval_notify", {
      pipelineId,
      salesOwnerId: owner.id,
      loggedById: actor.id,
    });
  }

  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath("/admin/pipeline");
  return {};
}

// FEAT-002: create/edit a demo proposal against a lead-stage Pipeline.
// "agreed" advances to survey_pending and opens CAP-16 by creating the
// SiteSurvey row FEAT-006/007 attach to; "declined" closes the pipeline as
// lost with a required reason and no further CAP-16+ action is possible
// against it (FEAT-002-AC-3) short of logging a brand-new lead.
export async function submitProposal(
  pipelineId: string,
  input: {
    summary?: string;
    outcome: "agreed" | "declined" | "undecided";
    closedLostReason?: string;
    /** DEMO_MODE only — the day the demo meeting was actually decided. */
    decidedOn?: string;
  },
) {
  const session = await requireAdminPermission("manage_pipeline");

  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId }, include: { salesOwner: true } });
  if (!pipeline) return { error: "Lead not found." };
  if (pipeline.stage !== "lead") return { error: "This lead is no longer at the lead stage." };

  // FEAT-001-AC-2 — a lead logged on someone's behalf sits in a
  // pending-approval sub-state until its sales owner approves it. That has
  // to actually gate progress, not just render a banner: without this
  // check, an on-behalf lead advanced through the proposal to
  // survey_pending with the approval still pending, making the sub-state
  // purely cosmetic (observed for real on stage before this fix).
  if (!pipeline.authoritative) {
    return {
      error: `This lead is pending approval by ${
        pipeline.salesOwner.name ?? pipeline.salesOwner.email
      } — it can't advance until they approve it.`,
    };
  }

  const summary = input.summary?.trim() || null;

  // The decision follows the meeting, and the survey opens on the same day
  // it is agreed — so one date orders both.
  const decidedAt = await resolveBackdate(input.decidedOn, "The proposal decision", [
    { label: "the first meeting", date: pipeline.meetingDate },
    { label: "the lead", date: pipeline.createdAt },
  ]);
  if (typeof decidedAt === "string") return { error: decidedAt };
  const decided = decidedAt ?? new Date();

  if (input.outcome === "declined") {
    const reason = input.closedLostReason?.trim();
    if (!reason) return { error: "A reason is required when the demo is declined." };
    await db.pipeline.update({
      where: { id: pipelineId },
      data: {
        proposalSummary: summary,
        proposalOutcome: "declined",
        proposalDecidedAt: decided,
        stage: "closed_lost",
        closedLostReason: reason,
      },
    });
    logger.info("pipeline.closed_lost", { pipelineId, actorId: session.user.id, reason });
  } else if (input.outcome === "agreed") {
    await db.$transaction([
      db.pipeline.update({
        where: { id: pipelineId },
        data: {
          proposalSummary: summary,
          proposalOutcome: "agreed",
          proposalDecidedAt: decided,
          stage: "survey_pending",
        },
      }),
      db.siteSurvey.create({ data: { pipelineId, createdAt: decided } }),
    ]);
    logger.info("pipeline.advanced_to_survey_pending", { pipelineId, actorId: session.user.id });
  } else {
    // "Undecided" is the absence of a decision — recording a decidedAt
    // timestamp for it would claim one happened.
    await db.pipeline.update({
      where: { id: pipelineId },
      data: { proposalSummary: summary, proposalOutcome: "undecided", proposalDecidedAt: null },
    });
  }

  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath("/admin/pipeline");
  return {};
}


/**
 * Hand the field work to a named person.
 *
 * The survey and the demo commissioning are the field team's, so only an
 * engineering or inspection account may be handed them — the same rule that
 * keeps a lead with sales. Assigning is an ops or sales act: whoever owns the
 * deal decides who goes out to it.
 */
export async function assignSurveyOwner(input: { pipelineId: string; toId: string | null }) {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };

  const pipeline = await db.pipeline.findUnique({ where: { id: input.pipelineId } });
  if (!pipeline) return { error: "Lead not found." };

  const right = mayAct({
    actorId: actor.id,
    actorTeam: actor.team,
    ownerId: pipeline.salesOwnerId,
    creatorId: pipeline.loggedById,
  });
  if (!right.allowed) return { error: "Only this deal's owner, whoever logged it, or operations can assign the survey." };

  if (input.toId) {
    const to = await db.adminUser.findFirst({
      where: { id: input.toId, isActive: true, deletedAt: null },
      select: { id: true, team: true, name: true, email: true },
    });
    if (!to) return { error: "That account cannot take the survey." };
    if (!canOwn(to.team, "survey")) {
      return {
        error: `${to.name ?? to.email} is on the ${teamMeta(to.team).label} team — the survey goes to engineering or inspection.`,
      };
    }
  }

  await db.pipeline.update({
    where: { id: input.pipelineId },
    data: { surveyOwnerId: input.toId },
  });
  logger.info("pipeline.survey_assigned", {
    pipelineId: input.pipelineId,
    toId: input.toId,
    byId: actor.id,
  });
  revalidatePath(`/admin/pipeline/${input.pipelineId}`);
  return {};
}
