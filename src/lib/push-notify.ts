import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { logger } from "@/lib/logger";
import { sendPush } from "@/lib/push";
import { assignmentMessage, meterAlertMessage, shouldNotifyAssignee } from "@/lib/push-messages";

/**
 * The four assignment moments and the meter alert, each turned into one push
 * (19-field-app.md §18). Every function here looks up what the message needs,
 * sends, and swallows its own failures: the assignment or alert that called it
 * has already happened and must not be undone by a phone being off. Nobody is
 * notified of work they assigned to themselves.
 */

async function nameOf(adminId: string): Promise<string | null> {
  const a = await db.adminUser.findUnique({ where: { id: adminId }, select: { name: true, email: true } });
  return a ? (a.name ?? a.email) : null;
}

async function safely(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.warn("push.notify_failed", { what, error: String(err) });
  }
}

export async function notifySurveyAssigned(input: { pipelineId: string; toId: string | null; byId: string }): Promise<void> {
  const toId = input.toId;
  if (!shouldNotifyAssignee(toId, input.byId)) return;
  await safely("survey", async () => {
    const p = await db.pipeline.findUnique({
      where: { id: input.pipelineId },
      select: { society: { select: { name: true } }, scheduledEvents: { where: { kind: "survey_visit", status: "scheduled" }, select: { startAt: true, allDay: true }, take: 1 } },
    });
    if (!p) return;
    const visit = p.scheduledEvents[0];
    await sendPush(
      [toId],
      assignmentMessage({
        kind: "survey",
        what: p.society.name,
        when: visit ? (visit.allDay ? formatDate(visit.startAt) : formatDateTime(visit.startAt)) : null,
        by: await nameOf(input.byId),
        url: `/field/survey/${input.pipelineId}`,
        ref: input.pipelineId,
      }),
    );
  });
}

export async function notifyReplacementAssigned(input: { demoId: string; toId: string | null; byId: string }): Promise<void> {
  const toId = input.toId;
  if (!shouldNotifyAssignee(toId, input.byId)) return;
  await safely("replacement", async () => {
    const d = await db.circuitDemo.findUnique({
      where: { id: input.demoId },
      select: { circuit: { select: { location: true, lightType: true, siteSurvey: { select: { pipeline: { select: { society: { select: { name: true } } } } } } } } },
    });
    const society = d?.circuit.siteSurvey?.pipeline.society.name;
    if (!d || !society) return;
    await sendPush(
      [toId],
      assignmentMessage({
        kind: "replacement",
        what: [society, d.circuit.location || d.circuit.lightType].filter(Boolean).join(" — "),
        by: await nameOf(input.byId),
        url: `/field/demo/${input.demoId}`,
        ref: input.demoId,
      }),
    );
  });
}

/** Installation days newly given to someone — not everyone on every replan. */
export async function notifyInstallationDays(input: { pipelineId: string; before: Set<string>; after: Map<string, Date>; byId: string }): Promise<void> {
  await safely("installation", async () => {
    const fresh = [...input.after.entries()].filter(([id]) => !input.before.has(id) && shouldNotifyAssignee(id, input.byId));
    if (fresh.length === 0) return;
    const p = await db.pipeline.findUnique({ where: { id: input.pipelineId }, select: { society: { select: { name: true } } } });
    if (!p) return;
    const by = await nameOf(input.byId);
    for (const [adminId, firstDay] of fresh) {
      await sendPush(
        [adminId],
        assignmentMessage({ kind: "installation", what: p.society.name, when: formatDate(firstDay), by, url: `/field/installation/${input.pipelineId}`, ref: input.pipelineId }),
      );
    }
  });
}

export async function notifyTaskAssigned(input: { taskId: string; toId: string; byId: string; previousToId?: string | null }): Promise<void> {
  if (input.previousToId === input.toId) return;
  if (!shouldNotifyAssignee(input.toId, input.byId)) return;
  await safely("task", async () => {
    const t = await db.scheduledEvent.findUnique({ where: { id: input.taskId }, select: { title: true, startAt: true, allDay: true } });
    if (!t) return;
    await sendPush(
      [input.toId],
      assignmentMessage({
        kind: "task",
        what: t.title,
        when: t.allDay ? formatDate(t.startAt) : formatDateTime(t.startAt),
        by: await nameOf(input.byId),
        url: "/admin/tasks",
        ref: input.taskId,
      }),
    );
  });
}

export async function notifyMeterAlert(input: { meterId: string; kind: string }): Promise<void> {
  await safely("meter", async () => {
    const m = await db.meterDevice.findUnique({
      where: { id: input.meterId },
      select: { name: true, ownerId: true, society: { select: { name: true } } },
    });
    if (!m?.ownerId) return;
    await sendPush([m.ownerId], meterAlertMessage({ kind: input.kind, meterName: m.name, place: m.society?.name ?? null, meterId: input.meterId }));
  });
}
