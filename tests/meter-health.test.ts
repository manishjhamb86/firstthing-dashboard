import { describe, it, expect } from "vitest";
import {
  evaluateMeterHealth,
  evaluateCapacity,
  outageMessage,
  outageMinutes,
  OFFLINE_AFTER_FAILURES,
  SILENT_AFTER_MS,
  CAPACITY_HEADROOM,
} from "@/lib/meter-health";

const NOW = new Date("2026-08-28T10:00:00Z");
const base = {
  online: true,
  readOk: true,
  reportedAt: NOW,
  offlineSince: null as Date | null,
  consecutiveFailures: 0,
  now: NOW,
};

describe("evaluateMeterHealth", () => {
  it("a healthy read is reporting and clears the streak", () => {
    const h = evaluateMeterHealth({ ...base, consecutiveFailures: 1 });
    expect(h.state).toBe("reporting");
    expect(h.consecutiveFailures).toBe(0);
    expect(h.offlineSince).toBeNull();
    expect(h.shouldAlert).toBe(false);
  });

  it("does not alert on the first failure — one missed hour is not an outage", () => {
    const h = evaluateMeterHealth({ ...base, readOk: false, online: false });
    expect(h.state).toBe("offline");
    expect(h.consecutiveFailures).toBe(1);
    expect(h.shouldAlert).toBe(false);
    expect(h.offlineSince).toEqual(NOW);
  });

  it("alerts on the second consecutive failure, which is the stated rule", () => {
    const h = evaluateMeterHealth({ ...base, readOk: false, online: false, consecutiveFailures: 1 });
    expect(h.consecutiveFailures).toBe(OFFLINE_AFTER_FAILURES);
    expect(h.shouldAlert).toBe(true);
  });

  it("alerts once, not every hour it stays down", () => {
    for (const streak of [2, 3, 10, 200]) {
      const h = evaluateMeterHealth({
        ...base,
        readOk: false,
        online: false,
        consecutiveFailures: streak,
        offlineSince: new Date("2026-08-28T06:00:00Z"),
      });
      expect(h.shouldAlert).toBe(false);
    }
  });

  it("keeps the original outage start across a run of failures", () => {
    const started = new Date("2026-08-28T06:00:00Z");
    const h = evaluateMeterHealth({
      ...base,
      readOk: false,
      online: false,
      consecutiveFailures: 5,
      offlineSince: started,
    });
    // Restamping it hourly would erase "down since 06:00", the fact somebody acts on.
    expect(h.offlineSince).toEqual(started);
  });

  it("a thrown request counts as a failure even if the vendor last said online", () => {
    const h = evaluateMeterHealth({ ...base, readOk: false, online: true });
    expect(h.state).toBe("offline");
    expect(h.consecutiveFailures).toBe(1);
  });

  it("connected but silent is its own state, not reporting", () => {
    const stale = new Date(NOW.getTime() - SILENT_AFTER_MS - 1000);
    const h = evaluateMeterHealth({ ...base, reportedAt: stale });
    expect(h.state).toBe("silent");
    expect(h.consecutiveFailures).toBe(1);
  });

  it("announces recovery only for a meter that had actually alerted", () => {
    expect(evaluateMeterHealth({ ...base, consecutiveFailures: 2 }).recovered).toBe(true);
    // A single blip that never raised anything has nothing to announce.
    expect(evaluateMeterHealth({ ...base, consecutiveFailures: 1 }).recovered).toBe(false);
    expect(evaluateMeterHealth({ ...base, consecutiveFailures: 0 }).recovered).toBe(false);
  });
});

describe("evaluateCapacity", () => {
  const meterName = "Ace City 96-20W";
  // 96 lights x 20 W x 24 h = 46.08 kWh/day.
  const theoreticalDailyKwh = 46.08;

  it("passes an ordinary day", () => {
    const v = evaluateCapacity({ dayKwh: 22.4, theoreticalDailyKwh, meterName });
    expect(v.verdict).toBe("within");
  });

  it("passes a day right at the circuit's own ceiling", () => {
    expect(evaluateCapacity({ dayKwh: theoreticalDailyKwh, theoreticalDailyKwh, meterName }).verdict).toBe("within");
  });

  it("allows the stated headroom, so metering tolerance is not an alert", () => {
    const justUnder = theoreticalDailyKwh * CAPACITY_HEADROOM - 0.01;
    expect(evaluateCapacity({ dayKwh: justUnder, theoreticalDailyKwh, meterName }).verdict).toBe("within");
  });

  it("flags a physically impossible day and says what is impossible about it", () => {
    const v = evaluateCapacity({ dayKwh: 120, theoreticalDailyKwh, meterName });
    expect(v.verdict).toBe("over");
    if (v.verdict !== "over") throw new Error("unreachable");
    expect(v.message).toContain("46.08");
    expect(v.message).toContain("120.00");
    expect(v.message).toContain(meterName);
  });

  it("catches an unscaled figure, which is what a scale regression looks like", () => {
    // The bug this module family exists for: raw hundredths read as kWh.
    const v = evaluateCapacity({ dayKwh: 2240, theoreticalDailyKwh, meterName });
    expect(v.verdict).toBe("over");
  });

  it("states the gap rather than inventing a ceiling when there is no inventory", () => {
    const v = evaluateCapacity({ dayKwh: 22.4, theoreticalDailyKwh: null, meterName });
    expect(v.verdict).toBe("unknown");
    if (v.verdict !== "unknown") throw new Error("unreachable");
    expect(v.reason).toContain("load inventory");
    // Notably NOT "over" — a missing inventory must never read as an alert.
  });

  it("has no verdict when the meter reported no day counter", () => {
    expect(evaluateCapacity({ dayKwh: null, theoreticalDailyKwh, meterName }).verdict).toBe("unknown");
  });

  it("treats a zero or negative ceiling as no ceiling, never as everything being over", () => {
    expect(evaluateCapacity({ dayKwh: 1, theoreticalDailyKwh: 0, meterName }).verdict).toBe("unknown");
    expect(evaluateCapacity({ dayKwh: 1, theoreticalDailyKwh: -5, meterName }).verdict).toBe("unknown");
  });
});

describe("outage reporting", () => {
  it("names the meter, the circuit, the society and the duration", () => {
    const msg = outageMessage({
      meterName: "Ace City 96-20W",
      circuitLabel: "Basement · tube",
      societyName: "Ace City",
      state: "offline",
      minutes: 185,
    });
    expect(msg).toContain("Ace City 96-20W");
    expect(msg).toContain("Basement · tube");
    expect(msg).toContain("3h 5m");
    expect(msg).toContain("not reachable");
  });

  it("distinguishes silent from unreachable, because the fix differs", () => {
    const silent = outageMessage({
      meterName: "M",
      circuitLabel: null,
      societyName: null,
      state: "silent",
      minutes: 30,
    });
    expect(silent).toContain("connected but has stopped reporting");
  });

  it("counts whole minutes and never goes negative on a clock skew", () => {
    expect(outageMinutes(new Date("2026-08-28T09:00:00Z"), NOW)).toBe(60);
    expect(outageMinutes(new Date("2026-08-28T11:00:00Z"), NOW)).toBe(0);
    expect(outageMinutes(null, NOW)).toBeNull();
  });
});
