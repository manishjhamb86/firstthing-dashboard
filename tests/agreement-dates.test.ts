import { describe, expect, it } from "vitest";
import { refuseAgreementDates } from "@/lib/agreement-dates";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const base = {
  today: D("2026-09-27"),
  offerAcceptedOn: D("2025-08-20"),
  prepared: D("2025-08-22"),
  printed: D("2025-08-23"),
  notarized: D("2025-08-24"),
  signed: D("2025-08-25"),
  uploaded: D("2025-08-26"),
  activated: D("2025-08-26"),
  termStart: D("2025-09-01"),
  termEnd: D("2028-09-01"),
};

describe("refuseAgreementDates", () => {
  it("a backdated agreement in order is accepted", () => {
    expect(refuseAgreementDates(base)).toBeNull();
  });
  it("nothing in the future", () => {
    expect(refuseAgreementDates({ ...base, signed: D("2026-10-01"), uploaded: D("2026-10-01"), activated: D("2026-10-01") })).toMatch(/future/);
  });
  it("prepared no earlier than the offer's acceptance", () => {
    expect(refuseAgreementDates({ ...base, prepared: D("2025-08-19") })).toMatch(/before the offer was accepted/);
  });
  it("each step after the one before it", () => {
    expect(refuseAgreementDates({ ...base, notarized: D("2025-08-22") })).toMatch(/notarised .* before it was printed/);
    expect(refuseAgreementDates({ ...base, uploaded: D("2025-08-24") })).toMatch(/uploaded .* before it was signed/);
  });
  it("a step not yet taken is skipped", () => {
    expect(refuseAgreementDates({ ...base, notarized: null, signed: null, uploaded: null, activated: null, termStart: null, termEnd: null })).toBeNull();
  });
  it("activation after signing; the term ends after it starts", () => {
    expect(refuseAgreementDates({ ...base, activated: D("2025-08-24") })).toMatch(/activated .* before the agreement was signed/);
    expect(refuseAgreementDates({ ...base, termEnd: D("2025-09-01") })).toMatch(/cannot end/);
  });
});
