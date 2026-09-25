import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { SCHEDULE_KIND, timeLabel } from "@/lib/schedule";
import { TASK_STATE_LABEL, taskState } from "@/lib/tasks";
import { TasksClient, type TaskRow } from "./tasks-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

/**
 * Everyone's work, as line items (2026-09-25): tasks people set for each
 * other, and the deal's own assignments (survey visits, replacement days,
 * demo meetings) — one list, open ones first by default.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor) redirect("/admin");
  const ops = isOperations(actor.team);
  const { open } = await searchParams;

  const scope = ops ? {} : { OR: [{ assigneeId: actor.id }, { createdById: actor.id }] };
  const [openRows, closedRows, people, societies] = await Promise.all([
    db.scheduledEvent.findMany({
      where: { ...scope, status: "scheduled" },
      orderBy: { startAt: "asc" },
      include: { assignee: { select: { name: true, email: true } }, createdBy: { select: { name: true, email: true } }, society: { select: { id: true, name: true } } },
    }),
    db.scheduledEvent.findMany({
      where: { ...scope, status: { in: ["done", "cancelled"] } },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: { assignee: { select: { name: true, email: true } }, createdBy: { select: { name: true, email: true } }, society: { select: { id: true, name: true } } },
    }),
    db.adminUser.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const completers = new Map(
    (await db.adminUser.findMany({ where: { id: { in: closedRows.map((r) => r.completedById).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } })).map((p) => [
      p.id,
      p.name ?? p.email,
    ]),
  );
  const today = new Date();
  const rows: TaskRow[] = [...openRows, ...closedRows].map((e) => {
    const state = taskState({ status: e.status, startAt: e.startAt }, today);
    return {
      id: e.id,
      kind: e.kind,
      kindLabel: SCHEDULE_KIND[e.kind].label,
      title: e.title,
      description: e.description,
      priority: e.priority,
      status: e.status,
      state,
      stateLabel: TASK_STATE_LABEL[state],
      due: dueLabel(e.kind, e.startAt, e.endAt, e.allDay),
      dueIso: e.startAt.toISOString().slice(0, 10),
      timeIso: e.allDay ? "" : e.startAt.toISOString().slice(11, 16),
      dueMs: e.startAt.getTime(),
      assigneeId: e.assigneeId,
      assignee: e.assignee.name ?? e.assignee.email,
      createdById: e.createdById,
      createdBy: e.createdBy.name ?? e.createdBy.email,
      societyId: e.society?.id ?? "",
      society: e.society?.name ?? null,
      href:
        e.kind === "task"
          ? null
          : e.pipelineId
            ? e.kind === "survey_visit"
              ? `/admin/pipeline/${e.pipelineId}/survey`
              : `/admin/pipeline/${e.pipelineId}`
            : e.circuitId && e.societyId
              ? `/admin/societies/${e.societyId}/circuits/${e.circuitId}`
              : null,
      closedNote:
        e.status === "done"
          ? `Done ${e.completedAt ? formatDate(e.completedAt) : ""}${e.completedById ? ` by ${completers.get(e.completedById) ?? "—"}` : ""}${e.completionNote ? ` — ${e.completionNote}` : ""}`
          : e.status === "cancelled"
            ? `Cancelled${e.cancelledReason ? ` — ${e.cancelledReason}` : ""}`
            : null,
      mayAct: ops || e.assigneeId === actor.id || e.createdById === actor.id,
    };
  });

  return (
    <>
      <PageHeader title="Tasks" subtitle="Work set for each other, and the deal's own assignments — one list." />
      <TasksClient
        rows={rows}
        me={actor.id}
        isOps={ops}
        people={people.map((p) => ({ id: p.id, name: p.name ?? p.email }))}
        societies={societies}
        today={today.toISOString().slice(0, 10)}
        highlight={open ?? null}
      />
    </>
  );
}

/** A task's due date reads as a date, with its time only when one was set. */
function dueLabel(kind: string, startAt: Date, endAt: Date | null, allDay: boolean): string {
  const date = formatDate(startAt);
  if (kind === "task") return allDay ? date : `${date} · ${timeLabel(startAt, null)}`;
  const t = timeLabel(startAt, endAt);
  return t === "All day" ? date : `${date} · ${t}`;
}
