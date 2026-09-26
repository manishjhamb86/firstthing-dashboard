import { describe, expect, it } from "vitest";
import { lightCountStages } from "@/lib/light-count-history";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const demo = { from: d("2025-11-04"), to: d("2025-11-18") };
const change = {
  previousLightCount: 55,
  newLightCount: 76,
  previousBaseline: 25,
  rescaledBaseline: 25 / 55 * 76,
  effectiveDate: d("2026-08-01"),
};

describe("lightCountStages", () => {
  it("French Apartment: 55 lights from the demo until the change, then 76 — currently", () => {
    const s = lightCountStages({
      currentLightCount: 76,
      commissionedBaseline: 25,
      benchmarkPct: 64.36,
      demo,
      fallbackStart: null,
      events: [change],
      today: d("2026-09-26"),
    });
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ lightCount: 55, from: "2025-11-04", to: "2026-07-31", current: false, baseline: 25 });
    expect(s[0].demo).toEqual({ from: "2025-11-04", to: "2025-11-18" });
    expect(s[0].ceilingKwh).toBeCloseTo(25 * (1 - 0.6436), 10);
    expect(s[1]).toMatchObject({ lightCount: 76, from: "2026-08-01", to: null, current: true, demo: null });
    expect(s[1].baseline).toBeCloseTo(34.5454545, 5);
    expect(s[1].ceilingKwh).toBeCloseTo(34.5454545 * (1 - 0.6436), 5);
  });

  it("no change on record: one stage, current", () => {
    const s = lightCountStages({ currentLightCount: 55, commissionedBaseline: 25, benchmarkPct: 64, demo, fallbackStart: null, events: [], today: d("2026-09-26") });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ lightCount: 55, to: null, current: true });
  });

  it("a voided change is not a stage", () => {
    const s = lightCountStages({
      currentLightCount: 55, commissionedBaseline: 25, benchmarkPct: 64, demo, fallbackStart: null,
      events: [{ ...change, voidedAt: d("2026-08-02") }], today: d("2026-09-26"),
    });
    expect(s.map((x) => x.lightCount)).toEqual([55]);
  });

  it("a change dated in the future: the old count is still current", () => {
    const s = lightCountStages({
      currentLightCount: 76, commissionedBaseline: 25, benchmarkPct: 64, demo, fallbackStart: null,
      events: [{ ...change, effectiveDate: d("2026-12-01") }], today: d("2026-09-26"),
    });
    expect(s.map((x) => x.current)).toEqual([true, false]);
  });

  it("no demo in the system: starts from the fallback, and without a baseline states no ceiling", () => {
    const s = lightCountStages({
      currentLightCount: 1066, commissionedBaseline: null, benchmarkPct: 64, demo: null, fallbackStart: d("2025-06-01"),
      events: [], today: d("2026-09-26"),
    });
    expect(s[0]).toMatchObject({ from: "2025-06-01", demo: null, baseline: null, ceilingKwh: null });
  });

  it("two changes in order of their dates, whatever order they were recorded in", () => {
    const later = { previousLightCount: 76, newLightCount: 80, previousBaseline: 34.5, rescaledBaseline: 36, effectiveDate: d("2026-09-01") };
    const s = lightCountStages({
      currentLightCount: 80, commissionedBaseline: 25, benchmarkPct: 64, demo, fallbackStart: null,
      events: [later, change], today: d("2026-09-26"),
    });
    expect(s.map((x) => [x.lightCount, x.from, x.to])).toEqual([
      [55, "2025-11-04", "2026-07-31"],
      [76, "2026-08-01", "2026-08-31"],
      [80, "2026-09-01", null],
    ]);
  });
});
