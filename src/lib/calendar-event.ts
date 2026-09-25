// Google Calendar sync — the pure rules (2026-09-25, user-asked: "whenever a
// task is created with a time schedule it should create a calendar event in
// the assigned user's Gmail calendar… and an option to create meetings and
// invite users using Google Meet").
//
// Design (docs/engineering/18-google-calendar.md):
// - The app is the source of truth; sync is ONE WAY, app → Google.
// - A Workspace service account with domain-wide delegation writes the event
//   to the ORGANIZER's own calendar (the person who set it, when they are on
//   the Workspace domain; otherwise a configured fallback organizer) with the
//   assignee and any invitees as attendees. Google itself emails the invite
//   and puts it on each attendee's calendar (sendUpdates=all).
// - The Google event id is derived from the row id, so a push that runs twice
//   (the action's immediate push racing the sweep) can never create two events.
//
// Nothing here talks to Google; src/lib/google-calendar.ts does.

import type { ScheduleKind } from "@prisma/client";

export const CALENDAR_TIME_ZONE = "Asia/Kolkata";

/** After this many failed pushes in a row the sweep stops retrying until a person does. */
export const MAX_SYNC_ATTEMPTS = 5;

/** A row older than this that was never pushed is history — it is not written into anyone's calendar. */
const HISTORY_CUTOFF_MS = 24 * 60 * 60 * 1000;

export type SyncFacts = {
  status: "scheduled" | "done" | "cancelled";
  startAt: Date;
  updatedAt: Date;
  googleEventId: string | null;
  calendarSyncedAt: Date | null;
  calendarSyncAttempts: number;
  calendarSyncError: string | null;
};

export type SyncDecision = "push" | "delete" | "skip";

/**
 * What the sync should do with one row now.
 * - cancelled → remove it from Google (once), if it was ever there;
 * - done → leave it: the appointment happened, the calendar keeps it;
 * - scheduled → push when it changed since the last push, unless it is
 *   history that was never pushed (no backlog floods anyone's calendar).
 */
export function syncDecision(e: SyncFacts, now: Date): SyncDecision {
  const dirty = e.calendarSyncedAt === null || e.updatedAt.getTime() > e.calendarSyncedAt.getTime();
  if (!dirty) return "skip";
  if (e.calendarSyncError && e.calendarSyncAttempts >= MAX_SYNC_ATTEMPTS) return "skip";
  if (e.status === "cancelled") return e.googleEventId ? "delete" : "skip";
  if (e.status === "done") return "skip";
  if (!e.googleEventId && e.startAt.getTime() < now.getTime() - HISTORY_CUTOFF_MS) return "skip";
  return "push";
}

/**
 * The Google event id for a row. Google accepts ids of 5–1024 characters from
 * base32hex (0-9, a-v); hex encoding of the cuid is inside that alphabet, and
 * being deterministic it makes every insert idempotent.
 */
export function googleEventIdFor(rowId: string): string {
  return `ft${Buffer.from(rowId, "utf8").toString("hex")}`;
}

/** Who organizes: the person who set it, when they are on the Workspace domain; else the fallback. */
export function organizerFor(creatorEmail: string | null, domain: string, fallback: string): string {
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  const e = (creatorEmail ?? "").trim().toLowerCase();
  return d && e.endsWith(`@${d}`) ? e : fallback.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(s: string): boolean {
  return EMAIL.test(s.trim());
}

/** Everyone to invite: the assignee and the invitees, deduplicated, never the organizer, never an invalid address. */
export function attendeeEmails(organizer: string, assigneeEmail: string | null, invitees: string[]): string[] {
  const seen = new Set<string>([organizer.toLowerCase()]);
  const out: string[] = [];
  for (const raw of [assigneeEmail ?? "", ...invitees]) {
    const e = raw.trim().toLowerCase();
    if (!e || seen.has(e) || !isEmail(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Stored times are wall-clock (the typed 10:30 is kept as 10:30Z); Google gets them as local time in IST. */
function wallClock(d: Date): string {
  return d.toISOString().slice(0, 19);
}

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DEFAULT_MINUTES: Partial<Record<ScheduleKind, number>> = { task: 30, meeting: 30 };

export type EventForGoogle = {
  kind: ScheduleKind;
  title: string;
  description: string | null;
  note: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  societyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  appUrl: string | null;
};

/** The body sent to Google (insert and patch alike). */
export function googleEventBody(e: EventForGoogle, attendees: string[]) {
  const lines = [
    e.description,
    e.note,
    e.societyName ? `Society: ${e.societyName}` : null,
    e.contactName || e.contactPhone ? `Ask for: ${[e.contactName, e.contactPhone].filter(Boolean).join(" · ")}` : null,
    e.appUrl ? `Open in FirsThing: ${e.appUrl}` : null,
  ].filter((x): x is string => !!x && !!x.trim());
  let start: { date?: string; dateTime?: string; timeZone?: string };
  let end: { date?: string; dateTime?: string; timeZone?: string };
  if (e.allDay) {
    const next = new Date(Date.UTC(e.startAt.getUTCFullYear(), e.startAt.getUTCMonth(), e.startAt.getUTCDate() + 1));
    start = { date: dayOf(e.startAt) };
    end = { date: dayOf(next) };
  } else {
    const endAt =
      e.endAt && e.endAt.getTime() > e.startAt.getTime() ? e.endAt : new Date(e.startAt.getTime() + (DEFAULT_MINUTES[e.kind] ?? 60) * 60_000);
    start = { dateTime: wallClock(e.startAt), timeZone: CALENDAR_TIME_ZONE };
    end = { dateTime: wallClock(endAt), timeZone: CALENDAR_TIME_ZONE };
  }
  return {
    summary: e.kind === "task" ? `Task: ${e.title}` : e.title,
    description: lines.join("\n\n"),
    start,
    end,
    status: "confirmed" as const,
    attendees: attendees.map((email) => ({ email })),
    // Tasks remind 30 minutes ahead; the calendar default applies otherwise.
    reminders: e.kind === "task" ? { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] } : { useDefault: true },
    guestsCanModify: false,
  };
}

export type ResponseStatus = "needsAction" | "accepted" | "declined" | "tentative";
export const RESPONSE_LABEL: Record<ResponseStatus, string> = {
  needsAction: "Not answered",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
};

export type MeetingInput = {
  title: string;
  agenda: string;
  date: string;
  time: string;
  minutes: number;
  inviteeIds: string[];
  otherEmails: string;
  societyId: string;
  addMeet: boolean;
};

/** Split a typed list of addresses on commas, semicolons, spaces or new lines. */
export function parseEmailList(s: string): string[] {
  return s
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

/** Why a meeting cannot be saved as entered, or null. */
export function refuseMeeting(m: MeetingInput): string | null {
  if (!m.title.trim()) return "Say what the meeting is about.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || Number.isNaN(new Date(`${m.date}T00:00:00Z`).getTime())) return "Choose the date.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)) return "Choose the start time.";
  if (!Number.isInteger(m.minutes) || m.minutes < 5 || m.minutes > 8 * 60) return "Choose how long it runs.";
  const bad = parseEmailList(m.otherEmails).filter((e) => !isEmail(e));
  if (bad.length) return `Not an email address: ${bad.join(", ")}`;
  if (m.inviteeIds.length === 0 && parseEmailList(m.otherEmails).length === 0) return "Invite at least one person.";
  return null;
}
