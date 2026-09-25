import Link from "next/link";
import { db } from "@/lib/db";
import { Card, StatusChip, type ChipTone } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { SCHEDULE_KIND } from "@/lib/schedule";
import { TASK_STATE_LABEL, taskState, taskSummary } from "@/lib/tasks";

const TONE: Record<string, ChipTone> = { overdue: "bad", due_today: "warn", upcoming: "info" };

/** The signed-in person's own open work, on their dashboard (2026-09-25). */
export async function YourTasks({ userId }: { userId: string }) {
  const open = await db.scheduledEvent.findMany({
    where: { assigneeId: userId, status: "scheduled" },
    orderBy: { startAt: "asc" },
    select: { id: true, kind: true, title: true, startAt: true, status: true, priority: true },
  });
  const today = new Date();
  const s = taskSummary(open, today);
  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-bold">Your tasks</p>
        <Link href="/admin/tasks" className="text-[13px] font-semibold">
          All tasks →
        </Link>
      </div>
      {s.open === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--text-muted)" }}>Nothing open for you.</p>
      ) : (
        <>
          <p className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
            <span>
              <strong className="num">{s.open}</strong> open
            </span>
            <span style={s.overdue ? { color: "var(--bad-fg)" } : undefined}>
              <strong className="num">{s.overdue}</strong> overdue
            </span>
            <span>
              <strong className="num">{s.dueToday}</strong> due today
            </span>
            <span>
              <strong className="num">{s.dueThisWeek}</strong> this week
            </span>
          </p>
          <ul className="space-y-1.5 text-[13.5px]">
            {open.slice(0, 5).map((t) => {
              const st = taskState(t, today);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={TONE[st] ?? "neu"}>{TASK_STATE_LABEL[st]}</StatusChip>
                  <Link href={`/admin/tasks?open=${t.id}`} className="font-medium">
                    {t.title}
                  </Link>
                  <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    {t.kind !== "task" ? `${SCHEDULE_KIND[t.kind].label} · ` : ""}
                    {formatDate(t.startAt)}
                    {t.priority === "high" ? " · high priority" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
