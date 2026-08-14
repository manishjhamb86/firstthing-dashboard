"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

// FEAT-001: log a new lead. Creates the Society (quick, prospect-only —
// full onboarding with duplicate-detection stays /admin/societies/new's job,
// same "minimal quick-create vs. full form" split PROJECT_CONTEXT.md already
// documents for the archived invoice flow) and the Pipeline record together.
export async function createLead(input: {
  societyId?: string;
  newSociety?: { name: string; location: string; flatCount: number };
  serviceLine: string;
  contactName: string;
  contactPhone?: string;
  meetingDate: string;
  notes?: string;
  salesOwnerId: string;
}) {
  const session = await requireAdminPermission("manage_pipeline");

  const contactName = input.contactName.trim();
  if (!contactName) return { error: "Contact name is required." };
  if (!input.meetingDate) return { error: "Meeting date is required." };
  if (!input.serviceLine) return { error: "Service line is required." };
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
    const society = await db.society.create({
      data: { name, location, flatCount: ns.flatCount, status: "prospect" },
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

  const authoritative = input.salesOwnerId === session.user.id;

  const pipeline = await db.pipeline.create({
    data: {
      societyId,
      serviceLine: input.serviceLine as never,
      stage: "lead",
      contactName,
      contactPhone: input.contactPhone?.trim() || null,
      meetingDate: new Date(input.meetingDate),
      notes: input.notes?.trim() || null,
      salesOwnerId: input.salesOwnerId,
      loggedById: session.user.id,
      authoritative,
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

// FEAT-002: create/edit a demo proposal against a lead-stage Pipeline.
// "agreed" advances to survey_pending and opens CAP-16 by creating the
// SiteSurvey row FEAT-006/007 attach to; "declined" closes the pipeline as
// lost with a required reason and no further CAP-16+ action is possible
// against it (FEAT-002-AC-3) short of logging a brand-new lead.
export async function submitProposal(
  pipelineId: string,
  input: { summary?: string; outcome: "agreed" | "declined" | "undecided"; closedLostReason?: string },
) {
  const session = await requireAdminPermission("manage_pipeline");

  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) return { error: "Lead not found." };
  if (pipeline.stage !== "lead") return { error: "This lead is no longer at the lead stage." };

  const summary = input.summary?.trim() || null;

  if (input.outcome === "declined") {
    const reason = input.closedLostReason?.trim();
    if (!reason) return { error: "A reason is required when the demo is declined." };
    await db.pipeline.update({
      where: { id: pipelineId },
      data: {
        proposalSummary: summary,
        proposalOutcome: "declined",
        proposalDecidedAt: new Date(),
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
          proposalDecidedAt: new Date(),
          stage: "survey_pending",
        },
      }),
      db.siteSurvey.create({ data: { pipelineId } }),
    ]);
    logger.info("pipeline.advanced_to_survey_pending", { pipelineId, actorId: session.user.id });
  } else {
    await db.pipeline.update({
      where: { id: pipelineId },
      data: { proposalSummary: summary, proposalOutcome: "undecided", proposalDecidedAt: new Date() },
    });
  }

  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath("/admin/pipeline");
  return {};
}
