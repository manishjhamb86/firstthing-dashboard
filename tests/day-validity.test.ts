import { describe, expect, it } from "vitest";
import { classifyDayHours, inferOperatingHours, MIN_SAMPLE_DAYS } from "@/lib/day-validity";

const TODAY = new Date("2026-10-05T00:00:00Z");

function daysBack(n: number): string {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("inferOperatingHours", () => {
  it("falls back to all 24 hours below the minimum sample — never penalises a new circuit", () => {
    const samples = Array.from({ length: MIN_SAMPLE_DAYS - 1 }, (_, i) => ({ day: daysBack(i), hour: 10, kWh: 1 }));
    const r = inferOperatingHours(samples, TODAY);
    expect(r.confident).toBe(false);
    expect(r.hours.size).toBe(24);
  });

  it("learns a 12-hour circuit's real on-hours from its own history", () => {
    const onHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]; // dusk-to-dawn
    const samples: { day: string; hour: number; kWh: number }[] = [];
    for (let d = 0; d < 30; d++) {
      const day = daysBack(d);
      for (let h = 0; h < 24; h++) samples.push({ day, hour: h, kWh: onHours.includes(h) ? 1 : 0 });
    }
    const r = inferOperatingHours(samples, TODAY);
    expect(r.confident).toBe(true);
    expect([...r.hours].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 18, 19, 20, 21, 22, 23]);
  });

  it("only looks at the rolling window, not all-time history", () => {
    // 20 days on hour 10, well outside the 90-day window, then 15 recent
    // days on hour 14 — the mask should reflect only the RECENT pattern.
    const samples: { day: string; hour: number; kWh: number }[] = [];
    for (let d = 100; d < 120; d++) samples.push({ day: daysBack(d), hour: 10, kWh: 1 });
    for (let d = 0; d < 15; d++) samples.push({ day: daysBack(d), hour: 14, kWh: 1 });
    const r = inferOperatingHours(samples, TODAY);
    expect(r.confident).toBe(true);
    expect(r.hours.has(14)).toBe(true);
    expect(r.hours.has(10)).toBe(false);
  });

  it("falls back to all 24 hours when every sampled hour reads zero — a dead circuit's whole history, not evidence of zero expected hours", () => {
    const samples: { day: string; hour: number; kWh: number }[] = [];
    for (let d = 0; d < 30; d++) for (let h = 0; h < 24; h++) samples.push({ day: daysBack(d), hour: h, kWh: 0 });
    const r = inferOperatingHours(samples, TODAY);
    expect(r.confident).toBe(false);
    expect(r.hours.size).toBe(24);
  });
});

describe("classifyDayHours", () => {
  const allDay = { hours: new Set(Array.from({ length: 24 }, (_, i) => i)), confident: true };
  const twelveHour = { hours: new Set([18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]), confident: true };
  const notConfident = { hours: new Set<number>(), confident: false };

  it("23 of 24 expected hours present is partial, not complete — the user's own example", () => {
    const present = Array.from({ length: 24 }, (_, h) => h !== 7); // hour 7 missing
    const r = classifyDayHours({ hourlyPresent: present, intervalCount: null }, allDay);
    expect(r).toEqual({ dayClass: "partial", hoursExpected: 24, hoursPresent: 23 });
  });

  it("a 12-hour circuit's own off-hours reading zero is NOT a gap — complete with all 12 on-hours present", () => {
    const present = Array.from({ length: 24 }, (_, h) => twelveHour.hours.has(h)); // exactly the on-hours present
    const r = classifyDayHours({ hourlyPresent: present, intervalCount: null }, twelveHour);
    expect(r).toEqual({ dayClass: "complete", hoursExpected: 12, hoursPresent: 12 });
  });

  it("a 12-hour circuit missing ONE of its real on-hours is partial", () => {
    const present = Array.from({ length: 24 }, (_, h) => twelveHour.hours.has(h) && h !== 20);
    const r = classifyDayHours({ hourlyPresent: present, intervalCount: null }, twelveHour);
    expect(r.dayClass).toBe("partial");
    expect(r.hoursExpected).toBe(12);
    expect(r.hoursPresent).toBe(11);
  });

  it("not confident falls back to all 24 hours expected even with a mask present", () => {
    const present = Array.from({ length: 24 }, (_, h) => h !== 3);
    const r = classifyDayHours({ hourlyPresent: present, intervalCount: null }, notConfident);
    expect(r).toEqual({ dayClass: "partial", hoursExpected: 24, hoursPresent: 23 });
  });

  it("a monthly-upload row with no hourly breakdown is judged by COUNT against the learned total", () => {
    const r = classifyDayHours({ hourlyPresent: null, intervalCount: 12 }, twelveHour);
    expect(r).toEqual({ dayClass: "complete", hoursExpected: 12, hoursPresent: 12 });
    const partial = classifyDayHours({ hourlyPresent: null, intervalCount: 11 }, twelveHour);
    expect(partial.dayClass).toBe("partial");
  });

  it("no interval count at all on a non-hourly row reads as 0 present, not a thrown error", () => {
    const r = classifyDayHours({ hourlyPresent: null, intervalCount: null }, allDay);
    expect(r).toEqual({ dayClass: "partial", hoursExpected: 24, hoursPresent: 0 });
  });
});
