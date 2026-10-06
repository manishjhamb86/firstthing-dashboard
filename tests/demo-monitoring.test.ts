import { describe, it, expect } from "vitest";
import {
  demoMonitoringPeriod,
  judgePreInstallDay,
  judgePostInstallDay,
  readingDueDate,
  DEMO_DAILY_SAVINGS_MIN_PCT,
  DEMO_DAILY_SAVINGS_MAX_PCT,
} from "@/lib/demo-monitoring";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("demoMonitoringPeriod — raw demo fields, never Circuit.state", () => {
  const base = { voidedAt: null, rejected: false, meterInstalledAt: null as Date | null, lightReplacementDate: null as Date | null };

  it("no meter yet is not a monitoring period at all", () => {
    expect(demoMonitoringPeriod(base, false, false)).toBe("none");
  });

  it("meter in, lights not replaced — pre, regardless of pre-readings acceptance", () => {
    const d = { ...base, meterInstalledAt: day("2026-08-01") };
    expect(demoMonitoringPeriod(d, false, false)).toBe("pre");
  });

  it("replaced, post not accepted, not shared — post", () => {
    const d = { ...base, meterInstalledAt: day("2026-08-01"), lightReplacementDate: day("2026-08-10") };
    expect(demoMonitoringPeriod(d, false, false)).toBe("post");
  });

  it("post accepted ends the window — the report has generated", () => {
    const d = { ...base, meterInstalledAt: day("2026-08-01"), lightReplacementDate: day("2026-08-10") };
    expect(demoMonitoringPeriod(d, true, false)).toBe("none");
  });

  it("sitting in a shared report ends the window even if post was never formally accepted", () => {
    const d = { ...base, meterInstalledAt: day("2026-08-01"), lightReplacementDate: day("2026-08-10") };
    expect(demoMonitoringPeriod(d, false, true)).toBe("none");
  });

  it("a voided or rejected demo is never watched", () => {
    const d = { ...base, meterInstalledAt: day("2026-08-01") };
    expect(demoMonitoringPeriod({ ...d, voidedAt: day("2026-08-05") }, false, false)).toBe("none");
    expect(demoMonitoringPeriod({ ...d, rejected: true }, false, false)).toBe("none");
  });
});

describe("judgePreInstallDay — CON-17's own ±10%, watched daily", () => {
  it("inside ±10% is not anomalous", () => {
    expect(judgePreInstallDay(10.9, 10).anomalous).toBe(false); // +9%
    expect(judgePreInstallDay(9.1, 10).anomalous).toBe(false); // -9%
  });

  it("beyond ±10% is anomalous, and the message states the direction", () => {
    const over = judgePreInstallDay(11.5, 10); // +15%
    expect(over.anomalous).toBe(true);
    expect(over.message).toMatch(/\+15\.0%/);
    const under = judgePreInstallDay(8, 10); // -20%
    expect(under.anomalous).toBe(true);
    expect(under.message).toMatch(/-20\.0%/);
  });

  it("no expected load at all is itself anomalous, not silently skipped", () => {
    expect(judgePreInstallDay(5, 0).anomalous).toBe(true);
  });
});

describe("judgePostInstallDay — a single day, never the demo's final accepted average", () => {
  it("inside 60-70% is not anomalous", () => {
    expect(judgePostInstallDay(35, 100).anomalous).toBe(false); // 65%
  });

  it("below 60% is anomalous — under-delivering, or a replacement that didn't take", () => {
    const v = judgePostInstallDay(45, 100); // 55%
    expect(v.anomalous).toBe(true);
    expect(v.pct).toBeCloseTo(55, 9);
  });

  it("above 70% is anomalous — this is the CON-20 band's own territory, watched earlier", () => {
    // 75% sits comfortably inside the demo's eventual 60-80% acceptance band
    // (circuit-demos.ts BAND_MAX_PCT) but still outside this daily watch's
    // tighter 60-70% — the two numbers answer different questions on purpose.
    const v = judgePostInstallDay(25, 100); // 75%
    expect(v.anomalous).toBe(true);
    expect(v.pct).toBe(75);
    expect(DEMO_DAILY_SAVINGS_MAX_PCT).toBeLessThan(80); // never silently drifts to match BAND_MAX_PCT
    expect(DEMO_DAILY_SAVINGS_MIN_PCT).toBe(60); // the one number this band DOES share with CON-20's
  });

  it("no baseline yet reads as unknown, never as anomalous", () => {
    const v = judgePostInstallDay(10, 0);
    expect(v.anomalous).toBe(false);
    expect(v.pct).toBeNull();
  });
});

describe("readingDueDate — yesterday, and only inside a chosen period", () => {
  const nowOn = (s: string) => day(s);

  it("no period chosen yet means nothing is due", () => {
    expect(readingDueDate("pre", { preFrom: null, preTo: null, postFrom: null, postTo: null }, nowOn("2026-08-05"))).toBeNull();
  });

  it("yesterday inside the chosen pre period is due", () => {
    const demo = { preFrom: day("2026-08-01"), preTo: day("2026-08-07"), postFrom: null, postTo: null };
    const due = readingDueDate("pre", demo, nowOn("2026-08-05"));
    expect(due?.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("yesterday outside the chosen period is not due — before it starts", () => {
    const demo = { preFrom: day("2026-08-10"), preTo: day("2026-08-15"), postFrom: null, postTo: null };
    expect(readingDueDate("pre", demo, nowOn("2026-08-05"))).toBeNull();
  });

  it("yesterday outside the chosen period is not due — after it ends", () => {
    const demo = { preFrom: day("2026-08-01"), preTo: day("2026-08-04"), postFrom: null, postTo: null };
    // "now" is the 10th, so yesterday (the 9th) is well past the period's own end
    expect(readingDueDate("pre", demo, nowOn("2026-08-10"))).toBeNull();
  });

  it("the boundary day itself counts — inclusive both ends", () => {
    const demo = { preFrom: day("2026-08-01"), preTo: day("2026-08-04"), postFrom: null, postTo: null };
    // "now" is the 5th, so yesterday is exactly the period's last day
    expect(readingDueDate("pre", demo, nowOn("2026-08-05"))?.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("post period reads postFrom/postTo, not preFrom/preTo", () => {
    const demo = { preFrom: day("2026-08-01"), preTo: day("2026-08-04"), postFrom: day("2026-08-20"), postTo: day("2026-08-26") };
    expect(readingDueDate("post", demo, nowOn("2026-08-05"))).toBeNull(); // pre's own range, irrelevant to post
    expect(readingDueDate("post", demo, nowOn("2026-08-21"))?.toISOString().slice(0, 10)).toBe("2026-08-20");
  });

  it("period 'none' is never due, whatever dates are set", () => {
    const demo = { preFrom: day("2026-08-01"), preTo: day("2026-08-07"), postFrom: null, postTo: null };
    expect(readingDueDate("none", demo, nowOn("2026-08-05"))).toBeNull();
  });
});
