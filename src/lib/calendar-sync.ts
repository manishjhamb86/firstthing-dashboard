// Google Calendar sync — the DB side (2026-09-25). Shared by the actions (an
// immediate push, so a meeting has its Meet link as soon as it is created)
// and the worker's calendar_sync sweep (anything changed anywhere else — a
// deal step rescheduled, a push that failed — and the RSVPs coming back).
//
// Every write here holds `updatedAt` at the row's own value: the sync marks
// what it pushed, it must never make the row look changed again.

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MAX_SYNC_ATTEMPTS, attendeeEmails, googleEventBody, googleEventIdFor, organizerFor, readBack, syncDecision } from "@/lib/calendar-event";
import { CalendarError, deleteEvent, pushEvent, readEvent, resolveCalendarConfig, type CalendarConfig } from "@/lib/google-calendar";

function appUrlFor(e: { id: string; kind: string; pipelineId: string | null }): string | null {
  const base = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;
  const path = e.kind === "task" || e.kind === "meeting" || !e.pipelineId ? `/admin/schedule?open=${e.id}` : `/admin/pipeline/${e.pipelineId}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

export type SyncOutcome = "pushed" | "deleted" | "skipped" | "failed" | "not_configured";

export async function syncCalendarEvent(id: string, cfgIn?: CalendarConfig | null): Promise<SyncOutcome> {
  const cfg = cfgIn === undefined ? await resolveCalendarConfig() : cfgIn;
  if (!cfg) return "not_configured";
  const e = await db.scheduledEvent.findUnique({
    where: { id },
    include: {
      assignee: { select: { email: true } },
      createdBy: { select: { email: true } },
      society: { select: { name: true } },
      attendees: { select: { email: true } },
    },
  });
  if (!e) return "skipped";
  const decision = syncDecision(e, new Date());
  if (decision === "skip") return "skipped";

  const organizer = e.googleOrganizer ?? organizerFor(e.createdBy.email, cfg.workspaceDomain, cfg.fallbackOrganizer);
  const hold = { updatedAt: e.updatedAt };
  // Write the outcome back only if nobody else synced this row since we read
  // it. Two pushes can overlap (the action's own and the sweep's); without
  // this, the loser's failure — Google rate-limits rapid edits to one event —
  // overwrote the winner's success, and a meeting that was on Google Calendar
  // read "not on Google Calendar" (seen on stage, 2026-09-25).
  const unchanged = { id, calendarSyncedAt: e.calendarSyncedAt };
  try {
    if (decision === "delete") {
      await deleteEvent(cfg, organizer, e.googleEventId!);
      await db.scheduledEvent.updateMany({ where: unchanged, data: { ...hold, calendarSyncedAt: new Date(), calendarSyncError: null, calendarSyncAttempts: 0 } });
      logger.info("calendar.event_deleted", { eventId: id, organizer });
      return "deleted";
    }
    const attendees = attendeeEmails(organizer, e.assignee.email, e.attendees.map((a) => a.email));
    const body = googleEventBody(
      {
        kind: e.kind,
        title: e.title,
        description: e.description,
        note: e.note,
        startAt: e.startAt,
        endAt: e.endAt,
        allDay: e.allDay,
        societyName: e.society?.name ?? null,
        contactName: e.contactName,
        contactPhone: e.contactPhone,
        appUrl: appUrlFor(e),
      },
      attendees,
    );
    const r = await pushEvent(cfg, organizer, e.googleEventId ?? googleEventIdFor(e.id), body, { wantMeet: e.addMeet, hasMeet: !!e.meetLink });
    await db.scheduledEvent.updateMany({
      where: unchanged,
      data: {
        ...hold,
        googleEventId: r.googleEventId,
        googleOrganizer: organizer,
        googleHtmlLink: r.htmlLink ?? e.googleHtmlLink,
        meetLink: r.meetLink ?? e.meetLink,
        calendarSyncedAt: new Date(),
        calendarSyncError: null,
        calendarSyncAttempts: 0,
      },
    });
    logger.info("calendar.event_pushed", { eventId: id, kind: e.kind, organizer, attendees: attendees.length, meet: !!(r.meetLink ?? e.meetLink) });
    return "pushed";
  } catch (err) {
    const message = err instanceof CalendarError || err instanceof Error ? err.message : String(err);
    const wrote = await db.scheduledEvent.updateMany({
      where: unchanged,
      data: { ...hold, calendarSyncError: message.slice(0, 500), calendarSyncAttempts: { increment: 1 } },
    });
    if (wrote.count === 0) {
      logger.info("calendar.push_superseded", { eventId: id, error: message });
      return "skipped";
    }
    logger.warn("calendar.push_failed", { eventId: id, organizer, error: message });
    return "failed";
  }
}

/**
 * Best effort from an action: the row is already saved, and a Google outage
 * must not turn a saved task into an error on screen — the sweep retries.
 */
export async function syncCalendarEventQuietly(id: string): Promise<void> {
  try {
    await syncCalendarEvent(id);
  } catch (err) {
    logger.warn("calendar.push_failed", { eventId: id, error: String(err) });
  }
}

/** The sweep: push whatever changed since its last push (bounded per pass), then read back RSVPs. */
export async function runCalendarSweep(limit = 50): Promise<{ pushed: number; failed: number; responses: number } | null> {
  const cfg = await resolveCalendarConfig();
  if (!cfg) return null;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Rows never pushed, or touched since their last push. The column
  // comparison is done here, in SQL, so the sweep does not load every event.
  const candidates = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM scheduled_events
    WHERE (calendar_synced_at IS NULL OR updated_at > calendar_synced_at)
      -- A row saved in the last 30 seconds is being pushed by the action
      -- that saved it; the sweep picks it up next pass if that push failed.
      AND updated_at < now() - interval '30 seconds'
      AND (status = 'scheduled' AND (google_event_id IS NOT NULL OR start_at >= ${since})
           OR status = 'cancelled' AND google_event_id IS NOT NULL)
    ORDER BY start_at ASC
    LIMIT ${limit}`;
  let pushed = 0;
  let failed = 0;
  for (const c of candidates) {
    const o = await syncCalendarEvent(c.id, cfg);
    if (o === "pushed" || o === "deleted") pushed += 1;
    if (o === "failed") failed += 1;
  }
  const responses = await refreshResponses(cfg);
  return { pushed, failed, responses };
}

/**
 * Read every clean, upcoming entry back from Google (2026-09-25, two-way
 * sync): changes made there — a new time, a new title, guests added or
 * removed, the event deleted — come into the app, and replies are recorded.
 * "Clean" means pushed and not edited here since; an entry with an app edit
 * still on its way out is left alone, so the app's change wins.
 */
async function refreshResponses(cfg: CalendarConfig): Promise<number> {
  const now = new Date();
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM scheduled_events
    WHERE status = 'scheduled' AND google_event_id IS NOT NULL
      AND calendar_synced_at IS NOT NULL AND updated_at <= calendar_synced_at
      AND start_at >= ${new Date(now.getTime() - 86_400_000)} AND start_at <= ${new Date(now.getTime() + 60 * 86_400_000)}
    ORDER BY start_at ASC
    LIMIT 100`;
  let changed = 0;
  for (const { id } of rows) {
    try {
      if (await readBackOne(cfg, id)) changed += 1;
    } catch (err) {
      logger.warn("calendar.read_back_failed", { eventId: id, error: String(err) });
    }
  }
  return changed;
}

/** One entry's read-back; true when anything in the app changed. */
export async function readBackOne(cfg: CalendarConfig, id: string): Promise<boolean> {
  const e = await db.scheduledEvent.findUnique({
    where: { id },
    include: { assignee: { select: { email: true } }, attendees: { select: { id: true, email: true, responseStatus: true } } },
  });
  if (!e || !e.googleEventId || e.status !== "scheduled") return false;
  const organizer = e.googleOrganizer ?? cfg.fallbackOrganizer;
  const g = await readEvent(cfg, organizer, e.googleEventId);
  if (!g) return false;
  let changed = false;

  // Replies first — they are recorded whatever else happened.
  const answers = new Map(g.attendees.map((a) => [a.email, a.responseStatus]));
  for (const a of e.attendees) {
    const r = answers.get(a.email.toLowerCase());
    if (r && r !== a.responseStatus) {
      await db.scheduledEventAttendee.update({ where: { id: a.id }, data: { responseStatus: r, respondedAt: new Date() } });
      changed = true;
    }
  }

  const rb = readBack(
    {
      kind: e.kind,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      allDay: e.allDay,
      attendeeEmails: e.attendees.map((a) => a.email),
      organizer,
      assigneeEmail: e.assignee.email,
    },
    g,
  );
  if (rb.kind === "none") return changed;
  // The app now matches Google, so the row is clean at the same instant it changed.
  const stamp = new Date();
  if (rb.kind === "deleted") {
    if (e.kind === "task" || e.kind === "meeting") {
      await db.scheduledEvent.update({
        where: { id },
        data: { status: "cancelled", cancelledAt: stamp, cancelledReason: "Deleted in Google Calendar", updatedAt: stamp, calendarSyncedAt: stamp },
      });
      logger.info("calendar.read_back", { eventId: id, kind: e.kind, change: "deleted_in_google" });
    } else {
      // A deal appointment belongs to its deal step: deleting the calendar
      // copy does not undo the booking. It is flagged, not cancelled.
      await db.scheduledEvent.update({
        where: { id },
        data: { updatedAt: e.updatedAt, calendarSyncError: "Removed from Google Calendar — it is still booked here. Try again to put it back.", calendarSyncAttempts: MAX_SYNC_ATTEMPTS },
      });
      logger.info("calendar.read_back", { eventId: id, kind: e.kind, change: "removed_from_google_flagged" });
    }
    return true;
  }
  const people = rb.addEmails.length
    ? await db.adminUser.findMany({ where: { email: { in: rb.addEmails, mode: "insensitive" }, deletedAt: null }, select: { id: true, email: true } })
    : [];
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.id]));
  await db.$transaction([
    db.scheduledEvent.update({
      where: { id },
      data: {
        ...(rb.startAt ? { startAt: rb.startAt } : {}),
        ...(rb.endAt !== undefined ? { endAt: rb.endAt } : {}),
        ...(rb.allDay !== undefined ? { allDay: rb.allDay } : {}),
        ...(rb.title ? { title: rb.title } : {}),
        updatedAt: stamp,
        calendarSyncedAt: stamp,
      },
    }),
    ...(rb.removeEmails.length ? [db.scheduledEventAttendee.deleteMany({ where: { eventId: id, email: { in: rb.removeEmails } } })] : []),
    ...rb.addEmails.map((email) =>
      db.scheduledEventAttendee.create({ data: { eventId: id, email, adminUserId: byEmail.get(email) ?? null, responseStatus: answers.get(email) ?? null } }),
    ),
  ]);
  logger.info("calendar.read_back", { eventId: id, kind: e.kind, change: rb.what.join(","), added: rb.addEmails.length, removed: rb.removeEmails.length });
  return true;
}
