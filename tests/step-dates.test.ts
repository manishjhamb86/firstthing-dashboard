import { describe, it, expect } from "vitest";
import { refuseReplacementDate, STEP_DATE_ERRORS } from "@/lib/step-dates";

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
