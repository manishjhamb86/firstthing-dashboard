import { describe, expect, it } from "vitest";
import { bandWindowReadings } from "@/lib/savings-band-alerts";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("bandWindowReadings", () => {
  it("keeps only the current IST calendar month's readings when that month has any", () => {
    const readings = [
      { date: d("2026-09-14"), tag: "anomaly in Sep" },
      { date: d("2026-09-30"), tag: "end of Sep" },
      { date: d("2026-10-01"), tag: "start of Oct" },
      { date: d("2026-10-02"), tag: "today" },
    ];
    // now = 2026-10-02T06:00:00Z is still 2-Oct in IST (+5:30) — no month-boundary ambiguity.
    const now = new Date("2026-10-02T06:00:00Z");
    const result = bandWindowReadings(readings, now, d("2026-03-01"));
    expect(result.map((r) => r.tag)).toEqual(["start of Oct", "today"]);
  });

  it("falls back to the month just elapsed when the current month has no reading yet", () => {
    const readings = [
      { date: d("2026-08-01"), tag: "Aug anomaly 1" },
      { date: d("2026-08-14"), tag: "Aug anomaly 2" },
      { date: d("2026-08-15"), tag: "Aug recovered" },
    ];
    // "Now" is 2-Sep, but nothing has been recorded for September yet.
    const now = new Date("2026-09-02T06:00:00Z");
    const result = bandWindowReadings(readings, now, d("2026-03-01"));
    expect(result.map((r) => r.tag)).toEqual(["Aug anomaly 1", "Aug anomaly 2", "Aug recovered"]);
  });

  it("never reaches before monitoring started, even mid-month", () => {
    const readings = [
      { date: d("2026-10-01"), tag: "day 1" },
      { date: d("2026-10-05"), tag: "day 5" },
    ];
    const now = new Date("2026-10-10T06:00:00Z");
    // Monitoring only started 2026-10-03 — day 1 predates it and must be excluded.
    const result = bandWindowReadings(readings, now, d("2026-10-03"));
    expect(result.map((r) => r.tag)).toEqual(["day 5"]);
  });

  it("the 2026-10-02 regression this fixes: a 14-day anomaly inside 7 good months is no longer diluted away", () => {
    // 215 good days since monitoring started 1-Mar-2026, then 14 real bad
    // days in August, then back to good — the exact Bestech Park View
    // Residency shape. The OLD code averaged all ~215 days (barely moved).
    // The fix must judge August's own month on its own.
    const monitoringStart = d("2026-03-01");
    const goodDaysMarToJul: { date: Date; kWh: number }[] = [];
    for (let m = 2; m <= 6; m++) {
      const daysInMonth = new Date(Date.UTC(2026, m + 1, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day++) {
        goodDaysMarToJul.push({ date: new Date(Date.UTC(2026, m, day)), kWh: 6.3 });
      }
    }
    const augustAnomaly = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, i + 1)), kWh: 33 }));
    const augustRecovered = Array.from({ length: 17 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, i + 15)), kWh: 6.3 }));
    const readings = [...goodDaysMarToJul, ...augustAnomaly, ...augustRecovered];

    const now = new Date("2026-08-20T06:00:00Z"); // mid-anomaly-month
    const windowed = bandWindowReadings(readings, now, monitoringStart);
    // Only August's own days — not the ~153 good days before it.
    expect(windowed).toHaveLength(31);
    expect(windowed.filter((r) => r.kWh === 33)).toHaveLength(14);

    const allTimeAvg = readings.reduce((n, r) => n + r.kWh, 0) / readings.length;
    const augustOnlyAvg = windowed.reduce((n, r) => n + r.kWh, 0) / windowed.length;
    // The whole point: the all-time average barely notices the anomaly,
    // August's own average is pulled hard by it.
    expect(allTimeAvg).toBeGreaterThan(7.5);
    expect(augustOnlyAvg).toBeGreaterThan(18);
  });
});
