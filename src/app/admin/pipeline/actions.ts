"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { refuseOrderedDate, resolveBackdate } from "@/lib/step-dates";

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
  const loggedAt = await resolveBackdate(input.loggedOn, "The lead", [
    { label: "the society record", date: society?.createdAt ?? null },
  ]);
  if (typeof loggedAt === "string") return { error: loggedAt };

  const meetingDate = new Date(input.meetingDate);
  const meetingRefusal = refuseOrderedDate({
    subject: "The meeting",
    date: meetingDate,
    now: new Date(),
    mustNotPrecede: [{ label: "the society record", date: society?.createdAt ?? null }],
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
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) return { error: "Lead not found." };
  if (pipeline.authoritative) return { error: "This lead is already authoritative." };
  if (pipeline.salesOwnerId !== session.user.id) {
    return { error: "Only the sales owner this lead was logged for can approve it." };
  }

  await db.pipeline.update({ where: { id: pipelineId }, data: { authoritative: true } });
  logger.info("pipeline.lead_approved", { pipelineId, actorId: session.user.id });

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
