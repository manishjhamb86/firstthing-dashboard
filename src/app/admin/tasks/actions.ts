"use server";

// Tasks (2026-09-25) — thin shells around src/lib/tasks.ts. A task is a
// ScheduledEvent of kind "task"; the deal's own assignments (survey visit,
// replacement day, demo meeting) are the same rows with their own kinds, so
// they appear in the same list. Those are opened and closed by their deal
// step; a person can still mark one done here, but not edit or cancel it.

import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { notifyTaskAssigned } from "@/lib/push-notify";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { dueInstant, mayActOnTask, refuseTask, refuseTaskCompletion } from "@/lib/tasks";
import { syncCalendarEventQuietly } from "@/lib/calendar-sync";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildDocumentKey } from "@/lib/document-keys";

type Result = { error?: string };

type TaskInput = {
  title: string;
  description: string;
  assigneeId: string;
  due: string;
  time: string;
  priority: "low" | "normal" | "high";
  societyId: string;
  /** Needs a photo or document uploaded as proof before it can be marked
   *  done (2026-10-05, user-asked) — a gate pass, or any other evidence. */
  requiresProof: boolean;
  /** Set only at creation, from the retail customer's own page — a task's
   *  customer link is not reassigned by the general edit form, which knows
   *  nothing about it. */
  retailCustomerId?: string;
};

function refresh() {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin");
}

export async function createTask(input: TaskInput): Promise<Result> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  const refusal = refuseTask(input);
  if (refusal) return { error: refusal };
  const assignee = await db.adminUser.findUnique({ where: { id: input.assigneeId }, select: { isActive: true, deletedAt: true } });
  if (!assignee || !assignee.isActive || assignee.deletedAt) return { error: "That person can no longer be assigned work." };
  const { startAt, allDay } = dueInstant(input.due, input.time);
  const t = await db.scheduledEvent.create({
    data: {
      kind: "task",
      title: input.title.trim(),
      description: input.description.trim() || null,
      priority: input.priority,
      startAt,
      allDay,
      assigneeId: input.assigneeId,
      createdById: actor.id,
      societyId: input.societyId || null,
      retailCustomerId: input.retailCustomerId || null,
      requiresProof: input.requiresProof,
    },
  });
  logger.info("task.created", { actorId: actor.id, taskId: t.id, assigneeId: input.assigneeId, due: input.due });
  await notifyTaskAssigned({ taskId: t.id, toId: input.assigneeId, byId: actor.id });
  // Onto the assignee's Google calendar straight away; the sweep retries a failure.
  await syncCalendarEventQuietly(t.id);
  refresh();
  return {};
}

async function loadForAct(id: string): Promise<
  | { error: string }
  | { actor: NonNullable<Awaited<ReturnType<typeof resolveAdmin>>>; task: NonNullable<Awaited<ReturnType<typeof db.scheduledEvent.findUnique>>> }
> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  const task = await db.scheduledEvent.findUnique({ where: { id } });
  if (!task) return { error: "That task no longer exists." };
  if (!mayActOnTask(actor.id, task, isOperations(actor.team))) {
    logger.warn("task.act_refused", { actorId: actor.id, taskId: id });
    return { error: "Only the person it is assigned to, whoever set it, or operations can change it." };
  }
  return { actor, task };
}

/**
 * A proof-requiring task's photo/document is presigned here and PUT straight
 * to S3 by the client, same shape as the inspection's own evidence upload
 * (src/app/admin/inspections/actions.ts getInspectionEvidenceUploadUrl) —
 * gated to whoever may act on the task, not a fixed admin permission, since
 * it is usually the assignee uploading their own evidence.
 */
export async function getTaskProofUploadUrl(input: {
  taskId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const r = await loadForAct(input.taskId);
  if ("error" in r) return { error: r.error };
  if (r.task.status !== "scheduled") return { error: "It is already closed." };

  const society = r.task.societyId
    ? (await db.society.findUnique({ where: { id: r.task.societyId }, select: { name: true } }))?.name
    : null;
  const extension = (input.fileName.split(".").pop() ?? "pdf").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "pdf";
  const key = buildDocumentKey({
    society: society ?? "Internal",
    month: new Date().toISOString().slice(0, 7),
    docType: "taskProof",
    dateLabel: new Date().toISOString().slice(0, 10),
    identifier: input.taskId,
    extension,
  });
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );
  logger.info("task.proof_presigned", { actorId: r.actor.id, taskId: input.taskId, key });
  return { uploadUrl, key };
}

export async function completeTask(id: string, note: string, proof?: { key: string; fileName: string }): Promise<Result> {
  const r = await loadForAct(id);
  if ("error" in r) return { error: r.error };
  if (r.task.status !== "scheduled") return { error: "It is already closed." };
  const refusal = refuseTaskCompletion(r.task, Boolean(proof));
  if (refusal) return { error: refusal };
  await db.scheduledEvent.update({
    where: { id },
    data: {
      status: "done",
      completedAt: new Date(),
      completedById: r.actor.id,
      completionNote: note.trim() || null,
      ...(proof
        ? { proofKey: proof.key, proofFileName: proof.fileName, proofUploadedAt: new Date(), proofUploadedById: r.actor.id }
        : {}),
    },
  });
  logger.info("task.completed", { actorId: r.actor.id, taskId: id, kind: r.task.kind, proofAttached: Boolean(proof || r.task.proofKey) });
  refresh();
  return {};
}

export async function reopenTask(id: string): Promise<Result> {
  const r = await loadForAct(id);
  if ("error" in r) return { error: r.error };
  if (r.task.status === "scheduled") return { error: "It is already open." };
  await db.scheduledEvent.update({
    where: { id },
    data: { status: "scheduled", completedAt: null, completedById: null, completionNote: null, cancelledAt: null, cancelledReason: null },
  });
  logger.info("task.reopened", { actorId: r.actor.id, taskId: id });
  await syncCalendarEventQuietly(id);
  refresh();
  return {};
}

export async function cancelTask(id: string, reason: string): Promise<Result> {
  const r = await loadForAct(id);
  if ("error" in r) return { error: r.error };
  if (r.task.kind !== "task") return { error: "This belongs to a deal step — it is cancelled from the deal, not here." };
  if (!reason.trim()) return { error: "Say why it is being cancelled." };
  await db.scheduledEvent.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledReason: reason.trim() } });
  logger.info("task.cancelled", { actorId: r.actor.id, taskId: id });
  await syncCalendarEventQuietly(id);
  refresh();
  return {};
}

export async function updateTask(id: string, input: TaskInput): Promise<Result> {
  const r = await loadForAct(id);
  if ("error" in r) return { error: r.error };
  if (r.task.kind !== "task") return { error: "This belongs to a deal step — change it from the deal." };
  const refusal = refuseTask(input);
  if (refusal) return { error: refusal };
  const { startAt, allDay } = dueInstant(input.due, input.time);
  await db.scheduledEvent.update({
    where: { id },
    data: {
      title: input.title.trim(),
      description: input.description.trim() || null,
      priority: input.priority,
      startAt,
      allDay,
      assigneeId: input.assigneeId,
      societyId: input.societyId || null,
      requiresProof: input.requiresProof,
    },
  });
  logger.info("task.updated", { actorId: r.actor.id, taskId: id, assigneeId: input.assigneeId });
  await notifyTaskAssigned({ taskId: id, toId: input.assigneeId, byId: r.actor.id, previousToId: r.task.assigneeId });
  await syncCalendarEventQuietly(id);
  refresh();
  return {};
}
