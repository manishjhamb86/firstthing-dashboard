import { describe, expect, it } from "vitest";
import { refuseDateCorrector, refuseInstallationDates } from "@/lib/installation-dates";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const today = D("2026-09-27");

describe("refuseInstallationDates", () => {
  it("accepts a backdated installation in order (Hyde Park, billed from July 2025)", () => {
    expect(
      refuseInstallationDates({
        today,
        batches: [{ day: 1, submittedOn: D("2025-07-04"), reviewedOn: D("2025-07-04") }],
        signedOn: D("2025-07-05"),
      }),
    ).toBeNull();
  });

  it("refuses a date in the future", () => {
    expect(refuseInstallationDates({ today, batches: [{ day: 1, submittedOn: D("2026-10-01"), reviewedOn: null }], signedOn: null })).toMatch(/future/);
    expect(refuseInstallationDates({ today, batches: [], signedOn: D("2026-09-28") })).toMatch(/future/);
  });

  it("refuses an approval before the work it approves", () => {
    expect(
      refuseInstallationDates({ today, batches: [{ day: 1, submittedOn: D("2025-07-04"), reviewedOn: D("2025-07-03") }], signedOn: null }),
    ).toMatch(/before the work/);
  });

  it("refuses a certificate signed before a day was done and approved, and says to correct that day first", () => {
    const r = refuseInstallationDates({
      today,
      batches: [{ day: 1, submittedOn: D("2026-09-26"), reviewedOn: D("2026-09-26") }],
      signedOn: D("2025-07-05"),
    });
    expect(r).toMatch(/day 1/);
    expect(r).toMatch(/Correct that day's dates first/);
  });

  it("allows the certificate on the same day as the last approval", () => {
    expect(
      refuseInstallationDates({ today, batches: [{ day: 1, submittedOn: D("2025-07-05"), reviewedOn: D("2025-07-05") }], signedOn: D("2025-07-05") }),
    ).toBeNull();
  });
});

describe("refuseDateCorrector", () => {
  it("demo mode: field staff may correct, with or without a reason", () => {
    expect(refuseDateCorrector({ demo: true, isField: true, isOps: false, reason: "" })).toBeNull();
    expect(refuseDateCorrector({ demo: true, isField: false, isOps: false, reason: "x" })).toMatch(/field or operations/);
  });

  it("live: operations only, and a reason is required", () => {
    expect(refuseDateCorrector({ demo: false, isField: true, isOps: false, reason: "wrong day" })).toMatch(/operations only/);
    expect(refuseDateCorrector({ demo: false, isField: true, isOps: true, reason: "  " })).toMatch(/Say why/);
    expect(refuseDateCorrector({ demo: false, isField: true, isOps: true, reason: "typed on the wrong day" })).toBeNull();
  });
});
