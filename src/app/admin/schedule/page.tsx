import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { redirect } from "next/navigation";
import { isOperations } from "@/lib/admin-teams";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import {
  DAY_RELATION_LABEL,
  SCHEDULE_KIND,
  dayRelation,
  groupByDay,
  startOfDay,
  timeLabel,
  type CalendarEvent,
} from "@/lib/schedule";

export const metadata = { title: "Schedule" };

/**
 * Everyone's coming appointments, in one place.
 *
 * "Whenever a task is assigned to someone that needs to be on a specific
 * schedule, or is a meeting, schedule it as a meeting in the backend so
 * everyone can see their coming schedules as a calendar" (the user,
 * 2026-08-25). This is the read side of that: one list, fed by every kind of
 * event, grouped by day.
 *
 * Operations sees the whole team's; everyone else sees their own — the same
 * split as Field work, and for the same reason.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor) redirect("/admin");

  const ops = isOperations(actor.team);
  const everyone = ops && (await searchParams).who === "everyone";

  // Past days still matter: an appointment nobody closed out is exactly what
  // a schedule is for. Two weeks back is enough to see what was missed
  // without turning this into an archive.
  const from = new Date(startOfDay(new Date()).getTime() - 14 * 86_400_000);
  const rows = await db.scheduledEvent.findMany({
    where: {
      status: "scheduled",
      startAt: { gte: from },
      ...(everyone ? {} : { assigneeId: actor.id }),
    },
    orderBy: { startAt: "asc" },
    include: {
      assignee: { select: { name: true, email: true } },
      society: { select: { name: true } },
    },
  });

  const events: CalendarEvent[] = rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    assigneeName: e.assignee.name ?? e.assignee.email,
    societyName: e.society.name,
    contactName: e.contactName,
    contactPhone: e.contactPhone,
    note: e.note,
    href: e.pipelineId
      ? e.kind === "survey_visit"
        ? `/admin/pipeline/${e.pipelineId}/survey`
        : `/admin/pipeline/${e.pipelineId}`
      : null,
  }));

  const now = new Date();
  const days = groupByDay(events);
  const overdue = days.filter((d) => dayRelation(d.date, now) === "overdue");
  const today = days.find((d) => dayRelation(d.date, now) === "today");
  const ahead = days.filter((d) => ["tomorrow", "upcoming"].includes(dayRelation(d.date, now)));

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={
          everyone ? "Every appointment across the team." : "Your meetings and site visits."
        }
        chip={
          overdue.length > 0 ? (
            <StatusChip tone="warn">
              {overdue.reduce((n, d) => n + d.events.length, 0)} not closed out
            </StatusChip>
          ) : events.length === 0 ? undefined : (
            <StatusChip tone="ok">Up to date</StatusChip>
          )
        }
        action={
          ops ? (
            <Link
              href={everyone ? "/admin/schedule" : "/admin/schedule?who=everyone"}
              className="btn-ghost btn-sm"
            >
              {everyone ? "Just mine" : "Everyone's"}
            </Link>
          ) : undefined
        }
      />

      <StatRow>
        <Stat
          label="Today"
          value={today?.events.length ?? 0}
          detail={today ? "on the day's list" : "nothing booked"}
        />
        <Stat
          label="Still ahead"
          value={ahead.reduce((n, d) => n + d.events.length, 0)}
          detail={ahead.length === 0 ? "nothing booked" : `across ${ahead.length} days`}
        />
        <Stat
          label="Not closed out"
          value={overdue.reduce((n, d) => n + d.events.length, 0)}
          tone={overdue.length > 0 ? "warn" : "ok"}
          detail={overdue.length === 0 ? "nothing left hanging" : "the day has passed"}
        />
        <Stat
          label="Site visits"
          value={events.filter((e) => e.kind === "survey_visit").length}
          detail="of everything booked"
        />
      </StatRow>

      {days.length === 0 ? (
        <EmptyState title={everyone ? "Nothing on the calendar" : "Nothing booked for you"}>
          A meeting or a site visit appears here as soon as one is arranged — logging a lead books
          the demo meeting, and arranging a survey visit books that.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...overdue, ...(today ? [today] : []), ...ahead].map((day) => {
            const rel = dayRelation(day.date, now);
            return (
              <Card key={day.key} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
                  <h2 className="text-[15px] font-semibold">
                    <span className="num">{formatDate(day.date)}</span>
                  </h2>
                  {DAY_RELATION_LABEL[rel] && (
                    <StatusChip tone={rel === "overdue" ? "warn" : "info"}>
                      {DAY_RELATION_LABEL[rel]}
                    </StatusChip>
                  )}
                </div>
                <ul className="space-y-3">
                  {day.events.map((e) => (
                    <li
                      key={e.id}
                      className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-medium">
                          <span className="num mr-2">{timeLabel(e.startAt, e.endAt)}</span>
                          {e.href ? (
                            <Link href={e.href} className="hover:underline">
                              {e.title}
                            </Link>
                          ) : (
                            e.title
                          )}
                        </span>
                        <StatusChip tone="neu">{SCHEDULE_KIND[e.kind].label}</StatusChip>
                      </div>
                      <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                        {everyone ? `${e.assigneeName} · ` : ""}
                        {e.contactName
                          ? `ask for ${e.contactName}${e.contactPhone ? ` · ${e.contactPhone}` : ""}`
                          : "no site contact recorded"}
                      </p>
                      {e.note && <p className="text-[13px] mt-1">{e.note}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
