import { describe, expect, it } from "vitest";
import {
  theoreticalDailyKwh,
  varianceAgainstTheoretical,
  savingsPct,
  savingsBand,
  baselineAverage,
  classifyDay,
  deriveUploadKind,
  extractionWindow,
  buildReviewRows,
  actionableRows,
  changedStoredRows,
  periodSavingsSummary,
  addDays,
  windowIsEmpty,
  firstQualifyingDay,
} from "@/lib/circuit-load";
import { liveMonitoringBlocker } from "@/lib/live-monitoring";
import { matchKnownFormat, stripBom } from "@/lib/reading-formats";
import { applyMappingAllDays, parseTimestamp } from "@/lib/reading-normalize";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("theoreticalDailyKwh", () => {
  it("computes the user's own worked example: 20 × 20W × 24h = 9.6 kWh/day", () => {
    expect(theoreticalDailyKwh([{ count: 20, wattage: 20, hoursPerDay: 24 }])).toBe(9.6);
  });

  it("sums mixed line items, including a 12h and a custom-hours device", () => {
    // 10×20W×24h = 4.8 · 5×5W×12h = 0.3 · 13×18W×2h = 0.468 · 1×60W(fan)×12h = 0.72
    const total = theoreticalDailyKwh([
      { count: 10, wattage: 20, hoursPerDay: 24 },
      { count: 5, wattage: 5, hoursPerDay: 12 },
      { count: 13, wattage: 18, hoursPerDay: 2 },
      { count: 1, wattage: 60, hoursPerDay: 12 },
    ]);
    expect(total).toBeCloseTo(6.288, 10);
  });

  it("an empty inventory is zero, which downstream treats as nothing-to-compare", () => {
    expect(theoreticalDailyKwh([])).toBe(0);
  });
});

describe("varianceAgainstTheoretical — ±5 flag, ±10 warn, never blocking", () => {
  const theoretical = 10;
  it.each([
    [10.0, "ok"],
    [10.5, "ok"], // exactly +5% is inside the band
    [10.51, "flag"],
    [9.5, "ok"], // exactly −5%
    [9.49, "flag"],
    [11.0, "flag"], // exactly +10% still flag, not warn
    [11.01, "warn"],
    [8.99, "warn"],
  ])("%s kWh against 10 → %s", (kWh, band) => {
    expect(varianceAgainstTheoretical(kWh as number, theoretical).band).toBe(band);
  });

  it("a zero/absent theoretical is itself a warning, not a divide-by-zero", () => {
    expect(varianceAgainstTheoretical(5, 0)).toEqual({ pct: null, band: "warn" });
  });

  it("reports the signed percentage", () => {
    expect(varianceAgainstTheoretical(11, 10).pct).toBeCloseTo(10, 10);
    expect(varianceAgainstTheoretical(9, 10).pct).toBeCloseTo(-10, 10);
  });
});

describe("savings bands — the user's exact boundaries", () => {
  it.each([
    [90, "suspect"], // above CON-20's 80% — a dead meter reads as 100% savings
    [80.01, "suspect"],
    [80, "green"], // 80 itself is still in CON-20's valid band
    [65, "green"],
    [64.99, "cyan"],
    [60, "cyan"],
    [59.99, "yellow"],
    [58, "yellow"],
    [57.99, "orange"],
    [55, "orange"],
    [54.99, "red"],
    [0, "red"],
    [-20, "red"], // consuming MORE than baseline is as red as it gets
  ])("%s%% → %s", (pct, band) => {
    expect(savingsBand(pct as number)).toBe(band);
  });

  it("savingsPct matches the Ace City report's own arithmetic: 48.70 → 18.63 = 61.74%", () => {
    const pct = savingsPct(48.7, 18.63);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(61.7454, 3);
    expect(savingsBand(pct!)).toBe("cyan");
  });

  it("a zero baseline yields null, never Infinity", () => {
    expect(savingsPct(0, 5)).toBeNull();
  });
});

describe("baselineAverage — excluded days never count", () => {
  it("averages only non-excluded days", () => {
    const avg = baselineAverage([
      { date: d("2026-05-25"), kWh: 30, excluded: false },
      { date: d("2026-05-26"), kWh: 20, excluded: false },
      { date: d("2026-05-27"), kWh: 999, excluded: true }, // user deselected it
    ]);
    expect(avg).toBe(25);
  });

  it("all-excluded is null — no baseline, not a zero baseline", () => {
    expect(baselineAverage([{ date: d("2026-05-25"), kWh: 30, excluded: true }])).toBeNull();
  });
});

describe("classifyDay — the circuit's own dates decide, never the operator", () => {
  const meter = d("2026-05-21");
  it("the meter-install day itself is excluded — extraction starts the day after", () => {
    expect(classifyDay(d("2026-05-21"), meter, null)).toBe("before_meter");
    expect(classifyDay(d("2026-05-22"), meter, null)).toBe("pre_install");
    expect(classifyDay(d("2026-05-20"), meter, null)).toBe("before_meter");
  });

  it("the replacement day is its own phase — installation noise, never imported", () => {
    const replace = d("2026-06-09");
    expect(classifyDay(d("2026-06-08"), meter, replace)).toBe("pre_install");
    expect(classifyDay(d("2026-06-09"), meter, replace)).toBe("replacement_day");
    expect(classifyDay(d("2026-06-10"), meter, replace)).toBe("post_install");
  });
});

describe("deriveUploadKind", () => {
  it("no replacement yet → pre-install", () => {
    expect(deriveUploadKind({ lightReplacementDate: null, benchmarkSavingsPct: null })).toBe("pre_install");
  });
  it("replaced but no benchmark → post-install", () => {
    expect(
      deriveUploadKind({
        lightReplacementDate: d("2026-06-09"),
        preInstallBaseline: 48.7,
        benchmarkSavingsPct: null,
      }),
    ).toBe("post_install");
  });
  it("replaced but the baseline was never computed → still pre-install", () => {
    // A circuit backfilled from its demo report has both dates before it has
    // a single reading. Reading the replacement date as "the baseline is
    // settled" left it permanently unable to upload the days that would
    // settle it.
    expect(
      deriveUploadKind({
        lightReplacementDate: d("2026-06-09"),
        preInstallBaseline: null,
        benchmarkSavingsPct: null,
      }),
    ).toBe("pre_install");
  });
  it("benchmark confirmed → monitoring", () => {
    expect(
      deriveUploadKind({
        lightReplacementDate: d("2026-06-09"),
        preInstallBaseline: 48.7,
        benchmarkSavingsPct: 62,
      }),
    ).toBe("monitoring");
  });
});

describe("extractionWindow", () => {
  const meter = d("2026-05-21");
  const today = d("2026-08-17");

  it("a pre-install window stops at the replacement when that day is known", () => {
    // Otherwise a backfill's pre-install upload sweeps in every day AFTER
    // the lights changed and averages the new fittings into the old
    // fittings' baseline.
    expect(
      extractionWindow({
        kind: "pre_install",
        meterInstalledAt: meter,
        lightReplacementDate: d("2026-06-09"),
        lastStoredDate: null,
        today,
      }),
    ).toEqual({ from: d("2026-05-22"), to: d("2026-06-08") });
  });

  it("a PRE-install upload re-reads from the day after meter install through yesterday", () => {
    const w = extractionWindow({ kind: "pre_install", meterInstalledAt: meter, lastStoredDate: d("2026-06-20"), today });
    expect(w.from).toEqual(d("2026-05-22"));
    expect(w.to).toEqual(d("2026-08-16"));
  });

  // This previously asserted the post window ALSO started from meter install,
  // which is the bug it was meant to guard: days from before the replacement
  // fell inside the post window and would have been committed as post-install
  // readings, dragging the savings benchmark toward the old fittings.
  it("a POST-install upload starts the day after the LIGHTS were replaced", () => {
    const w = extractionWindow({
      kind: "post_install",
      meterInstalledAt: meter,
      lightReplacementDate: d("2026-08-10"),
      lastStoredDate: d("2026-06-20"),
      today,
    });
    expect(w.from).toEqual(d("2026-08-11"));
    expect(w.to).toEqual(d("2026-08-16"));
  });

  it("the reported case: replaced today, so the post window has not opened", () => {
    // Meter in on the 12th, lights replaced on the 19th, today the 19th.
    // Anchored to the meter this offered 2026-08-13 -> 2026-08-18, six days
    // that all predate the replacement.
    const w = extractionWindow({
      kind: "post_install",
      meterInstalledAt: d("2026-08-12"),
      lightReplacementDate: d("2026-08-19"),
      lastStoredDate: null,
      today: d("2026-08-19"),
    });
    expect(w.from).toEqual(d("2026-08-20"));
    expect(windowIsEmpty(w)).toBe(true);
  });

  it("no day before the replacement can fall inside a post-install window", () => {
    const replacement = d("2026-08-10");
    const w = extractionWindow({
      kind: "post_install",
      meterInstalledAt: meter,
      lightReplacementDate: replacement,
      lastStoredDate: null,
      today,
    });
    expect(w.from.getTime()).toBeGreaterThan(replacement.getTime());
  });

  it("monitoring starts one day BEFORE the last stored reading — the user's 13 Nov → 12 Nov rule", () => {
    const w = extractionWindow({ kind: "monitoring", meterInstalledAt: meter, lastStoredDate: d("2026-11-13"), today: d("2026-12-05") });
    expect(w.from).toEqual(d("2026-11-12"));
    expect(w.to).toEqual(d("2026-12-04"));
  });

  it("today's own rows are never in the window", () => {
    const w = extractionWindow({ kind: "pre_install", meterInstalledAt: meter, lastStoredDate: null, today });
    expect(w.to.getTime()).toBeLessThan(today.getTime());
  });
});

describe("buildReviewRows — dispositions", () => {
  const meter = d("2026-11-01");
  const base = {
    expectedIntervals: 24,
    meterInstalledAt: meter,
    lightReplacementDate: d("2026-11-05"),
    theoretical: 10,
    baseline: 30,
  };

  it("monitoring: verification day kept, overlap day superseded, new days new", () => {
    const rows = buildReviewRows({
      ...base,
      kind: "monitoring",
      window: { from: d("2026-11-12"), to: d("2026-11-15") },
      lastStoredDate: d("2026-11-13"),
      stored: [
        { date: d("2026-11-12"), kWh: 12, excluded: false, released: false },
        { date: d("2026-11-13"), kWh: 4.2, excluded: false, released: false }, // cut mid-day at last upload
      ],
      parsedDays: [
        { date: d("2026-11-12"), kWh: 12, intervalCount: 24 }, // unchanged
        { date: d("2026-11-13"), kWh: 11.8, intervalCount: 24 }, // fuller value
        { date: d("2026-11-14"), kWh: 12.1, intervalCount: 24 },
        { date: d("2026-11-15"), kWh: 11.9, intervalCount: 24 },
      ],
    });
    expect(rows.map((r) => r.disposition)).toEqual(["stored_match", "supersede", "new", "new"]);
    expect(actionableRows(rows)).toHaveLength(3);
  });

  it("post-install: a changed stored pre-install day warns and keeps the stored value", () => {
    const rows = buildReviewRows({
      ...base,
      kind: "post_install",
      window: { from: d("2026-11-02"), to: d("2026-11-08") },
      lastStoredDate: d("2026-11-04"),
      stored: [
        { date: d("2026-11-02"), kWh: 10.2, excluded: false, released: false },
        { date: d("2026-11-03"), kWh: 10.4, excluded: false, released: false },
      ],
      parsedDays: [
        { date: d("2026-11-02"), kWh: 10.2, intervalCount: 24 },
        { date: d("2026-11-03"), kWh: 9.9, intervalCount: 24 }, // sheet disagrees with store
        { date: d("2026-11-05"), kWh: 6.0, intervalCount: 24 }, // replacement day
        { date: d("2026-11-06"), kWh: 11.0, intervalCount: 24 },
      ],
    });
    const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    expect(byDate.get("2026-11-02")!.disposition).toBe("stored_match");
    expect(byDate.get("2026-11-03")!.disposition).toBe("stored_changed");
    expect(byDate.get("2026-11-03")!.storedKwh).toBe(10.4);
    expect(byDate.get("2026-11-05")!.disposition).toBe("out_of_window"); // replacement day
    expect(byDate.get("2026-11-06")!.disposition).toBe("new");
    expect(changedStoredRows(rows)).toHaveLength(1);
  });

  it("a day consumed by a released calculation is untouchable (INV-03)", () => {
    const rows = buildReviewRows({
      ...base,
      kind: "monitoring",
      window: { from: d("2026-11-06"), to: d("2026-11-08") },
      lastStoredDate: d("2026-11-07"),
      stored: [{ date: d("2026-11-07"), kWh: 12, excluded: false, released: true }],
      parsedDays: [{ date: d("2026-11-07"), kWh: 13, intervalCount: 24 }],
    });
    expect(rows[0].disposition).toBe("released");
    expect(actionableRows(rows)).toHaveLength(0);
  });

  // This test previously asserted that a partial day STILL got a variance
  // band ("the % is still shown"), which is what put a red "-72.2% outside
  // +/-10%" against a real 13-of-24-hour upload. A part-day total judged
  // against a whole-day theoretical is guaranteed to look catastrophic —
  // the day simply is not over. It gets no verdict now.
  it("a partial day gets no verdict — a part day cannot be judged against a whole-day figure", () => {
    const rows = buildReviewRows({
      ...base,
      kind: "pre_install",
      lightReplacementDate: null,
      window: { from: d("2026-11-02"), to: d("2026-11-08") },
      lastStoredDate: null,
      stored: [],
      parsedDays: [{ date: d("2026-11-04"), kWh: 3.1, intervalCount: 13 }],
    });
    expect(rows[0].partial).toBe(true);
    expect(rows[0].phase).toBe("pre_install");
    expect(rows[0].varianceBand).toBeNull();
    expect(rows[0].variancePct).toBeNull();
    // A complete day of the same shape is still judged normally.
    const full = buildReviewRows({
      ...base,
      kind: "pre_install",
      lightReplacementDate: null,
      window: { from: d("2026-11-02"), to: d("2026-11-08") },
      lastStoredDate: null,
      stored: [],
      parsedDays: [{ date: d("2026-11-04"), kWh: 3.1, intervalCount: 24 }],
    });
    expect(full[0].partial).toBe(false);
    expect(full[0].varianceBand).toBe("warn");
  });

  it("an empty window is reported as empty, not as a backwards date range", () => {
    // The reported case: meter installed yesterday, so "the day after
    // installation" is today and today never counts — from > to.
    const w = extractionWindow({
      kind: "pre_install",
      meterInstalledAt: d("2026-08-17"),
      lastStoredDate: null,
      today: d("2026-08-18"),
    });
    expect(windowIsEmpty(w)).toBe(true);
    expect(iso(firstQualifyingDay(w))).toBe("2026-08-18");

    const open = extractionWindow({
      kind: "pre_install",
      meterInstalledAt: d("2026-08-10"),
      lastStoredDate: null,
      today: d("2026-08-18"),
    });
    expect(windowIsEmpty(open)).toBe(false);
  });

  it("pre-install rows carry variance, post rows carry savings — never both", () => {
    const rows = buildReviewRows({
      ...base,
      kind: "post_install",
      window: { from: d("2026-11-02"), to: d("2026-11-08") },
      lastStoredDate: null,
      stored: [],
      parsedDays: [
        { date: d("2026-11-03"), kWh: 10.4, intervalCount: 24 }, // pre
        { date: d("2026-11-07"), kWh: 10.5, intervalCount: 24 }, // post: 65% savings vs 30
      ],
    });
    const pre = rows[0];
    const post = rows[1];
    expect(pre.variancePct).not.toBeNull();
    expect(pre.savingsPct).toBeNull();
    expect(post.variancePct).toBeNull();
    expect(post.savingsPct).toBeCloseTo(65, 10);
    expect(post.savingsBand).toBe("green");
  });
});

describe("periodSavingsSummary", () => {
  it("warns once below 60%, and excluded days never count", () => {
    const s = periodSavingsSummary(30, [
      { kWh: 13 }, // 56.7%
      { kWh: 12 }, // 60%
      { kWh: 900, excluded: true },
    ]);
    expect(s.averageKwh).toBeCloseTo(12.5, 10);
    expect(s.savingsPct).toBeCloseTo(58.3333, 3);
    expect(s.band).toBe("yellow");
    expect(s.warn).toBe(true);
  });

  it("no baseline → figures null, no fabricated zero", () => {
    const s = periodSavingsSummary(null, [{ kWh: 10 }]);
    expect(s.savingsPct).toBeNull();
    expect(s.warn).toBe(false);
  });
});

describe("SONOFF format signature", () => {
  const sonoffText = "﻿data,time,consumption/KWh\n2026-05-22,13:00-14:00,0.52\n2026-05-22,23:00-24:00,0.1\n";

  it("matches the real header through the BOM, case-insensitively", () => {
    const m = matchKnownFormat(sonoffText);
    expect(m).not.toBeNull();
    expect(m!.vendor).toBe("sonoff");
    expect(m!.expectedIntervalsPerDay).toBe(24);
    expect(m!.mapping.valueKind).toBe("interval");
  });

  it("does not match an unrelated header", () => {
    expect(matchKnownFormat("Timestamp;Meter;Energy (Wh)\n01/07/2026 00:00;M1;937.5")).toBeNull();
  });

  it("stripBom is a no-op on clean text", () => {
    expect(stripBom("data,time")).toBe("data,time");
  });

  it("parses the matched file end to end: range time cell, hour 24, BOM", () => {
    const m = matchKnownFormat(sonoffText)!;
    const r = applyMappingAllDays(sonoffText, m.mapping);
    expect(r.rowsAttempted).toBe(2);
    expect(r.rowsUnparseable).toBe(0);
    expect(r.days).toHaveLength(1);
    // Both hourly rows land on 2026-05-22 — the 23:00-24:00 slot stays in its
    // own day rather than rolling into the 23rd.
    expect(r.days[0].date).toEqual(d("2026-05-22"));
    expect(r.days[0].kWh).toBeCloseTo(0.62, 10);
    expect(r.days[0].intervalCount).toBe(2);
  });

  it("pins the range-cell behaviour: '13:00-14:00' reads as the interval's start", () => {
    const at = parseTimestamp("2026-05-22", "13:00-14:00", "ISO");
    expect(at).not.toBeNull();
    expect(at!.getUTCHours()).toBe(13);
  });
});

describe("addDays is UTC-safe", () => {
  it("crosses a month boundary without local-timezone drift", () => {
    expect(addDays(d("2026-11-01"), -1)).toEqual(d("2026-10-31"));
    expect(addDays(d("2026-02-28"), 1)).toEqual(d("2026-03-01")); // 2026 is not a leap year
    expect(addDays(d("2028-02-28"), 1)).toEqual(d("2028-02-29")); // 2028 is
  });
});

describe("live monitoring is gated on the installation, not the benchmark", () => {
  // The circuit page offered "Upload this month's readings" the moment a
  // demo benchmark confirmed — before the offer, agreement and installation
  // existed. A monthly figure is what a society is billed on, and billing
  // starts the day after the completion certificate (CON-22).

  it("says what is missing while the benchmark is not confirmed", () => {
    expect(
      liveMonitoringBlocker({ benchmarkSavingsPct: null, installationCertificateSigned: true }),
    ).toContain("demo benchmark is confirmed");
  });

  it("still refuses on a confirmed benchmark with no signed-off installation", () => {
    const why = liveMonitoringBlocker({
      benchmarkSavingsPct: 68,
      installationCertificateSigned: false,
    });
    expect(why).toContain("full installation");
    expect(why).toContain("CON-22");
  });

  it("is live only when both hold", () => {
    expect(
      liveMonitoringBlocker({ benchmarkSavingsPct: 68, installationCertificateSigned: true }),
    ).toBeNull();
  });
})
