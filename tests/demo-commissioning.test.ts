import { describe, expect, it } from "vitest";
import { periodOfDay, periodDates, refuseDemoPeriods, suggestedPeriod } from "@/lib/demo-periods";
import { demoCircuitState, demoNextLabel, demoSteps, type DemoStepFacts } from "@/lib/demo-steps";
import { AUTO_PARTIAL_PREFIX, meterDays, missingDays, planPeriodRefresh, type StoredDemoDay } from "@/lib/demo-readings-fill";
import { acceptanceOf, changedSince, refuseAcceptance } from "@/lib/demo-acceptance";
import { demoLockState, refuseUnlock, unlockUntil } from "@/lib/demo-lock";
import { mergeMonitoringDay, monitoringStart } from "@/lib/monitoring";
import { deriveCircuitFigures } from "@/lib/circuit-demos";
import { movedRanges, planSpanAssignment, type StayRef } from "@/lib/meter-installation";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-09-26");

describe("demo periods — the user's own example", () => {
  const p = periodDates({ preFrom: "2026-08-11", preTo: "2026-08-15", postFrom: "2026-08-18", postTo: "2026-08-24" });
  it("only the chosen days belong to a period — nothing before, between or after", () => {
    expect(periodOfDay(d("2026-08-11"), p)).toBe("pre");
    expect(periodOfDay(d("2026-08-15"), p)).toBe("pre");
    expect(periodOfDay(d("2026-08-16"), p)).toBeNull();
    expect(periodOfDay(d("2026-08-18"), p)).toBe("post");
    expect(periodOfDay(d("2026-08-25"), p)).toBeNull();
    expect(periodOfDay(d("2026-08-10"), p)).toBeNull();
  });
  const dates = { meterInstalledAt: d("2026-08-10"), lightReplacementDate: d("2026-08-17") };
  it("accepts the example and refuses out-of-order periods", () => {
    expect(refuseDemoPeriods({ preFrom: "2026-08-11", preTo: "2026-08-15", postFrom: "2026-08-18", postTo: "2026-08-24" }, dates, now)).toBeNull();
    expect(refuseDemoPeriods({ preFrom: "2026-08-10", preTo: "2026-08-15", postFrom: "", postTo: "" }, dates, now)).toMatch(/day after/);
    expect(refuseDemoPeriods({ preFrom: "2026-08-11", preTo: "2026-08-17", postFrom: "", postTo: "" }, dates, now)).toMatch(/before the lights/);
    expect(refuseDemoPeriods({ preFrom: "", preTo: "", postFrom: "2026-08-17", postTo: "2026-08-20" }, dates, now)).toMatch(/day after/);
    expect(refuseDemoPeriods({ preFrom: "2026-08-11", preTo: "", postFrom: "", postTo: "" }, dates, now)).toMatch(/both a start/);
    expect(refuseDemoPeriods({ preFrom: "", preTo: "", postFrom: "2026-09-20", postTo: "2026-10-01" }, dates, now)).toMatch(/future/);
  });
  it("suggests the span between the meter and the replacement", () => {
    expect(suggestedPeriod("pre", dates, now)).toEqual({ from: "2026-08-11", to: "2026-08-16" });
    expect(suggestedPeriod("post", dates, now)).toEqual({ from: "2026-08-18", to: "2026-08-24" });
  });
});

const facts = (over: Partial<DemoStepFacts> = {}): DemoStepFacts => ({
  eligible: true,
  meterInstalledAt: null,
  loadValidated: false,
  hasInstallGatePass: false,
  prePeriodSet: false,
  preAccepted: false,
  replacementOwnerName: null,
  replacementScheduledAt: null,
  lightReplacementDate: null,
  hasCompletionGatePass: false,
  postPeriodSet: false,
  postAccepted: false,
  savingsPct: null,
  inBand: null,
  ...over,
});

describe("demo steps", () => {
  it("walks the user's order, one current step at a time", () => {
    const keys = demoSteps(facts()).map((s) => s.key);
    expect(keys).toEqual(["eligibility", "meter", "install-gate", "pre-readings", "assign-replacement", "replacement", "completion-gate", "post-readings"]);
    expect(demoSteps(facts()).find((s) => s.status === "current")?.key).toBe("meter");
    expect(demoCircuitState(facts())).toBe("eligible");
  });
  it("the replacement needs a crew AND a booked day before it can be recorded", () => {
    const f = facts({ meterInstalledAt: d("2026-08-10"), loadValidated: true, hasInstallGatePass: true, prePeriodSet: true, preAccepted: true, replacementOwnerName: "Ravi" });
    expect(demoSteps(f).find((s) => s.status === "current")?.key).toBe("assign-replacement");
    expect(demoNextLabel(f)).toBe("Schedule the replacement and assign it to a crew");
    expect(demoCircuitState(f)).toBe("awaiting_installation");
  });
  it("a finished demo maps to confirmed, or review when out of band", () => {
    const f = facts({ meterInstalledAt: d("2026-08-10"), loadValidated: true, hasInstallGatePass: true, prePeriodSet: true, preAccepted: true, replacementOwnerName: "Ravi", replacementScheduledAt: d("2026-08-17"), lightReplacementDate: d("2026-08-17"), hasCompletionGatePass: true, postPeriodSet: true, postAccepted: true, savingsPct: 66.7, inBand: true });
    expect(demoSteps(f).every((s) => s.status === "done")).toBe(true);
    expect(demoCircuitState(f)).toBe("benchmark_confirmed");
    expect(demoCircuitState({ ...f, inBand: false })).toBe("benchmark_review");
  });
  it("a load test outside tolerance keeps the meter step current", () => {
    const f = facts({ meterInstalledAt: d("2026-08-10"), loadValidated: false });
    expect(demoSteps(f).find((s) => s.status === "current")?.key).toBe("meter");
  });
});

describe("filling demo days from the meter", () => {
  const hours = Array.from({ length: 24 }, (_, h) => ({ day: d("2026-08-11"), hour: h, kWh: 0.5 }))
    .concat(Array.from({ length: 10 }, (_, h) => ({ day: d("2026-08-12"), hour: h, kWh: 0.5 })))
    .concat(Array.from({ length: 24 }, (_, h) => ({ day: d("2026-08-20"), hour: h, kWh: 0.5 })));
  it("sums a day's hours and counts hours with data", () => {
    const days = meterDays(hours, d("2026-08-11"), d("2026-08-15"));
    expect(days.map((x) => x.kWh)).toEqual([12, 5]);
    expect(days[1].hoursCovered).toBe(10);
  });
  it("creates meter days, auto-excludes a partial one, keeps typed days and refreshes their meter figure", () => {
    const existing: StoredDemoDay[] = [
      { id: "typed", date: d("2026-08-11"), phase: "pre", kWh: 11, source: "manual", meterKwh: null, hoursCovered: null, dataHours: null, excludedAt: null, excludedById: null, excludedReason: null },
      { id: "stale", date: d("2026-08-09"), phase: "pre", kWh: 9, source: "meter", meterKwh: null, hoursCovered: 24, dataHours: 24, excludedAt: null, excludedById: null, excludedReason: null },
    ];
    const plan = planPeriodRefresh({ phase: "pre", period: { from: d("2026-08-11"), to: d("2026-08-15") }, existing, meter: meterDays(hours, d("2026-08-01"), d("2026-08-30")), now });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].excludedReason).toMatch(AUTO_PARTIAL_PREFIX);
    expect(plan.update).toEqual([{ id: "typed", data: { meterKwh: 12, hoursCovered: 24, dataHours: 24 } }]);
    expect(plan.deleteIds).toEqual(["stale"]);
  });
  it("lifts its own partial-day exclusion when the day fills out, never a person's", () => {
    const full = meterDays(hours, d("2026-08-11"), d("2026-08-11"));
    const auto: StoredDemoDay = { id: "a", date: d("2026-08-11"), phase: "pre", kWh: 5, source: "meter", meterKwh: null, hoursCovered: 10, dataHours: 10, excludedAt: now, excludedById: null, excludedReason: `${AUTO_PARTIAL_PREFIX} x` };
    const person: StoredDemoDay = { ...auto, id: "p", excludedById: "u1", excludedReason: "Festival" };
    expect(planPeriodRefresh({ phase: "pre", period: { from: d("2026-08-11"), to: d("2026-08-11") }, existing: [auto], meter: full, now }).update[0].data.excludedAt).toBeNull();
    expect(planPeriodRefresh({ phase: "pre", period: { from: d("2026-08-11"), to: d("2026-08-11") }, existing: [person], meter: full, now }).update[0].data.excludedAt).toBeUndefined();
  });
  it("lists the days a person may still type", () => {
    expect(missingDays({ from: d("2026-08-11"), to: d("2026-08-13") }, [{ date: d("2026-08-12") }]).map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-08-11", "2026-08-13"]);
  });
});

describe("accepting a set", () => {
  const rows = [
    { date: d("2026-08-11"), kWh: 12, source: "meter", excludedAt: null },
    { date: d("2026-08-12"), kWh: 99, source: "meter", excludedAt: now },
    { date: d("2026-08-13"), kWh: 10, source: "manual", excludedAt: null },
  ];
  it("averages the included days only", () => {
    expect(acceptanceOf(rows)).toMatchObject({ averageKwh: 11, countedDays: 2 });
  });
  it("refuses an empty or all-excluded set", () => {
    expect(refuseAcceptance([])).toMatch(/no days/);
    expect(refuseAcceptance([{ ...rows[1] }])).toMatch(/excluded/);
  });
  it("names the days changed since acceptance", () => {
    const accepted = acceptanceOf(rows).days;
    expect(changedSince(accepted, rows)).toEqual([]);
    expect(changedSince(accepted, [rows[0], { ...rows[2], kWh: 11 }])).toEqual(["2026-08-12", "2026-08-13"]);
  });
});

describe("the lock", () => {
  it("open until shared, always open in demo mode, unlocked for 24h", () => {
    expect(demoLockState({ sharedInReport: false, unlockedUntil: null, demoMode: false, now }).editable).toBe(true);
    expect(demoLockState({ sharedInReport: true, unlockedUntil: null, demoMode: false, now }).editable).toBe(false);
    expect(demoLockState({ sharedInReport: true, unlockedUntil: null, demoMode: true, now }).editable).toBe(true);
    const until = unlockUntil(now);
    expect(until.getTime() - now.getTime()).toBe(24 * 3_600_000);
    expect(demoLockState({ sharedInReport: true, unlockedUntil: until, demoMode: false, now }).why).toBe("unlocked");
    expect(demoLockState({ sharedInReport: true, unlockedUntil: until, demoMode: false, now: new Date(until.getTime() + 1) }).editable).toBe(false);
  });
  it("only ops unlock, and only with a reason", () => {
    expect(refuseUnlock({ isOps: false, reason: "x", sharedInReport: true })).toMatch(/operations/);
    expect(refuseUnlock({ isOps: true, reason: " ", sharedInReport: true })).toMatch(/why/);
    expect(refuseUnlock({ isOps: true, reason: "Wrong period", sharedInReport: true })).toBeNull();
  });
});

describe("monitoring", () => {
  it("starts at the certificate's billing start, else the contract's term start", () => {
    expect(monitoringStart({ certificateBillingStart: d("2026-06-21"), contractTermStart: d("2026-06-01") })).toEqual(d("2026-06-21"));
    expect(monitoringStart({ certificateBillingStart: null, contractTermStart: d("2026-06-01") })).toEqual(d("2026-06-01"));
    expect(monitoringStart({ certificateBillingStart: null, contractTermStart: null })).toBeNull();
  });
  const base = { rawFileId: "f", released: false, otherKwh: null, otherOrigin: null };
  it("the meter wins a day and the upload's figure is kept as the other value", () => {
    expect(mergeMonitoringDay({ ...base, kWh: 10, origin: "monthly_upload" }, { kWh: 12, origin: "meter", rawFileId: "m" })).toEqual({ kind: "update", replaceValue: true, other: { kWh: 10, origin: "monthly_upload" }, supersede: false });
    expect(mergeMonitoringDay({ ...base, kWh: 12, origin: "meter" }, { kWh: 10, origin: "monthly_upload", rawFileId: "u" })).toEqual({ kind: "update", replaceValue: false, other: { kWh: 10, origin: "monthly_upload" }, supersede: false });
  });
  it("never touches a released day, and fills an empty one", () => {
    expect(mergeMonitoringDay({ ...base, kWh: 1, origin: "legacy", released: true }, { kWh: 2, origin: "meter", rawFileId: "m" })).toEqual({ kind: "skip", why: "released" });
    expect(mergeMonitoringDay(null, { kWh: 2, origin: "monthly_upload", rawFileId: "u" })).toEqual({ kind: "create" });
  });
});

describe("the circuit's figures from its demos", () => {
  const demo = (over: Partial<Parameters<typeof deriveCircuitFigures>[0][number]>) => ({
    id: "d1", sequence: 1, rejected: false, voided: false, combine: "rerun" as const, meteredLightCount: 100, preAverage: null, postAverage: null, ...over,
  });
  it("Urban Casa: different lights add their baselines; the benchmark is the mean of the percentages", () => {
    const f = deriveCircuitFigures([
      demo({ id: "a", sequence: 1, meteredLightCount: 100, preAverage: 24.53, postAverage: 24.53 * (1 - 0.4828) }),
      demo({ id: "b", sequence: 2, combine: "batch", meteredLightCount: 22, preAverage: 12.49, postAverage: 12.49 * (1 - 0.8516) }),
    ]);
    expect(f.baseline).toBeCloseTo(37.02, 10);
    expect(f.meteredLightCount).toBe(122);
    expect(f.benchmark.pct).toBeCloseTo(66.72, 10);
  });
  it("a rerun of the same lights averages the baseline", () => {
    const f = deriveCircuitFigures([
      demo({ id: "a", sequence: 1, preAverage: 20, postAverage: 7 }),
      demo({ id: "b", sequence: 2, combine: "rerun", preAverage: 22, postAverage: 8 }),
    ]);
    expect(f.baseline).toBe(21);
    expect(f.meteredLightCount).toBe(100);
  });
  it("a rejected demo takes no part; a pre-only demo gives a baseline and no benchmark", () => {
    const f = deriveCircuitFigures([demo({ id: "a", preAverage: 20, postAverage: 7, rejected: true }), demo({ id: "b", sequence: 2, preAverage: 18 })]);
    expect(f.baseline).toBe(18);
    expect(f.benchmark.pct).toBeNull();
  });
  it("an override is the figure in force", () => {
    const f = deriveCircuitFigures([demo({ preAverage: 20, postAverage: 7 })], { pct: 64, reason: "Agreed" });
    expect(f.benchmark.pct).toBe(64);
    expect(f.benchmark.raw).toBeCloseTo(65, 10);
  });
});

describe("assigning a span of a meter's readings", () => {
  const stay = (over: Partial<StayRef>): StayRef => ({ id: "s", meterId: "m1", circuitId: "cA", societyId: "soc", installedAt: d("2026-01-01"), removedAt: null, ...over });
  it("trims this meter's open stay and another meter's stay on the target circuit", () => {
    const plan = planSpanAssignment({
      meterId: "m1",
      circuitId: "cB",
      from: d("2026-05-01"),
      to: d("2026-06-01"),
      stays: [stay({ id: "m1-A" }), stay({ id: "m2-B", meterId: "m2", circuitId: "cB", installedAt: d("2026-04-01"), removedAt: d("2026-05-15") })],
    });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.changes.map((c) => [c.kind, c.stay.id])).toEqual([["split", "m1-A"], ["trim-end", "m2-B"]]);
    const moved = movedRanges(plan);
    expect(moved[0]).toMatchObject({ from: d("2026-05-01"), to: d("2026-06-01") });
    expect(moved[1]).toMatchObject({ from: d("2026-05-01"), to: d("2026-05-15") });
  });
  it("deletes a stay wholly inside the span, and ignores unrelated stays", () => {
    const plan = planSpanAssignment({
      meterId: "m1",
      circuitId: "cB",
      from: d("2026-01-01"),
      to: null,
      stays: [stay({ id: "in", installedAt: d("2026-02-01"), removedAt: d("2026-03-01") }), stay({ id: "other", meterId: "m9", circuitId: "cZ" })],
    });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.changes.map((c) => [c.kind, c.stay.id])).toEqual([["delete", "in"]]);
  });
  it("refuses a span that ends before it starts", () => {
    expect(planSpanAssignment({ meterId: "m1", circuitId: "c", from: d("2026-05-01"), to: d("2026-04-01"), stays: [] })).toEqual({ error: "The span has to end after it starts." });
  });
});
