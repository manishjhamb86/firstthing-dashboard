import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { matchKnownFormat } from "@/lib/reading-formats";
import { hourlyPoints } from "@/lib/reading-normalize";
import {
  matchMeter,
  scoreCandidate,
  dayKeyOf,
  MIN_DISTINCTIVE_HOURS,
  type Candidate,
  type StoredHour,
} from "@/lib/meter-csv-match";

const SAMPLES = join(homedir(), "Downloads");

function findSample(pattern: RegExp, dir = SAMPLES, depth = 0): string | undefined {
  if (depth > 3 || !existsSync(dir)) return undefined;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const hit = entries.find((e) => e.isFile() && pattern.test(e.name));
  if (hit) return join(dir, hit.name);
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const found = findSample(pattern, join(dir, e.name), depth + 1);
    if (found) return found;
  }
  return undefined;
}

type Point = { day: Date; hour: number; kWh: number };

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function points(spec: [string, number, number][]): Point[] {
  return spec.map(([d, h, k]) => ({ day: day(d), hour: h, kWh: k }));
}
function stored(spec: [string, number, number][]): StoredHour[] {
  return spec.map(([d, h, k]) => ({ dayKey: d, hour: h, kWh: k }));
}
function candidate(meterId: string, s: StoredHour[]): Candidate {
  return { meterId, meterName: meterId, circuitLabel: null, societyName: null, stored: s };
}

// Twelve hours that actually carry a reading — the only kind that identifies
// anything.
const REAL_HOURS: [string, number, number][] = [
  ["2026-06-01", 18, 0.67], ["2026-06-01", 19, 0.64], ["2026-06-01", 20, 0.68],
  ["2026-06-01", 21, 0.27], ["2026-06-01", 22, 0.71], ["2026-06-01", 23, 0.55],
  ["2026-06-02", 18, 0.66], ["2026-06-02", 19, 0.63], ["2026-06-02", 20, 0.69],
  ["2026-06-02", 21, 0.29], ["2026-06-02", 22, 0.72], ["2026-06-02", 23, 0.54],
];

describe("matchMeter", () => {
  it("proposes the meter whose stored hours agree", () => {
    const out = matchMeter(points(REAL_HOURS), [
      candidate("right", stored(REAL_HOURS)),
      candidate("wrong", stored(REAL_HOURS.map(([d, h, k]) => [d, h, k + 0.4] as [string, number, number]))),
    ]);
    expect(out.kind).toBe("confident");
    if (out.kind !== "confident") throw new Error("unreachable");
    expect(out.best.meterId).toBe("right");
    expect(out.best.distinctive).toBe(12);
    expect(out.best.conflicting).toBe(0);
  });

  it("refuses to match on zeros alone — the trap the real export set", () => {
    // 92% of the real file was exactly zero. Every idle meter agrees with
    // every other idle meter, perfectly, forever.
    const zeros: [string, number, number][] = Array.from({ length: 200 }, (_, i) => [
      "2026-01-05",
      i % 24,
      0,
    ]);
    const out = matchMeter(points(zeros), [
      candidate("a", stored(zeros)),
      candidate("b", stored(zeros)),
    ]);
    expect(out.kind).toBe("no_evidence");
    if (out.kind !== "no_evidence") throw new Error("unreachable");
    expect(out.reason).toContain("zero");
    // 200 agreeing hours, and still no proposal — because none of them mean anything.
    expect(out.scores[0].agreeing).toBe(200);
    expect(out.scores[0].distinctive).toBe(0);
  });

  it("says plainly that a meter's first import has nothing to compare", () => {
    const out = matchMeter(points(REAL_HOURS), [candidate("fresh", [])]);
    expect(out.kind).toBe("no_evidence");
    if (out.kind !== "no_evidence") throw new Error("unreachable");
    expect(out.reason).toContain("first import");
  });

  it("rules out a meter that disagrees, however much else lines up", () => {
    const mostlyRight = stored(REAL_HOURS);
    // One hour in six is wrong: past the conflict tolerance.
    mostlyRight[0].kWh = 5.5;
    mostlyRight[1].kWh = 5.5;
    const out = matchMeter(points(REAL_HOURS), [candidate("suspect", mostlyRight)]);
    expect(out.kind).toBe("no_evidence");
  });

  it("does not propose a meter that leads on matches but is excluded by conflicts", () => {
    // The bug this guards: sorting by distinctive puts "leader" first, and it
    // is precisely the meter the evidence rules out.
    const leader = stored([...REAL_HOURS, ["2026-06-03", 18, 9.9], ["2026-06-03", 19, 9.9]]);
    for (let i = 0; i < 6; i++) leader[i].kWh = 3.3; // 6 conflicts out of 12
    const clean = stored(REAL_HOURS.slice(0, 10));
    const out = matchMeter(
      points([...REAL_HOURS, ["2026-06-03", 18, 9.9], ["2026-06-03", 19, 9.9]]),
      [candidate("leader", leader), candidate("clean", clean)],
    );
    expect(out.kind).toBe("confident");
    if (out.kind !== "confident") throw new Error("unreachable");
    expect(out.best.meterId).toBe("clean");
  });

  it("asks rather than guessing when two meters both agree", () => {
    const out = matchMeter(points(REAL_HOURS), [
      candidate("a", stored(REAL_HOURS)),
      candidate("b", stored(REAL_HOURS)),
    ]);
    expect(out.kind).toBe("ambiguous");
    if (out.kind !== "ambiguous") throw new Error("unreachable");
    expect(out.tied).toHaveLength(2);
  });

  it("needs the stated number of hours that carry a reading", () => {
    const few = REAL_HOURS.slice(0, MIN_DISTINCTIVE_HOURS - 1);
    expect(matchMeter(points(few), [candidate("a", stored(few))]).kind).toBe("no_evidence");
    const enough = REAL_HOURS.slice(0, MIN_DISTINCTIVE_HOURS);
    expect(matchMeter(points(enough), [candidate("a", stored(enough))]).kind).toBe("confident");
  });

  it("counts only the hours both sides actually hold", () => {
    const s = scoreCandidate(
      new Map([["2026-06-01#18", 0.67]]),
      candidate("a", stored([["2026-06-01", 18, 0.67], ["2026-06-09", 3, 1.5]])),
    );
    expect(s.overlapping).toBe(1);
    expect(s.agreeing).toBe(1);
  });

  it("keys a day by its calendar date, not by an instant", () => {
    expect(dayKeyOf(day("2025-12-07"))).toBe("2025-12-07");
  });
});

const REAL_CSV = findSample(/^History_.*\.csv$/i);

describe.runIf(REAL_CSV)("the real SONOFF export", () => {
  let text: string;
  beforeAll(() => {
    text = readFileSync(REAL_CSV!, "utf8");
  });

  it("is recognised without an AI call, and parses every row", () => {
    const m = matchKnownFormat(text);
    expect(m?.vendor).toBe("sonoff");
    const h = hourlyPoints(text, m!.mapping);
    expect(h.rowsUnparseable).toBe(0);
    expect(h.points.length).toBe(h.rowsAttempted);
  });

  it("is overwhelmingly zeros, which is why matching cannot rest on agreement alone", () => {
    const h = hourlyPoints(text, matchKnownFormat(text)!.mapping);
    const zeros = h.points.filter((p) => p.kWh === 0).length;
    expect(zeros / h.points.length).toBeGreaterThan(0.9);
  });

  it("identifies its own meter, and only on the hours that carry a reading", () => {
    const h = hourlyPoints(text, matchKnownFormat(text)!.mapping);
    const asStored: StoredHour[] = h.points.map((p) => ({
      dayKey: dayKeyOf(p.day),
      hour: p.hour,
      kWh: p.kWh,
    }));
    // The same file, against itself and against a meter holding only its
    // zero hours — the decoy that a naive match would tie with.
    const decoy = asStored.filter((s) => s.kWh === 0);
    const out = matchMeter(h.points, [candidate("itself", asStored), candidate("decoy", decoy)]);
    expect(out.kind).toBe("confident");
    if (out.kind !== "confident") throw new Error("unreachable");
    expect(out.best.meterId).toBe("itself");
    expect(out.best.distinctive).toBeGreaterThanOrEqual(MIN_DISTINCTIVE_HOURS);
  });
});
