import { describe, expect, it } from "vitest";
import { daySavingsPct, judgePostInstallDay, restartFromDate } from "@/lib/commissioning-anomaly";

describe("CON-20 as the post-install day rule", () => {
  const baseline = 24.38;

  it("accepts a day squarely inside the 60-80% band", () => {
    // 7.5 kWh against 24.38 is 69.2% savings — a good post-retrofit day.
    const v = judgePostInstallDay(7.5, baseline);
    expect(v.anomaly).toBe(false);
    expect(v.savingsPct).toBeCloseTo(69.24, 2);
  });

  it("does NOT flag ordinary day-to-day jitter", () => {
    // The reported false positive: these four days differ from each other by
    // up to ~5%, which the old ±5% self-consistency rule flagged — yet every
    // one of them is a perfectly plausible post-retrofit day.
    for (const kwh of [7.92, 7.92, 7.9, 8.0]) {
      expect(judgePostInstallDay(kwh, 30).anomaly).toBe(false);
    }
    // And because an anomaly restarts CON-19's 5-day count, those false
    // flags meant a healthy circuit could never finish its window.
  });

  it("flags a day that underperforms the band", () => {
    const v = judgePostInstallDay(12, baseline); // 50.8% savings
    expect(v.anomaly).toBe(true);
    expect(v).toHaveProperty("detail", expect.stringMatching(/below CON-20's 60-80% band/));
  });

  it("flags a day that is implausibly good", () => {
    const v = judgePostInstallDay(2, baseline); // 91.8% savings
    expect(v.anomaly).toBe(true);
    expect(v).toHaveProperty("detail", expect.stringMatching(/above CON-20's 60-80% band/));
  });

  it("subsumes the data-quality cases the ±5% rule used to catch", () => {
    // A dead meter reads as total savings...
    expect(judgePostInstallDay(0, baseline).anomaly).toBe(true);
    // ...and a 10x transcription error as negative savings.
    expect(judgePostInstallDay(79.2, baseline).anomaly).toBe(true);
    expect(daySavingsPct(79.2, baseline)).toBeLessThan(0);
  });

  it("treats both band edges as inside — the band is inclusive", () => {
    const at60 = baseline * 0.4; // exactly 60% savings
    const at80 = baseline * 0.2; // exactly 80% savings
    expect(judgePostInstallDay(at60, baseline).anomaly).toBe(false);
    expect(judgePostInstallDay(at80, baseline).anomaly).toBe(false);
  });

  it("says so rather than guessing when there is no usable baseline", () => {
    const v = judgePostInstallDay(7.5, 0);
    expect(v.anomaly).toBe(true);
    expect(v).toHaveProperty("detail", expect.stringMatching(/no usable pre-install baseline/));
  });

  it("does not round the savings percentage it reports", () => {
    // This figure becomes a benchmark that prices a contract (INV-02).
    expect(daySavingsPct(7.5, 24.38)).toBe(((24.38 - 7.5) / 24.38) * 100);
  });
});

describe("CON-19's restart, with days recorded ahead of today", () => {
  const now = new Date("2026-08-14T09:30:00.000Z");

  it("restarts tomorrow when every recorded day is in the past", () => {
    expect(restartFromDate(now, new Date("2026-08-10T00:00:00.000Z"))).toEqual(
      new Date("2026-08-15T00:00:00.000Z"),
    );
  });

  it("restarts tomorrow when there are no readings at all", () => {
    expect(restartFromDate(now, null)).toEqual(new Date("2026-08-15T00:00:00.000Z"));
  });

  it("restarts AFTER the last recorded day when days are dated ahead of today", () => {
    // The reported bug: an anomaly dated 2026-08-24 stayed inside a window
    // restarted to 2026-08-15, so "Record fix & restart" appeared to do
    // nothing at all — the anomaly was still open on the very next render.
    expect(restartFromDate(now, new Date("2026-08-24T00:00:00.000Z"))).toEqual(
      new Date("2026-08-25T00:00:00.000Z"),
    );
  });

  it("excludes a reading dated today", () => {
    expect(restartFromDate(now, new Date("2026-08-14T00:00:00.000Z"))).toEqual(
      new Date("2026-08-15T00:00:00.000Z"),
    );
  });

  it("crosses a month boundary without drifting", () => {
    expect(restartFromDate(new Date("2026-08-31T23:00:00.000Z"), null)).toEqual(
      new Date("2026-09-01T00:00:00.000Z"),
    );
  });

  it("always lands on a UTC midnight", () => {
    const r = restartFromDate(now, new Date("2026-09-02T17:45:00.000Z"));
    expect(r.getUTCHours()).toBe(0);
    expect(r.getUTCMinutes()).toBe(0);
    expect(r).toEqual(new Date("2026-09-03T00:00:00.000Z"));
  });
});
