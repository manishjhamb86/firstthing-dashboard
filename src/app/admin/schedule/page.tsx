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
  timeLabel,
  type CalendarEvent,
} from "@/lib/schedule";
import { RESPONSE_LABEL, type ResponseStatus } from "@/lib/calendar-event";
import { resolveCalendarConfig } from "@/lib/google-calendar";
import { MeetingActions, NewMeetingButton, RetrySyncButton, type MeetingEdit } from "./meeting-controls";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ who?: string; open?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor) redirect("/admin");

  const ops = isOperations(actor.team);
  const sp = await searchParams;
  const everyone = ops && sp.who === "everyone";

  // Every OPEN appointment, however old. A fortnight's lookback silently hid
  // a visit booked for an earlier date — the assignee's own calendar said
  // "nothing booked for you" while the work sat there assigned (user-reported
  // 2026-08-25). An event that is still `scheduled` has not been closed out
  // by definition, which is exactly what a schedule is for; the ones that
  // stop showing are the ones marked done or cancelled.
  const rows = await db.scheduledEvent.findMany({
    where: {
      status: "scheduled",
      // Your own appointments, and meetings you are invited to (2026-09-25).
      ...(everyone ? {} : { OR: [{ assigneeId: actor.id }, { attendees: { some: { adminUserId: actor.id } } }] }),
    },
    orderBy: { startAt: "asc" },
    include: {
      assignee: { select: { name: true, email: true } },
      society: { select: { name: true } },
      attendees: { select: { email: true, adminUserId: true, responseStatus: true, adminUser: { select: { name: true } } } },
    },
  });
  const [calendar, people, societies] = await Promise.all([
    resolveCalendarConfig(),
    db.adminUser.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const peopleDto = people.map((p) => ({ id: p.id, name: p.name ?? p.email, email: p.email }));
  const iso = (d: Date) => d.toISOString();

  const events: CalendarEvent[] = rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    assigneeName: e.assignee.name ?? e.assignee.email,
    societyName: e.society?.name ?? null,
    contactName: e.contactName,
    contactPhone: e.contactPhone,
    note: e.note,
    href: e.kind === "meeting"
      ? null
      : e.kind === "task"
      ? `/admin/tasks?open=${e.id}`
      : e.pipelineId
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
          <div className="flex flex-wrap gap-2">
            {ops && (
              <Link
                href={everyone ? "/admin/schedule" : "/admin/schedule?who=everyone"}
                className="btn-ghost btn-sm"
              >
                {everyone ? "Just mine" : "Everyone's"}
              </Link>
            )}
            <NewMeetingButton people={peopleDto} societies={societies} me={actor.id} today={iso(now).slice(0, 10)} />
          </div>
        }
      />

      {!calendar && (
        <p className="mb-5 rounded-lg px-4 py-3 text-[13px]" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
          Google Calendar is not connected, so nothing here reaches anyone&apos;s calendar and meetings get no Meet link.
          {ops ? (
            <>
              {" "}
              <Link href="/admin/settings/google-calendar" className="font-semibold underline">
                Connect it
              </Link>
            </>
          ) : (
            " Operations can connect it under Settings."
          )}
        </p>
      )}

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
                  {day.events.map((e) => {
                    const row = byId.get(e.id)!;
                    const meeting = row.kind === "meeting";
                    const canManage = meeting && (row.createdById === actor.id || ops);
                    const edit: MeetingEdit = {
                      id: row.id,
                      input: {
                        title: row.title,
                        agenda: row.description ?? "",
                        date: iso(row.startAt).slice(0, 10),
                        time: iso(row.startAt).slice(11, 16),
                        minutes: row.endAt ? Math.round((row.endAt.getTime() - row.startAt.getTime()) / 60_000) : 30,
                        inviteeIds: row.attendees.filter((a) => a.adminUserId).map((a) => a.adminUserId!),
                        otherEmails: row.attendees.filter((a) => !a.adminUserId).map((a) => a.email).join(", "),
                        societyId: row.societyId ?? "",
                        addMeet: row.addMeet,
                      },
                    };
                    const tracked = row.googleEventId !== null || row.startAt.getTime() >= now.getTime() - 86_400_000;
                    return (
                    <li
                      key={e.id}
                      id={`ev-${e.id}`}
                      className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                      style={sp.open === e.id ? { background: "var(--accent-subtle)" } : undefined}
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
                      {meeting && row.description && <p className="whitespace-pre-line text-[13px] mt-1">{row.description}</p>}
                      {meeting && row.attendees.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                          {row.attendees.map((a) => (
                            <span key={a.email}>
                              {a.adminUser?.name ?? a.email}
                              <span style={{ color: a.responseStatus === "declined" ? "var(--bad-fg)" : a.responseStatus === "accepted" ? "var(--ok-fg)" : "var(--text-subtle)" }}>
                                {" "}
                                · {RESPONSE_LABEL[(a.responseStatus ?? "needsAction") as ResponseStatus] ?? a.responseStatus}
                              </span>
                            </span>
                          ))}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {row.meetLink && (
                          <a href={row.meetLink} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                            Join Google Meet
                          </a>
                        )}
                        {calendar && tracked && (
                          row.calendarSyncError ? (
                            <>
                              <StatusChip tone="bad">Not on Google Calendar</StatusChip>
                              <span className="text-[12px]" style={{ color: "var(--bad-fg)" }}>{row.calendarSyncError}</span>
                              <RetrySyncButton id={row.id} />
                            </>
                          ) : row.googleEventId ? (
                            row.googleHtmlLink ? (
                              <a href={row.googleHtmlLink} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold">
                                Open in Google Calendar ↗
                              </a>
                            ) : (
                              <StatusChip tone="ok">On Google Calendar</StatusChip>
                            )
                          ) : (
                            <StatusChip tone="neu">Adding to Google Calendar…</StatusChip>
                          )
                        )}
                        <MeetingActions edit={edit} canManage={canManage} people={peopleDto} societies={societies} me={actor.id} />
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
