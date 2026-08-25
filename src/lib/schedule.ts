import type { ScheduleKind } from "@prisma/client";

/**
 * The schedule — one module for every appointment in the product.
 *
 * "Whenever a task is assigned to someone that needs to be on a specific
 * schedule, or is a meeting, schedule it as a meeting in the backend so
 * everyone can see their coming schedules as a calendar" (the user,
 * 2026-08-25), and "that common module be used everywhere."
 *
 * The rule that follows from it: an owning record NEVER stores its own time.
 * A demo meeting, a survey visit and (later) an installation day are all
 * ScheduledEvent rows pointing back at what they are about. Everything that
 * is genuinely common — rescheduling, cancelling, who is expected, what the
 * calendar shows — is written once here rather than per feature.
 *
 * This file holds only PURE logic (labels, grouping, the day maths) so it can
 * be unit-tested without a request context; the writes live in
 * src/app/admin/schedule/actions.ts and in each feature's own action.
 */

export const SCHEDULE_KIND: Record<ScheduleKind, { label: string; verb: string }> = {
  demo_meeting: { label: "Demo meeting", verb: "Meeting with the committee" },
  survey_visit: { label: "Survey visit", verb: "Site survey" },
  installation_day: { label: "Installation", verb: "Installation day" },
  other: { label: "Appointment", verb: "Appointment" },
};

export type CalendarEvent = {
  id: string;
  kind: ScheduleKind;
  title: string;
  startAt: Date;
  endAt: Date | null;
  assigneeName: string;
  societyName: string;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
  href: string | null;
};

export type CalendarDay = {
  /** YYYY-MM-DD, in the same UTC reading the whole app stores dates in. */
  key: string;
  date: Date;
  events: CalendarEvent[];
};

/** The UTC day an instant falls on. Dates here are stored as entered. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfDay(d: Date): Date {
  return new Date(`${dayKey(d)}T00:00:00.000Z`);
}

/**
 * Group events into days, earliest first, with empty days left out.
 *
 * A calendar that lists every empty day between two visits is mostly padding;
 * this is a list of the days that have something in them.
 */
export function groupByDay(events: CalendarEvent[]): CalendarDay[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    const k = dayKey(e.startAt);
    const list = map.get(k);
    if (list) list.push(e);
    else map.set(k, [e]);
  }
  return [...map.entries()].map(([key, evts]) => ({
    key,
    date: new Date(`${key}T00:00:00.000Z`),
    events: evts,
  }));
}

/**
 * How a day reads relative to now: today, tomorrow, a past day that was never
 * closed out, or a plain future date.
 *
 * "Overdue" is deliberately a property of the DAY rather than the hour — a
 * visit booked for 10:30 is not overdue at 10:31, it is in progress. It reads
 * as overdue once its day has passed.
 */
export type DayRelation = "overdue" | "today" | "tomorrow" | "upcoming";

export function dayRelation(day: Date, now: Date): DayRelation {
  const d = startOfDay(day).getTime();
  const t = startOfDay(now).getTime();
  if (d < t) return "overdue";
  if (d === t) return "today";
  if (d === t + 86_400_000) return "tomorrow";
  return "upcoming";
}

export const DAY_RELATION_LABEL: Record<DayRelation, string> = {
  overdue: "Past — not closed out",
  today: "Today",
  tomorrow: "Tomorrow",
  upcoming: "",
};

/**
 * The time an entry shows.
 *
 * Some appointments are genuinely date-only — a lead records the day the
 * committee was met, not the hour — and those are stored at midnight. Showing
 * "00:00" would claim a precision nobody entered, so they read as All day.
 */
export function timeLabel(startAt: Date, endAt: Date | null): string {
  const t = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  if (!endAt && startAt.getUTCHours() === 0 && startAt.getUTCMinutes() === 0) return "All day";
  return endAt ? `${t(startAt)}–${t(endAt)}` : t(startAt);
}

/**
 * A stable, human title for an event of each kind. Titles are stored rather
 * than derived at read time so a renamed society does not silently rewrite
 * what a past appointment was called — but every caller should build it here
 * so they read alike.
 */
export function eventTitle(kind: ScheduleKind, societyName: string): string {
  return `${SCHEDULE_KIND[kind].verb} · ${societyName}`;
}
