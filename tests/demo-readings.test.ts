import { describe, expect, it } from "vitest";
import {
  buildSonoffCsv,
  demoAnchorKwh,
  draftDemoDays,
  snapToHourly,
  DEMO_MAX_DAYS,
  HOURS_PER_DAY,
} from "@/lib/demo-readings";
import {
  circuitReadingWindow,
  windowLengthDays,
  DEMO_WINDOW_HORIZON_DAYS,
} from "@/lib/circuit-load";
import { matchKnownFormat } from "@/lib/reading-formats";
import { applyMappingAllDays } from "@/lib/reading-normalize";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("circuitReadingWindow — one composition, shown and enforced", () => {
  const now = d("2026-08-20");

  it("anchors a pre-install window to the day after the meter went in", () => {
    const w = circuitReadingWindow({
      meterInstalledAt: d("2026-08-10"),
      lightReplacementDate: null,
      benchmarkSavingsPct: null,
      lastStoredDate: null,
      demo: false,
      now,
    })!;
    expect(w.kind).toBe("pre_install");
    expect(iso(w.from)).toBe("2026-08-11");
    expect(iso(w.to)).toBe("2026-08-19"); // yesterday, never today
  });

  it("anchors a post-install window to the day after the LIGHTS were replaced", () => {
    // Not to the meter-install date: days before the replacement would be
    // committed as post-install readings and drag the savings benchmark
    // toward the old fittings' consumption.
    const w = circuitReadingWindow({
      meterInstalledAt: d("2026-08-10"),
      lightReplacementDate: d("2026-08-19"),
      benchmarkSavingsPct: null,
      lastStoredDate: d("2026-08-18"),
      demo: false,
      now,
    })!;
    expect(w.kind).toBe("post_install");
    expect(iso(w.from)).toBe("2026-08-20");
    // from > to: the replacement was yesterday, so nothing can qualify yet.
    expect(w.empty).toBe(true);
    expect(windowLengthDays(w)).toBe(0);
  });

  it("starts a monitoring window one day before the last stored reading", () => {
    const w = circuitReadingWindow({
      meterInstalledAt: d("2026-06-01"),
      lightReplacementDate: d("2026-06-20"),
      benchmarkSavingsPct: 68,
      lastStoredDate: d("2026-08-13"),
      demo: false,
      now,
    })!;
    expect(w.kind).toBe("monitoring");
    expect(iso(w.from)).toBe("2026-08-12");
  });

  it("demo mode lifts the END past today, and never the start", () => {
    const plain = circuitReadingWindow({
      meterInstalledAt: d("2026-08-10"),
      lightReplacementDate: d("2026-08-19"),
      benchmarkSavingsPct: null,
      lastStoredDate: null,
      demo: false,
      now,
    })!;
    const demo = circuitReadingWindow({
      meterInstalledAt: d("2026-08-10"),
      lightReplacementDate: d("2026-08-19"),
      benchmarkSavingsPct: null,
      lastStoredDate: null,
      demo: true,
      now,
    })!;
    expect(iso(demo.from)).toBe(iso(plain.from)); // sequence is not what demo relaxes
    expect(demo.to.getTime()).toBeGreaterThan(plain.to.getTime());
    expect(iso(demo.to)).toBe(iso(new Date(now.getTime() + (DEMO_WINDOW_HORIZON_DAYS - 1) * 86_400_000)));
    expect(demo.empty).toBe(false);
  });

  it("has no window at all before a meter install date exists", () => {
    expect(
      circuitReadingWindow({
        meterInstalledAt: null,
        lightReplacementDate: null,
        benchmarkSavingsPct: null,
        lastStoredDate: null,
        demo: true,
        now,
      }),
    ).toBeNull();
  });
});

describe("demoAnchorKwh", () => {
  it("uses the theoretical figure pre-install — the thing the window checks against", () => {
    const a = demoAnchorKwh({ kind: "pre_install", theoretical: 34.56, baseline: null, savingsPct: 68 });
    expect(a).toEqual({ kWh: 34.56 });
  });

  it("refuses pre-install with no load inventory rather than inventing an anchor", () => {
    const a = demoAnchorKwh({ kind: "pre_install", theoretical: null, baseline: 30, savingsPct: 68 });
    expect("error" in a && a.error).toContain("load inventory");
  });

  it("discounts the baseline by the target savings post-install", () => {
    const a = demoAnchorKwh({ kind: "post_install", theoretical: null, baseline: 100, savingsPct: 68 });
    // Deliberately unrounded, like every other figure in this codebase that
    // can reach a billed number (INV-02).
    expect("kWh" in a && a.kWh).toBeCloseTo(32, 10);
  });

  it("refuses post-install with no baseline", () => {
    const a = demoAnchorKwh({ kind: "post_install", theoretical: 50, baseline: null, savingsPct: 68 });
    expect("error" in a && a.error).toContain("baseline");
  });
});

describe("draftDemoDays", () => {
  const window = { from: d("2026-08-11"), to: d("2026-09-30") };

  it("starts at the window's first day when nothing is stored", () => {
    const days = draftDemoDays({ window, lastStoredInWindow: null, days: 3, anchorKwh: 24 });
    expect(days.map((x) => iso(x.date))).toEqual(["2026-08-11", "2026-08-12", "2026-08-13"]);
  });

  it("resumes after the last stored day, so a second click extends the series", () => {
    const days = draftDemoDays({ window, lastStoredInWindow: d("2026-08-13"), days: 2, anchorKwh: 24 });
    expect(days.map((x) => iso(x.date))).toEqual(["2026-08-14", "2026-08-15"]);
  });

  it("never runs past the end of the window", () => {
    const days = draftDemoDays({
      window: { from: d("2026-08-11"), to: d("2026-08-13") },
      lastStoredInWindow: null,
      days: 10,
      anchorKwh: 24,
    });
    expect(days).toHaveLength(3);
  });

  it("caps the count, so a 366-day demo window cannot produce 366 rows in one click", () => {
    const days = draftDemoDays({
      window: { from: d("2026-01-01"), to: d("2026-12-31") },
      lastStoredInWindow: null,
      days: 500,
      anchorKwh: 24,
    });
    expect(days).toHaveLength(DEMO_MAX_DAYS);
  });

  it("is deterministic — the same request twice gives the same numbers", () => {
    const a = draftDemoDays({ window, lastStoredInWindow: null, days: 7, anchorKwh: 34.56 });
    const b = draftDemoDays({ window, lastStoredInWindow: null, days: 7, anchorKwh: 34.56 });
    expect(a).toEqual(b);
    // and not all identical — a flat series hides nothing but tests nothing
    expect(new Set(a.map((x) => x.kWh)).size).toBeGreaterThan(1);
  });

  it("keeps every generated pre-install day inside ±5% of the anchor", () => {
    // The default walk-through should come out clean; forcing a band is an
    // edit the operator makes deliberately.
    const days = draftDemoDays({ window, lastStoredInWindow: null, days: 10, anchorKwh: 34.56 });
    for (const day of days) {
      expect(Math.abs((day.kWh - 34.56) / 34.56) * 100).toBeLessThan(5);
    }
  });
});

describe("buildSonoffCsv", () => {
  it("round-trips: the parser gives back exactly the days that were reviewed", () => {
    // The whole point of generating a real export rather than writing rows
    // directly — if this drifts, the number on screen is not the number
    // committed.
    const days = draftDemoDays({
      window: { from: d("2026-08-11"), to: d("2026-08-20") },
      lastStoredInWindow: null,
      days: 5,
      anchorKwh: 34.56,
    });
    const csv = buildSonoffCsv(days);

    const match = matchKnownFormat(csv);
    expect(match?.vendor).toBe("sonoff");
    expect(match?.expectedIntervalsPerDay).toBe(HOURS_PER_DAY);

    const parsed = applyMappingAllDays(csv, match!.mapping);
    expect(parsed.rowsUnparseable).toBe(0);
    expect(parsed.days).toHaveLength(5);
    parsed.days.forEach((p, i) => {
      expect(iso(p.date)).toBe(iso(days[i].date));
      expect(p.kWh).toBeCloseTo(days[i].kWh, 6);
      // A full day, so the review never files it as a partial.
      expect(p.intervalCount).toBe(HOURS_PER_DAY);
    });
  });

  it("carries the BOM and the vendor's own misspelt header", () => {
    const csv = buildSonoffCsv([{ date: d("2026-08-11"), kWh: 24 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\n")[0]).toContain("data,time,consumption/KWh");
    expect(csv).toContain("2026-08-11,23:00-24:00,1.0000");
  });
});

describe("snapToHourly", () => {
  it("gives a total 24 equal hourly cells can express", () => {
    const snapped = snapToHourly(34.5612345);
    expect((snapped / HOURS_PER_DAY).toFixed(4)).toBe(String(snapped / HOURS_PER_DAY));
  });
});
