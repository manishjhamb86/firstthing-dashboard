import { describe, expect, it } from "vitest";
import { buildHourlyProfiles, classifyDay, classifyHour, MIN_HOUR_SAMPLE } from "@/lib/hourly-anomaly";

describe("buildHourlyProfiles", () => {
  it("needs enough samples before trusting an hour", () => {
    const few = Array.from({ length: MIN_HOUR_SAMPLE - 1 }, () => ({ hour: 3, kWh: 10 }));
    expect(buildHourlyProfiles(few).has(3)).toBe(false);
    const enough = Array.from({ length: MIN_HOUR_SAMPLE }, () => ({ hour: 3, kWh: 10 }));
    expect(buildHourlyProfiles(enough).has(3)).toBe(true);
  });

  it("a steady hour gets a tight median and a small MAD", () => {
    const samples = Array.from({ length: 20 }, () => ({ hour: 14, kWh: 5 }));
    const p = buildHourlyProfiles(samples).get(14)!;
    expect(p.median).toBe(5);
    expect(p.mad).toBe(0);
    expect(p.sampleSize).toBe(20);
  });
});

describe("classifyHour", () => {
  it("no profile at all -> unclassified, never flagged on thin evidence", () => {
    expect(classifyHour(50, undefined)).toBe("unclassified");
  });

  it("a reading near the learned median reads normal", () => {
    const profile = { hour: 14, median: 20, mad: 1, sampleSize: 30 };
    expect(classifyHour(20, profile)).toBe("normal");
    expect(classifyHour(20.5, profile)).toBe("normal");
  });

  it("a moderate deviation reads suspect, a wild one reads anomaly", () => {
    // effectiveMad floors to median*0.08 = 1.6 here (above the raw mad of 1).
    const profile = { hour: 14, median: 20, mad: 1, sampleSize: 30 };
    expect(classifyHour(27, profile)).toBe("suspect"); // z ≈ 2.95
    expect(classifyHour(35, profile)).toBe("anomaly"); // z ≈ 6.32
  });

  it("a perfectly steady hour (mad=0) does not flag an ordinary small wobble, but does flag a real jump", () => {
    const profile = { hour: 3, median: 0, mad: 0, sampleSize: 30 }; // always off at 3am
    expect(classifyHour(0, profile)).toBe("normal");
    expect(classifyHour(0.01, profile)).toBe("normal"); // inside the floor
    expect(classifyHour(5, profile)).toBe("anomaly"); // genuinely came on when it never does
  });
});

describe("classifyDay", () => {
  it("counts each hour into exactly one bucket, and nulls stay unclassified", () => {
    const profiles = buildHourlyProfiles(
      Array.from({ length: 15 }, () => [
        { hour: 0, kWh: 10 },
        { hour: 1, kWh: 10 },
      ]).flat(),
    );
    const kwhByHour: (number | null)[] = new Array(24).fill(null);
    kwhByHour[0] = 10; // normal
    kwhByHour[1] = 200; // wild -> anomaly
    const summary = classifyDay(kwhByHour, profiles);
    expect(summary.hours[0].class).toBe("normal");
    expect(summary.hours[1].class).toBe("anomaly");
    expect(summary.hours[2].class).toBe("unclassified"); // null, never sampled
    expect(summary.normalCount).toBe(1);
    expect(summary.anomalyCount).toBe(1);
    expect(summary.suspectCount).toBe(0);
  });
});
