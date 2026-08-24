import { describe, expect, it } from "vitest";
import { formatDate, isoDate } from "@/lib/format-date";

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
