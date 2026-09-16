import { describe, expect, it } from "vitest";
import { publishedMonthOf, summarisePublished, weightedSavingsPct, type PublishedMonthRow } from "@/lib/published-months";

const row = (over: Partial<PublishedMonthRow>): PublishedMonthRow => ({
  period: "2026-07",
  version: 1,
  releasedAt: new Date("2026-08-05T00:00:00Z"),
  rederivedAt: null,
  totalSavedKwh: 6_252.22,
  totalSavedValue: 39_027.78,
  fee: 14_050,
  lineBases: ["agreed"],
  savingsPct: 64,
  readingsNotes: [],
  ...over,
});

describe("FEAT-111 — a published month, in the society's own terms", () => {
  it("states saved, paid to FirsThing and kept — the fee is FirsThing's share, never the saving", () => {
    const m = publishedMonthOf(row({}));
    expect(m.savedValue).toBeCloseTo(39_027.78, 2);
    expect(m.paidToFirsthing).toBe(14_050);
    expect(m.societyKeeps).toBeCloseTo(24_977.78, 2);
    expect(m.societyKeeps).toBeGreaterThan(m.paidToFirsthing);
  });

  it("names the basis in ASSUM-30's words, and says when it is mixed", () => {
    expect(publishedMonthOf(row({ lineBases: ["agreed"] })).basisWords).toBe("Based on your agreement.");
    expect(publishedMonthOf(row({ lineBases: ["measured"] })).basisWords).toBe("From meter readings.");
    expect(publishedMonthOf(row({ lineBases: ["measured", "agreed"] })).basis).toBe("mixed");
  });

  it("carries the re-derivation date so a changed month says so (AC-7)", () => {
    const when = new Date("2026-08-20T00:00:00Z");
    expect(publishedMonthOf(row({ version: 2, rederivedAt: when })).updatedAt).toBe(when);
    expect(publishedMonthOf(row({})).updatedAt).toBeNull();
  });

  it("orders newest first and totals since the start", () => {
    const s = summarisePublished([row({ period: "2026-05", totalSavedValue: 1_000, fee: 400, totalSavedKwh: 100 }), row({ period: "2026-07" }), row({ period: "2026-06", totalSavedValue: 2_000, fee: 800, totalSavedKwh: 200 })]);
    expect(s.months.map((m) => m.period)).toEqual(["2026-07", "2026-06", "2026-05"]);
    expect(s.latest?.period).toBe("2026-07");
    expect(s.sinceStart).toEqual({
      months: 3,
      savedValue: 39_027.78 + 3_000,
      savedKwh: 6_252.22 + 300,
      paidToFirsthing: 14_050 + 1_200,
      societyKeeps: 39_027.78 + 3_000 - (14_050 + 1_200),
    });
  });

  it("with nothing published there is no latest and no total — never a zero shown as a figure (AC-4)", () => {
    const s = summarisePublished([]);
    expect(s.latest).toBeNull();
    expect(s.sinceStart).toBeNull();
  });

  it("weights the savings % by the consumption behind each line", () => {
    // 600 kWh saved at 60% (base 1000) and 80 saved at 80% (base 100) → 680/1100 = 61.8%, not 70%.
    expect(weightedSavingsPct([{ savedKwh: 600, pct: 60 }, { savedKwh: 80, pct: 80 }])).toBeCloseTo(61.818, 2);
    expect(weightedSavingsPct([])).toBeNull();
  });
});
