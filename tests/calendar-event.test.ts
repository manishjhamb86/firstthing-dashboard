import { describe, expect, it } from "vitest";
import {
  MAX_SYNC_ATTEMPTS,
  attendeeEmails,
  googleEventBody,
  googleEventIdFor,
  organizerFor,
  parseEmailList,
  refuseMeeting,
  syncDecision,
  type SyncFacts,
} from "@/lib/calendar-event";

const now = new Date("2026-09-25T10:00:00Z");
const base: SyncFacts = {
  status: "scheduled",
  startAt: new Date("2026-09-26T10:30:00Z"),
  updatedAt: new Date("2026-09-25T09:00:00Z"),
  googleEventId: null,
  calendarSyncedAt: null,
  calendarSyncAttempts: 0,
  calendarSyncError: null,
};

describe("syncDecision", () => {
  it("pushes a new upcoming event", () => expect(syncDecision(base, now)).toBe("push"));
  it("skips one unchanged since its last push", () =>
    expect(syncDecision({ ...base, googleEventId: "x", calendarSyncedAt: new Date("2026-09-25T09:30:00Z") }, now)).toBe("skip"));
  it("pushes one edited after its last push", () =>
    expect(syncDecision({ ...base, googleEventId: "x", calendarSyncedAt: new Date("2026-09-25T08:00:00Z") }, now)).toBe("push"));
  it("never writes history that was never pushed", () =>
    expect(syncDecision({ ...base, startAt: new Date("2026-09-20T10:00:00Z") }, now)).toBe("skip"));
  it("deletes a cancelled event that was pushed, and ignores one that was not", () => {
    expect(syncDecision({ ...base, status: "cancelled", googleEventId: "x", calendarSyncedAt: new Date("2026-09-25T08:00:00Z") }, now)).toBe("delete");
    expect(syncDecision({ ...base, status: "cancelled" }, now)).toBe("skip");
  });
  it("leaves a done event where it is", () => expect(syncDecision({ ...base, status: "done", googleEventId: "x" }, now)).toBe("skip"));
  it("stops retrying after repeated failures", () =>
    expect(syncDecision({ ...base, calendarSyncError: "boom", calendarSyncAttempts: MAX_SYNC_ATTEMPTS }, now)).toBe("skip"));
});

describe("googleEventIdFor", () => {
  it("is deterministic and inside base32hex", () => {
    const id = googleEventIdFor("cmfz9xyzw0001abc");
    expect(id).toBe(googleEventIdFor("cmfz9xyzw0001abc"));
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});

describe("organizerFor / attendeeEmails", () => {
  it("the creator organizes on the domain; anyone else falls back", () => {
    expect(organizerFor("Asha@FirsThing.earth", "firsthing.earth", "ops@firsthing.earth")).toBe("asha@firsthing.earth");
    expect(organizerFor("someone@gmail.com", "firsthing.earth", "ops@firsthing.earth")).toBe("ops@firsthing.earth");
  });
  it("dedupes, drops the organizer and anything that is not an address", () =>
    expect(attendeeEmails("a@x.in", "B@x.in", ["b@x.in", "a@x.in", "c@y.com", "nope"])).toEqual(["b@x.in", "c@y.com"]));
});

describe("googleEventBody", () => {
  const e = {
    kind: "task" as const,
    title: "Call the committee",
    description: "About the offer",
    note: null,
    startAt: new Date("2026-09-26T10:30:00Z"),
    endAt: null,
    allDay: false,
    societyName: "Ace City",
    contactName: null,
    contactPhone: null,
    appUrl: "https://stage.firsthing.earth/admin/tasks?open=1",
  };
  it("sends the typed wall-clock time as IST, 30 minutes for a task", () => {
    const b = googleEventBody(e, ["b@x.in"]);
    expect(b.start).toEqual({ dateTime: "2026-09-26T10:30:00", timeZone: "Asia/Kolkata" });
    expect(b.end).toEqual({ dateTime: "2026-09-26T11:00:00", timeZone: "Asia/Kolkata" });
    expect(b.summary).toBe("Task: Call the committee");
    expect(b.description).toContain("Society: Ace City");
    expect(b.attendees).toEqual([{ email: "b@x.in" }]);
  });
  it("an all-day event runs date to next date", () => {
    const b = googleEventBody({ ...e, allDay: true, startAt: new Date("2026-09-30T00:00:00Z") }, []);
    expect(b.start).toEqual({ date: "2026-09-30" });
    expect(b.end).toEqual({ date: "2026-10-01" });
  });
});

describe("refuseMeeting", () => {
  const m = { title: "Weekly ops", agenda: "", date: "2026-09-26", time: "11:00", minutes: 30, inviteeIds: ["u1"], otherEmails: "", societyId: "", addMeet: true };
  it("accepts a complete meeting", () => expect(refuseMeeting(m)).toBeNull());
  it("needs someone invited", () => expect(refuseMeeting({ ...m, inviteeIds: [] })).toMatch(/Invite/));
  it("names a bad address", () => expect(refuseMeeting({ ...m, otherEmails: "ok@x.in, notanemail" })).toMatch(/notanemail/));
  it("needs a start time", () => expect(refuseMeeting({ ...m, time: "" })).toMatch(/start time/));
  it("parses a pasted list", () => expect(parseEmailList("a@x.in; B@y.com\nc@z.org")).toEqual(["a@x.in", "b@y.com", "c@z.org"]));
});

import { effectiveAllDay, readBack, wallClockFromGoogle, type ReadBackRow } from "@/lib/calendar-event";

describe("two-way sync: read-back", () => {
  const row: ReadBackRow = {
    kind: "meeting",
    title: "Weekly ops",
    startAt: new Date("2026-09-26T14:00:00Z"),
    endAt: new Date("2026-09-26T14:30:00Z"),
    allDay: false,
    attendeeEmails: ["gomti.mishra@firsthing.earth", "manish@firsthing.earth"],
    organizer: "yogesh@firsthing.earth",
    assigneeEmail: "yogesh@firsthing.earth",
  };
  const same = {
    status: "confirmed",
    summary: "Weekly ops",
    start: { dateTime: "2026-09-26T14:00:00+05:30" },
    end: { dateTime: "2026-09-26T14:30:00+05:30" },
    attendees: [{ email: "gomti.mishra@firsthing.earth" }, { email: "manish@firsthing.earth" }, { email: "yogesh@firsthing.earth" }],
  };
  it("reads Google's time as the app's IST wall clock, whatever zone Google answers in", () => {
    expect(wallClockFromGoogle({ dateTime: "2026-09-26T14:00:00+05:30" })!.at.toISOString()).toBe("2026-09-26T14:00:00.000Z");
    expect(wallClockFromGoogle({ dateTime: "2026-09-26T08:30:00Z" })!.at.toISOString()).toBe("2026-09-26T14:00:00.000Z");
    expect(wallClockFromGoogle({ date: "2026-09-30" })).toEqual({ at: new Date("2026-09-30T00:00:00Z"), allDay: true });
  });
  it("nothing to do when Google matches", () => expect(readBack(row, same).kind).toBe("none"));
  it("a move in Google moves the meeting", () => {
    const r = readBack(row, { ...same, start: { dateTime: "2026-09-26T16:00:00+05:30" }, end: { dateTime: "2026-09-26T17:00:00+05:30" } });
    expect(r.kind === "changed" && r.startAt!.toISOString()).toBe("2026-09-26T16:00:00.000Z");
    expect(r.kind === "changed" && r.endAt!.toISOString()).toBe("2026-09-26T17:00:00.000Z");
  });
  it("guests added and removed in Google, never the organizer", () => {
    const r = readBack(row, { ...same, attendees: [{ email: "Gomti.Mishra@firsthing.earth" }, { email: "new@example.com" }, { email: "yogesh@firsthing.earth" }] });
    expect(r.kind === "changed" && r.addEmails).toEqual(["new@example.com"]);
    expect(r.kind === "changed" && r.removeEmails).toEqual(["manish@firsthing.earth"]);
  });
  it("a renamed task keeps its own title without the 'Task:' prefix", () => {
    const r = readBack({ ...row, kind: "task", title: "Call committee", endAt: null, attendeeEmails: [] }, { ...same, summary: "Task: Call the committee", end: { dateTime: "2026-09-26T14:30:00+05:30" } });
    expect(r.kind === "changed" && r.title).toBe("Call the committee");
  });
  it("deleted in Google", () => expect(readBack(row, { ...same, status: "cancelled" }).kind).toBe("deleted"));
  it("a date-only deal appointment is all-day both ways, so it never reads as moved", () => {
    const deal = { ...row, kind: "demo_meeting" as const, startAt: new Date("2026-09-30T00:00:00Z"), endAt: null, attendeeEmails: [] };
    expect(effectiveAllDay(deal)).toBe(true);
    expect(readBack(deal, { ...same, summary: "Weekly ops", start: { date: "2026-09-30" }, end: { date: "2026-10-01" } }).kind).toBe("none");
  });
});
