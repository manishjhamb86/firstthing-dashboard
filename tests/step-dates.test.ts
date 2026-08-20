import { describe, it, expect } from "vitest";
import { refuseReplacementDate, STEP_DATE_ERRORS, refuseOrderedDate } from "@/lib/step-dates";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = d("2026-08-19");

describe("refuseReplacementDate", () => {
  // The whole point of the feature: a March 2026 commissioning entered today.
  it("accepts a fully historical commissioning with correct ordering", () => {
    expect(
      refuseReplacementDate({
        replacementDate: d("2026-03-30"),
        meterInstalledAt: d("2026-03-23"),
        lastPreInstallReading: d("2026-03-29"),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("refuses a replacement before its own meter install, even when backdated", () => {
    expect(
      refuseReplacementDate({
        replacementDate: d("2026-03-20"),
        meterInstalledAt: d("2026-03-23"),
        lastPreInstallReading: null,
        now: NOW,
      }),
    ).toBe(STEP_DATE_ERRORS.beforeMeter);
  });

  it("refuses replacement on the install day — the pre-install window would have no days", () => {
    expect(
      refuseReplacementDate({
        replacementDate: d("2026-03-23"),
        meterInstalledAt: d("2026-03-23"),
        lastPreInstallReading: null,
        now: NOW,
      }),
    ).toBe(STEP_DATE_ERRORS.sameDayAsMeter);
  });

  it("refuses a replacement earlier than readings already stored as pre-install", () => {
    // Those readings would silently stop being pre-install days.
    expect(
      refuseReplacementDate({
        replacementDate: d("2026-03-25"),
        meterInstalledAt: d("2026-03-23"),
        lastPreInstallReading: d("2026-03-29"),
        now: NOW,
      }),
    ).toBe(STEP_DATE_ERRORS.beforeLastReading);
  });

  it("refuses a future date", () => {
    expect(
      refuseReplacementDate({
        replacementDate: d("2026-08-20"),
        meterInstalledAt: d("2026-03-23"),
        lastPreInstallReading: null,
        now: NOW,
      }),
    ).toBe(STEP_DATE_ERRORS.future);
  });

  it("today itself is allowed — the normal, non-backdated case", () => {
    expect(
      refuseReplacementDate({
        replacementDate: NOW,
        meterInstalledAt: d("2026-08-10"),
        lastPreInstallReading: d("2026-08-18"),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("the day after install is the earliest legal replacement", () => {
    expect(
      refuseReplacementDate({
        replacementDate: d("2026-03-24"),
        meterInstalledAt: d("2026-03-23"),
        lastPreInstallReading: null,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("refuseOrderedDate — the deal's own dates", () => {
  const now = new Date("2026-08-20T10:00:00.000Z");
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

  it("accepts a date well in the past — that is the whole point of backdating", () => {
    expect(
      refuseOrderedDate({ subject: "The lead", date: d("2026-03-12"), now }),
    ).toBeNull();
  });

  it("refuses the future in either mode", () => {
    expect(refuseOrderedDate({ subject: "The lead", date: d("2026-08-21"), now })).toContain(
      "in the future",
    );
  });

  it("accepts today", () => {
    expect(refuseOrderedDate({ subject: "The lead", date: d("2026-08-20"), now })).toBeNull();
  });

  it("refuses a date earlier than something that must already have happened", () => {
    const why = refuseOrderedDate({
      subject: "The site survey",
      date: d("2026-03-01"),
      now,
      mustNotPrecede: [{ label: "the first meeting", date: d("2026-03-12") }],
    });
    // Names both ends: which date, and what it collides with.
    expect(why).toContain("The site survey");
    expect(why).toContain("the first meeting");
    expect(why).toContain("2026-03-12");
  });

  it("allows the same day as its predecessor", () => {
    expect(
      refuseOrderedDate({
        subject: "The lead",
        date: d("2026-03-12"),
        now,
        mustNotPrecede: [{ label: "the society record", date: d("2026-03-12") }],
      }),
    ).toBeNull();
  });

  it("skips predecessors that do not exist yet", () => {
    expect(
      refuseOrderedDate({
        subject: "The lead",
        date: d("2026-03-12"),
        now,
        mustNotPrecede: [{ label: "the society record", date: null }],
      }),
    ).toBeNull();
  });

  it("reports the first collision when several predecessors are given", () => {
    const why = refuseOrderedDate({
      subject: "The site survey",
      date: d("2026-02-01"),
      now,
      mustNotPrecede: [
        { label: "the society record", date: d("2026-01-01") },
        { label: "the first meeting", date: d("2026-03-12") },
      ],
    });
    expect(why).toContain("the first meeting");
  });

  it("refuses an unparseable date rather than treating it as now", () => {
    expect(refuseOrderedDate({ subject: "The lead", date: new Date("nope"), now })).toContain(
      "valid date",
    );
  });
});
