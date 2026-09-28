"use server";

/**
 * The society timeline's writes (2026-09-28).
 *
 * Before go-live (demo mode) a date is edited in place: checked against the
 * whole chronology as it would be after the change, then written through the
 * correction action that owns it. After go-live nobody edits a date from the
 * timeline — a change is a DateChangeRequest with a reason, and another admin
 * accepts or rejects it. Refusals return a sentence and log a line; nothing
 * here throws.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isDemoMode } from "@/lib/demo-mode";
import { logger } from "@/lib/logger";
import { loadSocietyTimeline } from "@/lib/society-timeline-loader";
import { currentValue, locate, proposalWarnings, refuseProposal } from "@/lib/society-chronology";
import { isTimelineField, parseValue, TIMELINE_FIELDS, valueLabel, type TimelineField } from "@/lib/timeline-fields";
import { appliedReason, decideApproval, refuseRaise, refuseRejection, refuseWithdrawal, type RequestStatus } from "@/lib/date-change-request";
import { applyTimelineDate } from "./apply-date";

type Outcome = { ok?: true; error?: string; warnings?: string[] };

type DateInput = { societyId: string; field: string; entityId: string; value: string; reason: string };

/** Anyone who works a deal may correct or request; the owning action decides the rest. */
async function editor() {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." } as const;
  const p = admin.permissions;
  if (!p.includes("manage_pipeline") && !p.includes("manage_survey")) {
    logger.warn("timeline.edit_refused", { actorId: admin.id, reason: "no_permission" });
    return { error: "Correcting a recorded date needs pipeline or survey access." } as const;
  }
  return { admin } as const;
}

function paths(societyId: string) {
  revalidatePath(`/admin/societies/${societyId}/timeline`);
  revalidatePath("/admin/timeline/requests");
}

async function snapshot(societyId: string, field: TimelineField, entityId: string, value: string) {
  const loaded = await loadSocietyTimeline(societyId);
  if (!loaded) return { error: "That society is no longer on record." } as const;
  const ref = { field, entityId };
  const current = currentValue(loaded.root, ref);
  if (!current.found) return { error: "That date is not on this society's timeline." } as const;
  if (!parseValue(value, TIMELINE_FIELDS[field].range)) {
    return { error: TIMELINE_FIELDS[field].range ? "Give the period both a start and an end." : "Pick a valid date." } as const;
  }
  return { loaded, ref, current: current.value } as const;
}

// ── Before go-live: edit in place ─────────────────────────────────────────

export async function saveTimelineDate(input: DateInput): Promise<Outcome> {
  const e = await editor();
  if ("error" in e) return { error: e.error };
  if (!isTimelineField(input.field)) return { error: "That date cannot be corrected here." };
  if (!(await isDemoMode())) {
    logger.warn("timeline.edit_refused", { actorId: e.admin.id, field: input.field, entityId: input.entityId, reason: "live" });
    return { error: "After go-live a date changes by request — use “Request a change”." };
  }
  const s = await snapshot(input.societyId, input.field, input.entityId, input.value);
  if ("error" in s) return { error: s.error };
  if (s.current === input.value) return { error: "That is the date already on record." };

  const refusal = refuseProposal(s.loaded.root, s.ref, input.value, new Date());
  if (refusal) {
    logger.warn("timeline.edit_refused", { actorId: e.admin.id, field: input.field, entityId: input.entityId, reason: "out_of_order", refusal });
    return { error: refusal };
  }
  const warnings = proposalWarnings(s.loaded.root, s.ref, input.value, new Date());
  const r = await applyTimelineDate({ field: input.field, entityId: input.entityId, value: input.value, reason: input.reason, actorId: e.admin.id });
  if (r.error) {
    logger.warn("timeline.edit_refused", { actorId: e.admin.id, field: input.field, entityId: input.entityId, reason: "owning_action", refusal: r.error });
    return { error: r.error };
  }
  logger.info("timeline.date_corrected", { actorId: e.admin.id, societyId: input.societyId, field: input.field, entityId: input.entityId, from: s.current, to: input.value });
  paths(input.societyId);
  return { ok: true, warnings };
}

// ── After go-live: request, and another admin decides ────────────────────

export async function requestDateChange(input: DateInput): Promise<Outcome> {
  const e = await editor();
  if ("error" in e) return { error: e.error };
  if (!isTimelineField(input.field)) return { error: "That date cannot be corrected here." };
  if (await isDemoMode()) return { error: "Before go-live the date is edited directly — use “Edit date”." };
  const s = await snapshot(input.societyId, input.field, input.entityId, input.value);
  if ("error" in s) return { error: s.error };

  const open = await db.dateChangeRequest.findFirst({
    where: { field: input.field, entityId: input.entityId, status: "pending" },
    select: { toValue: true, requestedBy: { select: { name: true, email: true } } },
  });
  const refusal =
    refuseRaise({
      reason: input.reason,
      fromValue: s.current,
      toValue: input.value,
      open: open ? { requestedByName: open.requestedBy.name ?? open.requestedBy.email, toLabel: valueLabel(open.toValue) } : null,
      liveApplicable: TIMELINE_FIELDS[input.field].live,
    }) ?? refuseProposal(s.loaded.root, s.ref, input.value, new Date());
  if (refusal) {
    logger.warn("timeline.request_refused", { actorId: e.admin.id, field: input.field, entityId: input.entityId, refusal });
    return { error: refusal };
  }

  const where = locate(s.loaded.root, s.ref);
  const warnings = proposalWarnings(s.loaded.root, s.ref, input.value, new Date());
  const demoId = input.field.startsWith("demo.") ? input.entityId : null;
  const pipelineId = /^(pipeline|agreement|contract|certificate)\./.test(input.field) ? input.entityId : null;
  try {
    const created = await db.dateChangeRequest.create({
      data: {
        societyId: input.societyId,
        pipelineId,
        demoId,
        field: input.field,
        entityId: input.entityId,
        // A line's only deal is named for the line: say it once.
        context: [s.loaded.society.name, ...(where?.path ?? [])].filter((p, i, all) => p !== all[i - 1]).join(" › "),
        fromValue: s.current,
        toValue: input.value,
        reason: input.reason.trim(),
        warnings,
        requestedById: e.admin.id,
      },
    });
    logger.info("timeline.change_requested", { actorId: e.admin.id, requestId: created.id, field: input.field, entityId: input.entityId, from: s.current, to: input.value });
  } catch (err) {
    // The partial unique index: another request on this date landed first.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return { error: "A change to this date was requested a moment ago. Reload to see it." };
    }
    throw err;
  }
  paths(input.societyId);
  return { ok: true, warnings };
}

export async function withdrawDateChange(requestId: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const req = await db.dateChangeRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, requestedById: true, societyId: true } });
  if (!req) return { error: "That request is no longer on record." };
  const refusal = refuseWithdrawal({ status: req.status as RequestStatus, requesterId: req.requestedById, actorId: admin.id });
  if (refusal) {
    logger.warn("timeline.withdraw_refused", { actorId: admin.id, requestId, refusal });
    return { error: refusal };
  }
  await db.dateChangeRequest.updateMany({ where: { id: req.id, status: "pending" }, data: { status: "withdrawn", decidedAt: new Date(), decidedById: admin.id } });
  logger.info("timeline.request_withdrawn", { actorId: admin.id, requestId });
  paths(req.societyId);
  return { ok: true };
}

export async function acceptDateChange(requestId: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const req = await db.dateChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) return { error: "That request is no longer on record." };
  if (!isTimelineField(req.field)) return { error: "That date cannot be corrected here." };

  const loaded = await loadSocietyTimeline(req.societyId);
  if (!loaded) return { error: "That society is no longer on record." };
  const ref = { field: req.field, entityId: req.entityId };
  const now = currentValue(loaded.root, ref);

  const decision = decideApproval({
    status: req.status as RequestStatus,
    requesterId: req.requestedById,
    approverId: admin.id,
    canApprove: admin.permissions.includes("approve_date_changes"),
    fromValue: req.fromValue,
    currentValue: now.found ? now.value : null,
  });
  if (decision.action === "refuse") {
    logger.warn("timeline.accept_refused", { actorId: admin.id, requestId, reason: decision.log });
    return { error: decision.message };
  }
  if (decision.action === "supersede") {
    await db.dateChangeRequest.updateMany({
      where: { id: req.id, status: "pending" },
      data: { status: "superseded", decidedAt: new Date(), decidedById: admin.id, decisionNote: `The date on record is now ${valueLabel(now.value)}, not ${valueLabel(req.fromValue)}.` },
    });
    logger.info("timeline.request_superseded", { actorId: admin.id, requestId, recorded: now.value, sawFrom: req.fromValue });
    paths(req.societyId);
    return { error: decision.message };
  }

  // Checked again on today's chronology: other dates may have moved since.
  const refusal = refuseProposal(loaded.root, ref, req.toValue, new Date());
  if (refusal) {
    logger.warn("timeline.accept_refused", { actorId: admin.id, requestId, reason: "out_of_order", refusal });
    return { error: refusal };
  }
  const applied = await applyTimelineDate({
    field: req.field,
    entityId: req.entityId,
    value: req.toValue,
    reason: appliedReason(req.id, req.reason, admin.name ?? admin.email),
    actorId: admin.id,
  });
  if (applied.error) {
    logger.warn("timeline.accept_refused", { actorId: admin.id, requestId, reason: "owning_action", refusal: applied.error });
    return { error: applied.error };
  }
  const at = new Date();
  await db.dateChangeRequest.updateMany({ where: { id: req.id, status: "pending" }, data: { status: "approved", decidedAt: at, decidedById: admin.id, appliedAt: at } });
  logger.info("timeline.request_accepted", { actorId: admin.id, requestId, field: req.field, entityId: req.entityId, from: req.fromValue, to: req.toValue });
  paths(req.societyId);
  return { ok: true };
}

export async function rejectDateChange(requestId: string, note: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const req = await db.dateChangeRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, requestedById: true, societyId: true } });
  if (!req) return { error: "That request is no longer on record." };
  const refusal = refuseRejection({
    status: req.status as RequestStatus,
    requesterId: req.requestedById,
    approverId: admin.id,
    canApprove: admin.permissions.includes("approve_date_changes"),
    note,
  });
  if (refusal) {
    logger.warn("timeline.reject_refused", { actorId: admin.id, requestId, refusal });
    return { error: refusal };
  }
  await db.dateChangeRequest.updateMany({ where: { id: req.id, status: "pending" }, data: { status: "rejected", decidedAt: new Date(), decidedById: admin.id, decisionNote: note.trim() } });
  logger.info("timeline.request_rejected", { actorId: admin.id, requestId });
  paths(req.societyId);
  return { ok: true };
}
