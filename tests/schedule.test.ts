import { describe, expect, it } from "vitest";
import {
  DAY_RELATION_LABEL,
  dayKey,
  dayRelation,
  eventTitle,
  groupByDay,
  timeLabel,
  type CalendarEvent,
} from "@/lib/schedule";

const at = (iso: string, id = iso): CalendarEvent => ({
  id,
  kind: "survey_visit",
  title: "Site survey · Test",
  startAt: new Date(iso),
  endAt: null,
  assigneeName: "Inspector",
  societyName: "Test",
  contactName: null,
  contactPhone: null,
  note: null,
  href: null,
});

describe("the calendar groups what is actually booked", () => {
  it("puts a day's events together, earliest day first", () => {
    const days = groupByDay([
      at("2026-08-29T09:00:00.000Z"),
      at("2026-08-27T14:00:00.000Z"),
      at("2026-08-27T10:30:00.000Z"),
    ]);
    expect(days.map((d) => d.key)).toEqual(["2026-08-27", "2026-08-29"]);
    expect(days[0].events.map((e) => timeLabel(e.startAt, e.endAt))).toEqual(["10:30", "14:00"]);
  });

  it("leaves empty days out — a calendar of padding is not a calendar", () => {
    const days = groupByDay([at("2026-08-27T10:30:00.000Z"), at("2026-09-04T10:30:00.000Z")]);
    expect(days).toHaveLength(2);
  });

  it("groups on the day the appointment was entered for, not the viewer's", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    expect(dayKey(new Date("2026-08-27T01:00:00.000Z"))).toBe("2026-08-27");
    process.env.TZ = tz;
  });
});

describe("how a day reads relative to now", () => {
  const now = new Date("2026-08-25T15:00:00.000Z");

  it("names today and tomorrow", () => {
    expect(dayRelation(new Date("2026-08-25T09:00:00.000Z"), now)).toBe("today");
    expect(dayRelation(new Date("2026-08-26T09:00:00.000Z"), now)).toBe("tomorrow");
  });

  it("is a property of the day, not the hour — 10:31 is not late for 10:30", () => {
    // The visit is in progress, not overdue.
    expect(dayRelation(new Date("2026-08-25T10:30:00.000Z"), now)).toBe("today");
  });

  it("flags a day that has passed with the appointment still open", () => {
    expect(dayRelation(new Date("2026-08-24T10:30:00.000Z"), now)).toBe("overdue");
    expect(DAY_RELATION_LABEL.overdue).toMatch(/not closed out/i);
  });

  it("says nothing special about an ordinary future day", () => {
    expect(dayRelation(new Date("2026-09-10T10:30:00.000Z"), now)).toBe("upcoming");
    expect(DAY_RELATION_LABEL.upcoming).toBe("");
  });
});

describe("a date-only appointment does not invent an hour", () => {
  it("reads as All day", () => {
    expect(timeLabel(new Date("2026-08-27T00:00:00.000Z"), null)).toBe("All day");
  });

  it("but a booked slot keeps its time", () => {
    expect(timeLabel(new Date("2026-08-27T10:30:00.000Z"), null)).toBe("10:30");
    expect(
      timeLabel(new Date("2026-08-27T10:30:00.000Z"), new Date("2026-08-27T12:00:00.000Z")),
    ).toBe("10:30–12:00");
  });
});

describe("titles read alike across kinds", () => {
  it("names what it is and who it is with", () => {
    expect(eventTitle("survey_visit", "Mahagun Puram")).toBe("Site survey · Mahagun Puram");
    expect(eventTitle("demo_meeting", "Mahagun Puram")).toBe(
      "Meeting with the committee · Mahagun Puram",
    );
  });
});
