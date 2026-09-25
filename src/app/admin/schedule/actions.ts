"use server";

// Meetings on the Schedule tab (2026-09-25) — thin shells around
// src/lib/calendar-event.ts. A meeting is a ScheduledEvent of kind "meeting":
// the person who sets it hosts it (assignee = creator), everyone else is an
// attendee row. It is written to Google Calendar straight away so the Meet
// link exists before the dialog closes; if Google is down the meeting is still
// saved here and the sweep pushes it later.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { parseEmailList, refuseMeeting, type MeetingInput } from "@/lib/calendar-event";
import { syncCalendarEvent, syncCalendarEventQuietly } from "@/lib/calendar-sync";
import { resolveCalendarConfig } from "@/lib/google-calendar";

type Result = { error?: string; id?: string; warning?: string };

function refresh() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
}

async function invitees(input: MeetingInput) {
  const people = input.inviteeIds.length
    ? await db.adminUser.findMany({ where: { id: { in: input.inviteeIds }, isActive: true, deletedAt: null }, select: { id: true, email: true } })
    : [];
  const byEmail = new Map<string, { adminUserId: string | null; email: string }>();
  for (const p of people) byEmail.set(p.email.toLowerCase(), { adminUserId: p.id, email: p.email.toLowerCase() });
  // An address typed by hand that belongs to a colleague is linked to them, so it shows on their schedule.
  const typed = parseEmailList(input.otherEmails);
  const known = typed.length
    ? await db.adminUser.findMany({ where: { email: { in: typed, mode: "insensitive" }, isActive: true, deletedAt: null }, select: { id: true, email: true } })
    : [];
  const knownMap = new Map(known.map((k) => [k.email.toLowerCase(), k.id]));
  for (const e of typed) if (!byEmail.has(e)) byEmail.set(e, { adminUserId: knownMap.get(e) ?? null, email: e });
  return [...byEmail.values()];
}

function times(input: MeetingInput) {
  const startAt = new Date(`${input.date}T${input.time}:00Z`);
  return { startAt, endAt: new Date(startAt.getTime() + input.minutes * 60_000) };
}

async function pushNow(id: string): Promise<string | undefined> {
  const o = await syncCalendarEvent(id).catch(() => "failed" as const);
  if (o === "not_configured") return "Saved here. Google Calendar is not connected yet, so no invitation or Meet link was sent.";
  if (o === "failed") {
    const e = await db.scheduledEvent.findUnique({ where: { id }, select: { calendarSyncError: true } });
    return `Saved here, but Google Calendar refused it: ${e?.calendarSyncError ?? "unknown error"}. It will be retried.`;
  }
  return undefined;
}

export async function createMeeting(input: MeetingInput): Promise<Result> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  const refusal = refuseMeeting(input);
  if (refusal) return { error: refusal };
  const list = (await invitees(input)).filter((a) => a.email !== actor.email.toLowerCase());
  if (list.length === 0) return { error: "Invite at least one other person." };
  const { startAt, endAt } = times(input);
  const m = await db.scheduledEvent.create({
    data: {
      kind: "meeting",
      title: input.title.trim(),
      description: input.agenda.trim() || null,
      startAt,
      endAt,
      allDay: false,
      addMeet: input.addMeet,
      assigneeId: actor.id,
      createdById: actor.id,
      societyId: input.societyId || null,
      attendees: { create: list },
    },
  });
  logger.info("meeting.created", { actorId: actor.id, meetingId: m.id, invitees: list.length, meet: input.addMeet });
  const warning = await pushNow(m.id);
  refresh();
  return { id: m.id, warning };
}

async function loadMeeting(id: string) {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." } as const;
  const m = await db.scheduledEvent.findUnique({ where: { id }, include: { attendees: true } });
  if (!m || m.kind !== "meeting") return { error: "That meeting no longer exists." } as const;
  if (m.createdById !== actor.id && !isOperations(actor.team)) {
    logger.warn("meeting.act_refused", { actorId: actor.id, meetingId: id });
    return { error: "Only the person who set up the meeting, or operations, can change it." } as const;
  }
  return { actor, m } as const;
}

export async function updateMeeting(id: string, input: MeetingInput): Promise<Result> {
  const r = await loadMeeting(id);
  if ("error" in r) return { error: r.error };
  if (r.m.status !== "scheduled") return { error: "It is already closed." };
  const refusal = refuseMeeting(input);
  if (refusal) return { error: refusal };
  const host = (await db.adminUser.findUnique({ where: { id: r.m.assigneeId }, select: { email: true } }))?.email.toLowerCase();
  const list = (await invitees(input)).filter((a) => a.email !== host);
  if (list.length === 0) return { error: "Invite at least one other person." };
  const { startAt, endAt } = times(input);
  const keep = new Set(list.map((a) => a.email));
  await db.$transaction([
    db.scheduledEventAttendee.deleteMany({ where: { eventId: id, email: { notIn: [...keep] } } }),
    ...list.map((a) =>
      db.scheduledEventAttendee.upsert({ where: { eventId_email: { eventId: id, email: a.email } }, create: { eventId: id, ...a }, update: { adminUserId: a.adminUserId } }),
    ),
    db.scheduledEvent.update({
      where: { id },
      data: { title: input.title.trim(), description: input.agenda.trim() || null, startAt, endAt, addMeet: input.addMeet || !!r.m.meetLink, societyId: input.societyId || null },
    }),
  ]);
  logger.info("meeting.updated", { actorId: r.actor.id, meetingId: id, invitees: list.length });
  const warning = await pushNow(id);
  refresh();
  return { id, warning };
}

export async function cancelMeeting(id: string, reason: string): Promise<Result> {
  const r = await loadMeeting(id);
  if ("error" in r) return { error: r.error };
  if (r.m.status !== "scheduled") return { error: "It is already closed." };
  if (!reason.trim()) return { error: "Say why it is being cancelled." };
  await db.scheduledEvent.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledReason: reason.trim() } });
  logger.info("meeting.cancelled", { actorId: r.actor.id, meetingId: id });
  await syncCalendarEventQuietly(id);
  refresh();
  return {};
}

/** Try Google again now, after the sweep gave up or a person fixed the settings. */
export async function retryCalendarSync(id: string): Promise<Result> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  const e = await db.scheduledEvent.findUnique({ where: { id }, select: { assigneeId: true, createdById: true, updatedAt: true } });
  if (!e) return { error: "That entry no longer exists." };
  if (![e.assigneeId, e.createdById].includes(actor.id) && !isOperations(actor.team)) return { error: "Only the people on it, or operations, can retry it." };
  if (!(await resolveCalendarConfig())) return { error: "Google Calendar is not connected yet — Settings → Google Calendar." };
  await db.scheduledEvent.update({ where: { id }, data: { updatedAt: e.updatedAt, calendarSyncAttempts: 0, calendarSyncError: null, calendarSyncedAt: null } });
  const warning = await pushNow(id);
  refresh();
  return warning ? { error: warning } : {};
}
