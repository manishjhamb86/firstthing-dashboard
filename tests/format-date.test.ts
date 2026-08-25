import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, isoDate, isoDateTimeLocal } from "@/lib/format-date";

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
