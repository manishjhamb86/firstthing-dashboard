// Google Calendar sync — the DB side (2026-09-25). Shared by the actions (an
// immediate push, so a meeting has its Meet link as soon as it is created)
// and the worker's calendar_sync sweep (anything changed anywhere else — a
// deal step rescheduled, a push that failed — and the RSVPs coming back).
//
// Every write here holds `updatedAt` at the row's own value: the sync marks
// what it pushed, it must never make the row look changed again.

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { attendeeEmails, googleEventBody, googleEventIdFor, organizerFor, syncDecision } from "@/lib/calendar-event";
import { CalendarError, deleteEvent, pushEvent, readResponses, resolveCalendarConfig, type CalendarConfig } from "@/lib/google-calendar";

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

/** Read back who accepted or declined, for meetings in the coming week. */
async function refreshResponses(cfg: CalendarConfig): Promise<number> {
  const now = new Date();
  const meetings = await db.scheduledEvent.findMany({
    where: { kind: "meeting", status: "scheduled", googleEventId: { not: null }, startAt: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 7 * 86_400_000) } },
    select: { id: true, googleEventId: true, googleOrganizer: true, attendees: { select: { id: true, email: true, responseStatus: true } } },
    take: 50,
  });
  let changed = 0;
  for (const m of meetings) {
    try {
      const answers = new Map((await readResponses(cfg, m.googleOrganizer ?? cfg.fallbackOrganizer, m.googleEventId!)).map((a) => [a.email, a.responseStatus]));
      for (const a of m.attendees) {
        const r = answers.get(a.email.toLowerCase());
        if (r && r !== a.responseStatus) {
          await db.scheduledEventAttendee.update({ where: { id: a.id }, data: { responseStatus: r, respondedAt: new Date() } });
          changed += 1;
        }
      }
    } catch (err) {
      logger.warn("calendar.responses_failed", { eventId: m.id, error: String(err) });
    }
  }
  return changed;
}
