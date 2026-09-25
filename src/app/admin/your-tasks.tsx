import Link from "next/link";
import { db } from "@/lib/db";
import { Card, StatusChip, type ChipTone } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { SCHEDULE_KIND, timeLabel } from "@/lib/schedule";
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
  // Meetings in the coming week you host or are invited to (2026-09-25) —
  // joinable from here as well as from Google Calendar.
  const dayStart = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const meetings = await db.scheduledEvent.findMany({
    where: {
      kind: "meeting",
      status: "scheduled",
      startAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 7 * 86_400_000) },
      OR: [{ assigneeId: userId }, { attendees: { some: { adminUserId: userId } } }],
    },
    orderBy: { startAt: "asc" },
    take: 4,
    select: { id: true, title: true, startAt: true, endAt: true, meetLink: true },
  });
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
      {meetings.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="mb-2 text-[13px] font-semibold">Coming meetings</p>
          <ul className="space-y-1.5 text-[13.5px]">
            {meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span className="num text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  {formatDate(m.startAt)} · {timeLabel(m.startAt, m.endAt)}
                </span>
                <Link href={`/admin/schedule?open=${m.id}#ev-${m.id}`} className="font-medium">
                  {m.title}
                </Link>
                {m.meetLink && (
                  <a href={m.meetLink} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold">
                    Join ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
