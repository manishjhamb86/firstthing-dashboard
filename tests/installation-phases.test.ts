import { describe, expect, it } from "vitest";
import { loggedThrough, phaseFigures, phaseOfDay, refusePhaseCountCorrection, refusePhaseSignoff, type PhaseDay, type PhaseRecord } from "@/lib/installation-phases";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
// ATS One Hamlet's shape: days 1–9 by 13-Nov (998 lights), day 10 on 23-Nov (151).
const counts = [200, 100, 100, 98, 200, 100, 100, 50, 50, 151];
const dates = ["02", "03", "04", "05", "09", "10", "11", "12", "13", "23"];
const days: PhaseDay[] = counts.map((c, i) => ({ day: i + 1, installedCount: c, workedOn: d(`2026-11-${dates[i]}`) }));
const phase1: PhaseRecord = { number: 1, throughDay: 9, signedAt: d("2026-11-14"), lightsOverride: 850, isFinal: false };
const base = { days, today: d("2026-11-26"), lightsOverride: null };

describe("installation phases", () => {
  it("a day after a closed phase falls into the next one", () => {
    expect(phaseOfDay(9, [phase1])).toBe(1);
    expect(phaseOfDay(10, [phase1])).toBe(2);
    expect(phaseOfDay(3, [])).toBe(1);
  });

  it("counts from the logged days, with the override in force", () => {
    expect(loggedThrough(days, 9)).toBe(998);
    const final: PhaseRecord = { number: 2, throughDay: 10, signedAt: d("2026-11-23"), lightsOverride: null, isFinal: true };
    const f = phaseFigures(days, [final, phase1]);
    expect(f.map((p) => [p.derived, p.cumulative, p.added])).toEqual([[998, 850, 850], [1149, 1149, 299]]);
  });

  it("signs off the full installation on the last logged day", () => {
    expect(refusePhaseSignoff({ ...base, phases: [phase1], throughDay: 10, isFinal: true, signedOn: d("2026-11-23") })).toBeNull();
  });

  it("refuses a day already in a phase, an unlogged day, and finishing with days after", () => {
    expect(refusePhaseSignoff({ ...base, phases: [{ ...phase1, lightsOverride: null }], throughDay: 9, isFinal: false, signedOn: d("2026-11-23") })).toMatch(/already in phase 1/);
    const withUnlogged = [...days, { day: 11, installedCount: null, workedOn: null }];
    expect(refusePhaseSignoff({ ...base, days: withUnlogged, phases: [phase1], throughDay: 11, isFinal: false, signedOn: d("2026-11-23") })).toMatch(/Day 11 has no work logged/);
    expect(refusePhaseSignoff({ ...base, days: withUnlogged, phases: [phase1], throughDay: 10, isFinal: true, signedOn: d("2026-11-23") })).toMatch(/planned day comes after day 10/);
  });

  it("refuses a sign-off before the work, before the previous phase, or in the future", () => {
    expect(refusePhaseSignoff({ ...base, phases: [phase1], throughDay: 10, isFinal: true, signedOn: d("2026-11-20") })).toMatch(/before day 10's work/);
    expect(refusePhaseSignoff({ ...base, phases: [], throughDay: 9, isFinal: false, signedOn: d("2026-11-30") })).toMatch(/future/);
  });

  it("phase 5 must be the last, and nothing follows a finished installation", () => {
    const four = [1, 2, 3, 4].map((n) => ({ number: n, throughDay: n, signedAt: d("2026-11-14"), lightsOverride: null, isFinal: false }));
    expect(refusePhaseSignoff({ ...base, phases: four, throughDay: 5, isFinal: false, signedOn: d("2026-11-14") })).toMatch(/Phase 5 is the last/);
    expect(refusePhaseSignoff({ ...base, phases: [{ ...phase1, isFinal: true }], throughDay: 10, isFinal: true, signedOn: d("2026-11-23") })).toMatch(/already marked finished/);
  });

  it("a phase may close on the same day when the previous phase billed fewer lights than its days hold", () => {
    // Prateek Laurel: 2,000 of the lights logged through day 7 signed off.
    const p: PhaseRecord = { number: 1, throughDay: 9, signedAt: d("2026-11-14"), lightsOverride: 850, isFinal: false };
    const short = days.slice(0, 9);
    expect(refusePhaseSignoff({ ...base, days: short, phases: [p], throughDay: 9, isFinal: true, signedOn: d("2026-11-20") })).toBeNull();
    const full = { ...p, lightsOverride: null };
    expect(refusePhaseSignoff({ ...base, days: short, phases: [full], throughDay: 9, isFinal: true, signedOn: d("2026-11-20") })).toMatch(/already in phase 1/);
  });

  it("an override must be above the previous phase", () => {
    expect(refusePhaseSignoff({ ...base, phases: [phase1], throughDay: 10, isFinal: true, signedOn: d("2026-11-23"), lightsOverride: 800 })).toMatch(/more than phase 1's 850/);
  });

  it("a phase's count can be corrected while the phases stay in order", () => {
    const final: PhaseRecord = { number: 2, throughDay: 10, signedAt: d("2026-11-23"), lightsOverride: null, isFinal: true };
    expect(refusePhaseCountCorrection({ days, phases: [phase1, final], number: 1, lightsOverride: 1000 })).toBeNull();
    expect(refusePhaseCountCorrection({ days, phases: [phase1, final], number: 1, lightsOverride: null })).toBeNull();
    expect(refusePhaseCountCorrection({ days, phases: [phase1, final], number: 1, lightsOverride: 1200 })).toMatch(/fewer lights than phase 2's 1149/);
    expect(refusePhaseCountCorrection({ days, phases: [phase1, final], number: 2, lightsOverride: 800 })).toMatch(/more lights than phase 1's 850/);
  });
});
