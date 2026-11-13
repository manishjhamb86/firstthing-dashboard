import { describe, expect, it } from "vitest";
import { dailySavedKwh, fillEveryDay, istYesterday, nowKwhPerKl, parseReportDays, readAverage, refuseBaseline, savingsSummary, totalOf } from "@/lib/pump-savings";

describe("parseReportDays", () => {
  it("reads the report's own table lines, with a named month or ISO", () => {
    const r = parseReportDays("Date, kWh, m3\n24 June 2026, 592, 987\n25 June 2026\t569\t952\n2026-06-26 593 988\n");
    expect(r.problems).toEqual([]);
    expect(r.days).toEqual([
      { day: "2026-06-24", kwh: 592, kl: 987 },
      { day: "2026-06-25", kwh: 569, kl: 952 },
      { day: "2026-06-26", kwh: 593, kl: 988 },
    ]);
  });
  it("names the line it cannot read instead of dropping it, and refuses an ambiguous numeric date", () => {
    const r = parseReportDays("24 June 2026, 592, 987\nhello\n10/11/2026, 500, 900\n24 June 2026, 1, 1");
    expect(r.days).toHaveLength(1);
    expect(r.problems).toHaveLength(3);
    expect(r.problems[0]).toMatch(/Line 2/);
    expect(r.problems[1]).toMatch(/could be 2026-11-10 or 2026-10-11/);
    expect(r.problems[2]).toMatch(/appears twice/);
  });
});

// RG Residency's own November days (2–9 Nov 2026) against the report's
// 0.79 kWh/KL baseline — the figures the design was drawn with.
const BASELINE = 0.79;
const READ = [
  { day: "2026-11-02", kwh: 522, kl: 889 },
  { day: "2026-11-03", kwh: 521, kl: 934 },
  { day: "2026-11-04", kwh: 497, kl: 895 },
  { day: "2026-11-05", kwh: 510, kl: 954 },
  { day: "2026-11-06", kwh: 551, kl: 977 },
  { day: "2026-11-07", kwh: 489, kl: 873 },
  { day: "2026-11-08", kwh: 473, kl: 846 },
  { day: "2026-11-09", kwh: 496, kl: 839 },
];

describe("dailySavedKwh", () => {
  it("is what the old kWh/KL would have used for the day's water, less what the pump drew", () => {
    expect(dailySavedKwh(BASELINE, 496, 839)).toBeCloseTo(0.79 * 839 - 496, 6); // 166.81
    expect(dailySavedKwh(BASELINE, null, 839)).toBeNull();
  });
});

describe("fillEveryDay", () => {
  it("gives every calendar day a row, estimating the gaps from the read-day average", () => {
    const days = fillEveryDay({ from: "2026-11-01", to: "2026-11-12", readDays: READ, baselineKwhPerKl: BASELINE });
    expect(days).toHaveLength(12);
    expect(days.map((d) => d.day)[0]).toBe("2026-11-01");
    expect(days.map((d) => d.day)[11]).toBe("2026-11-12");
    const avg = readAverage(READ)!;
    expect(avg.kwh).toBeCloseTo(4059 / 8);
    expect(avg.kl).toBeCloseTo(7207 / 8);
    const nov1 = days[0];
    expect(nov1.estimated).toBe(true);
    expect(nov1.kwh).toBeCloseTo(avg.kwh);
    expect(nov1.kl).toBeCloseTo(avg.kl);
    expect(nov1.savedKwh).toBeCloseTo(BASELINE * avg.kl - avg.kwh);
    const nov9 = days[8];
    expect(nov9.estimated).toBe(false);
    expect(nov9.savedKwh).toBeCloseTo(166.81, 2);
    expect(days.filter((d) => d.estimated)).toHaveLength(4); // 1, 10, 11, 12 Nov
  });

  it("replaces an estimate the moment the day is read — nothing is stored for an estimate", () => {
    const before = fillEveryDay({ from: "2026-11-09", to: "2026-11-10", readDays: READ, baselineKwhPerKl: BASELINE });
    expect(before[1].estimated).toBe(true);
    const after = fillEveryDay({ from: "2026-11-09", to: "2026-11-10", readDays: [...READ, { day: "2026-11-10", kwh: 500, kl: 900 }], baselineKwhPerKl: BASELINE });
    expect(after[1].estimated).toBe(false);
    expect(after[1].kwh).toBe(500);
  });

  it("keeps a half-read day's real figure and fills only the missing one", () => {
    const days = fillEveryDay({ from: "2026-11-09", to: "2026-11-09", readDays: [...READ.slice(0, 7), { day: "2026-11-09", kwh: 496, kl: null }], baselineKwhPerKl: BASELINE });
    expect(days[0].estimated).toBe(true);
    expect(days[0].kwh).toBe(496);
    expect(days[0].kl).toBeCloseTo(6368 / 7); // KL averaged over the 7 days that have one
  });

  it("is empty with nothing read yet — there is no average to invent days from", () => {
    expect(fillEveryDay({ from: "2026-11-01", to: "2026-11-05", readDays: [], baselineKwhPerKl: BASELINE })).toEqual([]);
  });
});

describe("savingsSummary / totalOf", () => {
  it("totals kWh and ₹ at the tariff, counting the estimated days", () => {
    const days = fillEveryDay({ from: "2026-11-01", to: "2026-11-12", readDays: READ, baselineKwhPerKl: BASELINE });
    const s = savingsSummary(days, 7);
    expect(s.month.period).toBe("2026-11");
    expect(s.month.days).toBe(12);
    expect(s.month.estimatedDays).toBe(4);
    const readSaved = 0.79 * 7207 - 4059; // 1634.53
    const avg = readAverage(READ)!;
    const estSaved = 4 * (0.79 * avg.kl - avg.kwh);
    expect(s.month.savedKwh).toBeCloseTo(readSaved + estSaved, 4);
    expect(s.month.savedValue).toBeCloseTo((readSaved + estSaved) * 7, 4);
    expect(s.yesterday?.day).toBe("2026-11-12");
    expect(s.yesterday?.estimated).toBe(true);
  });

  it("has no ₹ without a tariff on record, and still has the kWh", () => {
    const t = totalOf(fillEveryDay({ from: "2026-11-02", to: "2026-11-09", readDays: READ, baselineKwhPerKl: BASELINE }), null);
    expect(t.savedValue).toBeNull();
    expect(t.savedKwh).toBeCloseTo(1634.53, 2);
  });
});

describe("nowKwhPerKl", () => {
  it("is total kWh over total KL of the read days in the window — not the mean of ratios, never an estimate", () => {
    const n = nowKwhPerKl(READ, "2026-11-12", 30)!;
    expect(n.days).toBe(8);
    expect(n.kwhPerKl).toBeCloseTo(4059 / 7207, 6);
    expect(n.from).toBe("2026-11-02");
    const meanOfRatios = READ.reduce((a, d) => a + d.kwh / d.kl, 0) / 8;
    expect(n.kwhPerKl).not.toBeCloseTo(meanOfRatios, 5);
  });
  it("leaves out read days older than the window", () => {
    expect(nowKwhPerKl(READ, "2026-12-20", 30)).toBeNull();
  });
});

describe("istYesterday", () => {
  it("is India's wall-clock yesterday, so 01:00 IST on the 13th is still the 12th's day before", () => {
    // 2026-11-12T19:30Z is 01:00 IST on 13 Nov → yesterday is 12 Nov
    expect(istYesterday(new Date("2026-11-12T19:30:00Z"))).toBe("2026-11-12");
    // 2026-11-12T18:00Z is 23:30 IST on 12 Nov → yesterday is 11 Nov
    expect(istYesterday(new Date("2026-11-12T18:00:00Z"))).toBe("2026-11-11");
  });
});

describe("refuseBaseline", () => {
  const ok = { periodFrom: "2026-05-12", periodTo: "2026-06-02", kwh: 17270, kl: 21868, savingsFrom: "2026-06-24", today: "2026-11-13" };
  it("accepts the report's own baseline", () => expect(refuseBaseline(ok)).toBeNull());
  it("refuses savings that start inside or before the period", () => expect(refuseBaseline({ ...ok, savingsFrom: "2026-06-02" })).toMatch(/after the baseline period/));
  it("refuses a future start", () => expect(refuseBaseline({ ...ok, savingsFrom: "2026-12-01" })).toMatch(/future/));
  it("refuses a figure no pump produces", () => expect(refuseBaseline({ ...ok, kl: 100 })).toMatch(/not a figure a water pump produces/));
  it("refuses zero water", () => expect(refuseBaseline({ ...ok, kl: 0 })).toMatch(/above zero/));
});
