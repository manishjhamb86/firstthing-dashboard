import { describe, expect, it } from "vitest";
import { fmNameKey, planSpanChange, refuseFmCompany } from "@/lib/facility-management";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-09-25");

describe("facility management", () => {
  it("names match however they are written", () => {
    expect(fmNameKey("Sodexo Facilities Management Services India Pvt. Ltd.")).toBe(fmNameKey("SODEXO facilities management"));
    expect(fmNameKey("JLL Property Services (India) Private Limited")).toBe(fmNameKey("JLL Property"));
  });
  it("refuses a nameless company or a malformed GSTIN", () => {
    expect(refuseFmCompany({ name: " " })).toMatch(/Name/);
    expect(refuseFmCompany({ name: "Acme FM", gstin: "123" })).toMatch(/GSTIN/);
    expect(refuseFmCompany({ name: "Acme FM", gstin: "09AAACX1234F1Z5" })).toBeNull();
  });
  it("a society's first company opens a span; a change closes the old one the day before", () => {
    expect(planSpanChange(null, "a", d("2026-04-01"), now)).toEqual({ kind: "change", close: null, open: { companyId: "a", startedOn: d("2026-04-01") } });
    expect(planSpanChange({ id: "e1", companyId: "a", startedOn: d("2026-04-01") }, "b", d("2026-09-01"), now)).toEqual({
      kind: "change",
      close: { id: "e1", endedOn: d("2026-08-31") },
      open: { companyId: "b", startedOn: d("2026-09-01") },
    });
  });
  it("the same company is no change; clearing only closes", () => {
    expect(planSpanChange({ id: "e1", companyId: "a", startedOn: d("2026-04-01") }, "a", d("2026-09-01"), now).kind).toBe("none");
    expect(planSpanChange({ id: "e1", companyId: "a", startedOn: d("2026-04-01") }, null, d("2026-09-01"), now)).toEqual({ kind: "change", close: { id: "e1", endedOn: d("2026-08-31") }, open: null });
  });
  it("the same day as it began is a correction of which company, not a move", () =>
    expect(planSpanChange({ id: "e1", companyId: "a", startedOn: d("2026-04-01") }, "b", d("2026-04-01"), now)).toEqual({ kind: "correct", id: "e1", companyId: "b" }));
  it("refuses a change dated before the current one started, or in the future", () => {
    expect(planSpanChange({ id: "e1", companyId: "a", startedOn: d("2026-04-01") }, "b", d("2026-03-01"), now).kind).toBe("refuse");
    expect(planSpanChange(null, "b", d("2026-10-01"), now).kind).toBe("refuse");
  });
});
