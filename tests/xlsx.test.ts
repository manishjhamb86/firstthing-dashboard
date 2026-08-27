import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { columnIndex, readWorkbook, serialToIso } from "@/lib/xlsx";
import {
  cellToIso,
  findColumnPairs,
  readingSheets,
  sheetToReadingCsv,
  WORKBOOK_HEADER,
} from "@/lib/xlsx-readings";
import { matchKnownFormat } from "@/lib/reading-formats";
import { applyMapping } from "@/lib/reading-normalize";

describe("column references", () => {
  it("reads base-26 with no zero", () => {
    expect(columnIndex("A")).toBe(0);
    expect(columnIndex("Z")).toBe(25);
    // The trap: AA is 26, not 27 — there is no column 0 to carry.
    expect(columnIndex("AA")).toBe(26);
    expect(columnIndex("AB")).toBe(27);
    expect(columnIndex("BC")).toBe(54);
  });
});

describe("Excel date serials", () => {
  it("converts a serial to its date", () => {
    expect(serialToIso(45872)).toBe("2025-08-03");
    expect(serialToIso(46174)).toBe("2026-06-01");
  });

  it("refuses a serial below the 1900 leap-year bug rather than being a day out", () => {
    // Excel believes 1900 was a leap year. Serials below 61 sit on the wrong
    // side of that phantom day, and a reading dated a day early is worse
    // than one refused — no meter export reaches back to 1900 anyway.
    expect(serialToIso(59)).toBeNull();
    expect(serialToIso(-1)).toBeNull();
    expect(serialToIso(NaN)).toBeNull();
  });

  it("a date cell may already be a date", () => {
    expect(cellToIso("2026-01-31")).toBe("2026-01-31");
    expect(cellToIso("2026-01-31T05:00:00Z")).toBe("2026-01-31");
    expect(cellToIso("")).toBeNull();
    expect(cellToIso("Before Installation")).toBeNull();
  });

  it("keeps the day when a serial carries a time of day", () => {
    expect(cellToIso("45872.75")).toBe("2025-08-03");
  });
});

describe("finding the reading blocks in a sheet", () => {
  it("reads several side-by-side blocks, spacer columns and all", () => {
    // Ace City's own layout: three (date, value) blocks with a blank between.
    const header = ["data", "consumption/KWh", "", "data", "consumption/KWh", "", "data", "consumption/KWh"];
    expect(findColumnPairs(header)).toEqual([
      { dateColumn: 0, valueColumn: 1 },
      { dateColumn: 3, valueColumn: 4 },
      { dateColumn: 6, valueColumn: 7 },
    ]);
  });

  it("does not pair a date with a column that is not a reading", () => {
    // The analysis sheet: a second Date heading whose neighbour is "Units".
    const header = ["Date", "Consumption/KWh", "Date", "", "Average", "Variance / Savings"];
    expect(findColumnPairs(header)).toEqual([{ dateColumn: 0, valueColumn: 1 }]);
  });

  it("finds nothing in a sheet that holds no readings", () => {
    expect(findColumnPairs(["Total Lights", "Light Wattage Each"])).toEqual([]);
  });
});

describe("a sheet becomes the text the pipeline already reads", () => {
  const sheet = {
    name: "Readings",
    rows: [
      ["data", "consumption/KWh", "", "data", "consumption/KWh"],
      ["45872", "2.06", "", "45873", "1.10"],
      ["45872", "1.94", "", "45873", "0.90"],
      ["", "", "", "Total", "x"],
    ],
  };
  const chosen = readingSheets([sheet])[0];

  it("stacks every block into one series, a day at a time", () => {
    expect(sheetToReadingCsv(sheet, chosen).split("\n")).toEqual([
      WORKBOOK_HEADER,
      "2025-08-03,2.06",
      "2025-08-03,1.94",
      "2025-08-04,1.1",
      "2025-08-04,0.9",
    ]);
  });

  it("and the result is a format the reading pipeline recognises", () => {
    const match = matchKnownFormat(sheetToReadingCsv(sheet, chosen));
    expect(match?.vendor).toBe("sonoff_workbook");
    expect(match?.mapping.timeColumn).toBeNull();
  });

  it("the two days sum from their own rows, not across the blocks", () => {
    const csv = sheetToReadingCsv(sheet, chosen);
    const r = applyMapping(csv, matchKnownFormat(csv)!.mapping, "2025-08");
    expect(r.days.map((d) => [d.date.toISOString().slice(0, 10), d.kWh])).toEqual([
      ["2025-08-03", 4.0],
      ["2025-08-04", 2.0],
    ]);
  });

  it("a trailing label row is skipped, not counted as a reading", () => {
    expect(sheetToReadingCsv(sheet, chosen)).not.toContain("Total");
  });

  it("a date in two blocks is one day's readings, not two", () => {
    // The blocks are separate exports of the same meter and they overlap.
    // Summing both would double that day — invisible, and straight into a
    // baseline a society is billed against.
    const overlap = {
      name: "Overlap",
      rows: [
        ["data", "consumption/KWh", "", "data", "consumption/KWh"],
        ["45872", "2.00", "", "45872", "2.00"],
        ["45872", "1.00", "", "45872", "1.00"],
      ],
    };
    const pick = readingSheets([overlap])[0];
    const csv = sheetToReadingCsv(overlap, pick);
    const r = applyMapping(csv, matchKnownFormat(csv)!.mapping, "2025-08");
    expect(r.days).toHaveLength(1);
    expect(r.days[0].kWh).toBe(3.0);
  });

  it("and the fuller block wins, so a part-day copy cannot truncate the day", () => {
    const partial = {
      name: "Partial",
      rows: [
        ["data", "consumption/KWh", "", "data", "consumption/KWh"],
        ["45872", "2.00", "", "45872", "9.99"],
        ["45872", "1.00", "", "", ""],
        ["45872", "0.50", "", "", ""],
      ],
    };
    const pick = readingSheets([partial])[0];
    const csv = sheetToReadingCsv(partial, pick);
    const r = applyMapping(csv, matchKnownFormat(csv)!.mapping, "2025-08");
    expect(r.days[0].kWh).toBe(3.5);
    expect(r.days[0].intervalCount).toBe(3);
  });
});

// Against the real workbook when it is present — proof, not a fixture that
// agrees with itself. The samples live outside the repo (they are a
// customer's documents), so this suite is skipped wherever they are not,
// and it looks in both layouts the folder has had.
const SAMPLES = join(homedir(), "Downloads", "Document Samples", "Ace City");
const REAL = [
  join(SAMPLES, "Live Meter Reading", "Ace City Meter Reading.xlsx"),
  join(SAMPLES, "Ace City Meter Reading.xlsx"),
].find(existsSync);

// The factory of a skipped describe still RUNS — only its tests are skipped —
// so reading the file here rather than in the body would throw during
// collection on any machine without the samples, which is a failing suite,
// not a skipped one.
describe.runIf(REAL)("Ace City's own workbook", () => {
  let wb: ReturnType<typeof readWorkbook>;
  beforeAll(() => { wb = readWorkbook(readFileSync(REAL!)); });

  it("reads all five sheets", () => {
    expect(wb.map((s) => s.name)).toEqual([
      "Basement",
      "BasementContinueReporting",
      "BasementReadings",
      "LiftLobby",
      "LiftLobbyReadings",
    ]);
  });

  it("both circuits' readings sheets are offered", () => {
    const names = readingSheets(wb).map((s) => s.name);
    expect(names).toContain("BasementReadings");
    expect(names).toContain("LiftLobbyReadings");
  });

  it("the basement sheet's three overlapping blocks become one hourly series", () => {
    const chosen = readingSheets(wb).find((s) => s.name === "BasementReadings")!;
    expect(chosen.pairs).toHaveLength(3);
    const csv = sheetToReadingCsv(wb.find((s) => s.name === "BasementReadings")!, chosen);
    const rows = csv.split("\n").slice(1);
    const days = new Set(rows.map((r) => r.split(",")[0]));
    expect(days.size).toBe(291);
    // 291 days at 24 hours is 6,984 readings; the raw blocks hold 10,368
    // because two of them repeat 128 dates and a third repeats 15.
    expect(rows.length).toBeLessThan(7100);
  });

  it("and the days it produces agree with what the report says they were", () => {
    const chosen = readingSheets(wb).find((s) => s.name === "BasementReadings")!;
    const csv = sheetToReadingCsv(wb.find((s) => s.name === "BasementReadings")!, chosen);
    const aug = applyMapping(csv, matchKnownFormat(csv)!.mapping, "2025-08");
    const byDate = new Map(aug.days.map((d) => [d.date.toISOString().slice(0, 10), d]));
    // The report's own "Before Installation" table: 48.84, 48.79, 48.35…
    expect(byDate.get("2025-08-03")!.kWh).toBeCloseTo(48.84, 2);
    expect(byDate.get("2025-08-04")!.kWh).toBeCloseTo(48.79, 2);
    expect(byDate.get("2025-08-05")!.kWh).toBeCloseTo(48.35, 2);
    expect(byDate.get("2025-08-03")!.intervalCount).toBe(24);
    // And after the lights went in, ~16 — the report says 16.36.
    expect(byDate.get("2025-08-20")!.kWh).toBeCloseTo(17.32, 2);
  });
});
