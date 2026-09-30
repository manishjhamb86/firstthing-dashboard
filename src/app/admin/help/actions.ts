"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { sendPush } from "@/lib/push";
import { HELP_CATEGORIES, HELP_CATEGORY_LABEL, MAX_DESCRIPTION, routeHelp, type HelpCategory } from "@/lib/help-report";

/**
 * The back office's side of field Help reports (docs/engineering/21-field-help.md).
 * Anyone may read the desk; acting on a report is for operations, the bug
 * receivers, and whoever it was sent to. Typed errors, a log line per outcome.
 */

type Result = { ok: true } | { error: string };

async function actorFor(reportId: string, act: string) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." } as const;
  const report = await db.helpReport.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, reporterId: true, routedToIds: true, title: true, category: true, taskEventId: true, task: { select: { createdById: true } } },
  });
  if (!report) return { error: "That help request no longer exists." } as const;
  const may = admin.team === "operations" || admin.receivesBugReports || report.routedToIds.includes(admin.id);
  if (!may) {
    logger.warn("help.act_refused", { actorId: admin.id, reportId, act });
    return { error: "Only operations, the bug receivers, or someone it was sent to can act on this request." } as const;
  }
  return { admin, report } as const;
}

function revalidate(reportId: string) {
  revalidatePath("/admin/help");
  revalidatePath(`/admin/help/${reportId}`);
}

export async function replyToHelp(reportId: string, body: string): Promise<Result> {
  const got = await actorFor(reportId, "reply");
  if ("error" in got) return { error: got.error! };
  const { admin, report } = got;
  const text = body.trim().slice(0, MAX_DESCRIPTION);
  if (!text) return { error: "Write a reply first." };
  await db.$transaction([
    db.helpMessage.create({ data: { reportId, author: "staff", adminId: admin.id, body: text } }),
    // Replying is taking it up.
    ...(report.status === "new" || report.status === "open" || report.status === "answered"
      ? [db.helpReport.update({ where: { id: reportId }, data: { status: "in_progress" } })]
      : []),
  ]);
  logger.info("help.staff_replied", { actorId: admin.id, reportId });
  await sendPush([report.reporterId], { title: "Reply on your help request", body: report.title ?? "Help request", url: `/field/more/help/${reportId}`, tag: `help-reply:${reportId}` });
  revalidate(reportId);
  return { ok: true };
}

export async function setHelpStatus(reportId: string, status: "open" | "in_progress" | "resolved", note?: string): Promise<Result> {
  const got = await actorFor(reportId, `status:${status}`);
  if ("error" in got) return { error: got.error! };
  const { admin, report } = got;
  if (!["open", "in_progress", "resolved"].includes(status)) return { error: "That is not a status." };
  const trimmed = (note ?? "").trim();
  // A resolved request with no stated outcome is indistinguishable from one
  // closed to tidy a list — and the reporter reads this note.
  if (status === "resolved" && !trimmed) return { error: "Say how it was resolved — the person who reported it reads this." };
  await db.helpReport.update({
    where: { id: reportId },
    data:
      status === "resolved"
        ? { status, resolvedAt: new Date(), resolvedById: admin.id, resolutionNote: trimmed.slice(0, MAX_DESCRIPTION) }
        : { status, resolvedAt: null, resolvedById: null, resolutionNote: null },
  });
  logger.info("help.status_set", { actorId: admin.id, reportId, from: report.status, to: status });
  if (status === "resolved") {
    await sendPush([report.reporterId], { title: "Your help request is resolved", body: report.title ?? "Help request", url: `/field/more/help/${reportId}`, tag: `help-reply:${reportId}` });
  }
  revalidate(reportId);
  return { ok: true };
}

/** Correct what the report is. It is re-routed by the same rule, and anyone newly responsible is told. */
export async function setHelpCategory(reportId: string, category: string): Promise<Result> {
  const got = await actorFor(reportId, "category");
  if ("error" in got) return { error: got.error! };
  const { admin, report } = got;
  if (!(HELP_CATEGORIES as string[]).includes(category)) return { error: "That is not a category." };
  const [ops, bug] = await Promise.all([
    db.adminUser.findMany({ where: { team: "operations", isActive: true }, select: { id: true } }),
    db.adminUser.findMany({ where: { receivesBugReports: true, isActive: true }, select: { id: true } }),
  ]);
  const route = routeHelp({
    category: category as HelpCategory,
    // A person moving it to "question" is saying a person should answer it.
    answered: false,
    reporterId: report.reporterId,
    taskAssignerId: report.task?.createdById ?? null,
    bugReceiverIds: bug.map((a) => a.id),
    operationsIds: ops.map((a) => a.id),
  });
  const fresh = route.notify.filter((id) => !report.routedToIds.includes(id) && id !== admin.id);
  await db.helpReport.update({
    where: { id: reportId },
    data: {
      category: category as HelpCategory,
      categorySource: "staff",
      routedToIds: [...new Set([...report.routedToIds, ...route.notify])],
      ...(report.status === "answered" || report.status === "new" ? { status: "open" } : {}),
    },
  });
  logger.info("help.category_set", { actorId: admin.id, reportId, from: report.category, to: category, notified: fresh.length });
  if (fresh.length) {
    await sendPush(fresh, { title: `Help: ${HELP_CATEGORY_LABEL[category as HelpCategory]} — ${report.title ?? "field report"}`, body: "Sent to you from the help desk", url: `/admin/help/${reportId}`, tag: `help:${reportId}` });
  }
  revalidate(reportId);
  return { ok: true };
}
