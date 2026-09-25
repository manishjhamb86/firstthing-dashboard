"use server";

// Tasks (2026-09-25) — thin shells around src/lib/tasks.ts. A task is a
// ScheduledEvent of kind "task"; the deal's own assignments (survey visit,
// replacement day, demo meeting) are the same rows with their own kinds, so
// they appear in the same list. Those are opened and closed by their deal
// step; a person can still mark one done here, but not edit or cancel it.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { dueInstant, mayActOnTask, refuseTask } from "@/lib/tasks";
import { syncCalendarEventQuietly } from "@/lib/calendar-sync";

type Result = { error?: string };

type TaskInput = {
  title: string;
  description: string;
  assigneeId: string;
  due: string;
  time: string;
  priority: "low" | "normal" | "high";
  societyId: string;
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
    },
  });
  logger.info("task.created", { actorId: actor.id, taskId: t.id, assigneeId: input.assigneeId, due: input.due });
  // Onto the assignee's Google calendar straight away; the sweep retries a failure.
  await syncCalendarEventQuietly(t.id);
  refresh();
  return {};
}

async function loadForAct(id: string) {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." } as const;
  const task = await db.scheduledEvent.findUnique({ where: { id } });
  if (!task) return { error: "That task no longer exists." } as const;
  if (!mayActOnTask(actor.id, task, isOperations(actor.team))) {
    logger.warn("task.act_refused", { actorId: actor.id, taskId: id });
    return { error: "Only the person it is assigned to, whoever set it, or operations can change it." } as const;
  }
  return { actor, task } as const;
}

export async function completeTask(id: string, note: string): Promise<Result> {
  const r = await loadForAct(id);
  if ("error" in r) return { error: r.error };
  if (r.task.status !== "scheduled") return { error: "It is already closed." };
  await db.scheduledEvent.update({
    where: { id },
    data: { status: "done", completedAt: new Date(), completedById: r.actor.id, completionNote: note.trim() || null },
  });
  logger.info("task.completed", { actorId: r.actor.id, taskId: id, kind: r.task.kind });
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
    },
  });
  logger.info("task.updated", { actorId: r.actor.id, taskId: id, assigneeId: input.assigneeId });
  await syncCalendarEventQuietly(id);
  refresh();
  return {};
}
