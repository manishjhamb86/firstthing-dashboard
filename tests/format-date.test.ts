import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatInstant, isoDate, isoDateTimeLocal, timeAgo } from "@/lib/format-date";

describe("dates read DD-MM-YYYY", () => {
  it("renders a stored UTC-midnight date as the day it is", () => {
    expect(formatDate(new Date("2026-08-02T00:00:00.000Z"))).toBe("02-08-2026");
  });

  it("pads both the day and the month", () => {
    expect(formatDate(new Date("2026-01-02T00:00:00.000Z"))).toBe("02-01-2026");
  });

  it("does not shift the day for a viewer west of UTC", () => {
    // The trap: getDate() on a UTC-midnight value returns the PREVIOUS day in
    // any negative offset, so a meeting logged on the 1st reads as the 31st.
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    expect(formatDate(new Date("2026-08-01T00:00:00.000Z"))).toBe("01-08-2026");
    process.env.TZ = tz;
  });

  it("says so plainly when there is no date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(new Date("not a date"))).toBe("—");
  });

  it("keeps ISO for form controls, which parse nothing else", () => {
    expect(isoDate(new Date("2026-08-02T00:00:00.000Z"))).toBe("2026-08-02");
  });
});

describe("a visit has an hour on it", () => {
  it("reads as the day and the time that were booked", () => {
    expect(formatDateTime(new Date("2026-08-27T10:30:00.000Z"))).toBe("27-08-2026 · 10:30");
  });

  it("does not move the appointment for a viewer in another zone", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    expect(formatDateTime(new Date("2026-08-27T10:30:00.000Z"))).toBe("27-08-2026 · 10:30");
    process.env.TZ = tz;
  });

  it("round-trips through the form control", () => {
    expect(isoDateTimeLocal(new Date("2026-08-27T10:30:00.000Z"))).toBe("2026-08-27T10:30");
    expect(isoDateTimeLocal(null)).toBe("");
  });

  it("says so plainly when nothing is booked", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});

describe("a device timestamp is read where the reader lives", () => {
  // The bug: an 11:40 UTC reading rendered as "11:40", telling an Indian
  // reader it was 5½ hours older than it was.
  it("renders a UTC instant in IST", () => {
    expect(formatInstant(new Date("2026-08-25T11:40:48.000Z"))).toBe("25-08-2026 · 17:10");
  });

  it("crosses the date line correctly — late UTC is the next IST day", () => {
    expect(formatInstant(new Date("2026-08-25T19:30:00.000Z"))).toBe("26-08-2026 · 01:00");
  });

  it("does not depend on the server's own zone", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    expect(formatInstant(new Date("2026-08-25T11:40:48.000Z"))).toBe("25-08-2026 · 17:10");
    process.env.TZ = "UTC";
    expect(formatInstant(new Date("2026-08-25T11:40:48.000Z"))).toBe("25-08-2026 · 17:10");
    process.env.TZ = tz;
  });

  it("leaves the wall-clock formatter alone — an appointment is echoed as typed", () => {
    // Same instant, deliberately different answer: this one is what somebody
    // agreed on the phone, not when a sensor spoke.
    expect(formatDateTime(new Date("2026-08-27T10:30:00.000Z"))).toBe("27-08-2026 · 10:30");
  });
});

describe("how stale a reading is, in words", () => {
  const now = new Date("2026-08-25T13:23:00.000Z");
  it("counts minutes, then hours, then days", () => {
    expect(timeAgo(new Date("2026-08-25T13:22:30.000Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-08-25T13:05:00.000Z"), now)).toBe("18 min ago");
    expect(timeAgo(new Date("2026-08-25T11:40:00.000Z"), now)).toBe("1h 43m ago");
    expect(timeAgo(new Date("2026-08-25T10:23:00.000Z"), now)).toBe("3h ago");
    expect(timeAgo(new Date("2026-08-24T13:23:00.000Z"), now)).toBe("yesterday");
    expect(timeAgo(new Date("2026-08-20T13:23:00.000Z"), now)).toBe("5 days ago");
  });
  it("says never rather than guessing", () => {
    expect(timeAgo(null, now)).toBe("never");
  });
});
