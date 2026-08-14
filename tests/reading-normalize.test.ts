import { describe, expect, it } from "vitest";
import {
  applyMapping,
  daysInPeriod,
  parseRate,
  parseTimestamp,
  refuseMapping,
  splitDelimitedLine,
  type ReadingMapping,
} from "@/lib/reading-normalize";

const HOURLY: ReadingMapping = {
  delimiter: ",",
  headerRowIndex: 0,
  dateColumn: 0,
  timeColumn: 1,
  valueColumn: 2,
  valueUnit: "kWh",
  dateFormat: "ISO",
  granularity: "sub_daily",
  valueKind: "interval",
  footerRowsToIgnore: 0,
};

function hourlyCsv(day: string, values: number[]) {
  const rows = values.map((v, h) => `${day},${String(h).padStart(2, "0")}:00,${v}`);
  return ["date,time,consumption", ...rows].join("\n");
}

describe("splitDelimitedLine", () => {
  it("keeps a delimiter that sits inside a quoted field", () => {
    expect(splitDelimitedLine('2026-07-01,"Tower A, Basement",41.2', ",")).toEqual([
      "2026-07-01",
      "Tower A, Basement",
      "41.2",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitDelimitedLine('a,"he said ""hi""",b', ",")).toEqual(["a", 'he said "hi"', "b"]);
  });
});

describe("parseTimestamp", () => {
  it("reads the sample vendor's date,time pair", () => {
    const d = parseTimestamp("2026-07-01", "13:00", "ISO");
    expect(d?.toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("distinguishes DD/MM from MM/DD by the format given, not by guessing", () => {
    expect(parseTimestamp("03/07/2026", null, "DD/MM/YYYY")?.toISOString()).toBe(
      "2026-07-03T00:00:00.000Z",
    );
    expect(parseTimestamp("03/07/2026", null, "MM/DD/YYYY")?.toISOString()).toBe(
      "2026-03-07T00:00:00.000Z",
    );
  });

  it("rejects a date that does not exist rather than rolling it into the next month", () => {
    // Date.UTC(2026, 1, 31) silently becomes 3 March. A meter file claiming
    // 31 February is a file we do not understand, not a March reading.
    expect(parseTimestamp("2026-02-31", null, "ISO")).toBeNull();
  });

  it("keeps a 24:00 end-of-day stamp inside the day it closes", () => {
    const d = parseTimestamp("2026-07-01", "24:00", "ISO");
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("reads a time carried inline in a non-ISO date cell", () => {
    // "01/07/2026 00:00" in one column is a real vendor shape. Reading the
    // cell as a date alone made every row of such a file unparseable — found
    // by the end-to-end pass on a second vendor's export, not by inspection.
    expect(parseTimestamp("01/07/2026 13:30", null, "DD/MM/YYYY")?.toISOString()).toBe(
      "2026-07-01T13:30:00.000Z",
    );
    // A separate time column still wins, since that is the explicit mapping.
    expect(parseTimestamp("01/07/2026 13:30", "09:00", "DD/MM/YYYY")?.toISOString()).toBe(
      "2026-07-01T09:00:00.000Z",
    );
  });

  it("returns null for an unparseable cell instead of a wrong date", () => {
    expect(parseTimestamp("not a date", null, "ISO")).toBeNull();
    expect(parseTimestamp("", null, "ISO")).toBeNull();
  });
});

describe("applyMapping — hourly to daily (CON-30)", () => {
  it("sums 24 hourly rows into one day", () => {
    const csv = hourlyCsv("2026-07-01", Array(24).fill(2));
    const r = applyMapping(csv, HOURLY, "2026-07");
    expect(r.days).toHaveLength(1);
    expect(r.days[0].kWh).toBe(48);
    expect(r.days[0].intervalCount).toBe(24);
  });

  it("converts units without rounding", () => {
    // 1234.5 Wh is 1.2345 kWh exactly. Rounding anywhere in this chain lands
    // in a rupee figure a society is billed on (INV-02).
    const csv = ["date,time,consumption", "2026-07-01,00:00,1234.5"].join("\n");
    const r = applyMapping(csv, { ...HOURLY, valueUnit: "Wh" }, "2026-07");
    expect(r.days[0].kWh).toBeCloseTo(1.2345, 10);
  });

  it("differences a cumulative register instead of treating it as consumption", () => {
    const csv = [
      "date,time,reading",
      "2026-07-01,00:00,100000",
      "2026-07-01,01:00,100040",
      "2026-07-01,02:00,100075",
    ].join("\n");
    const r = applyMapping(csv, { ...HOURLY, valueKind: "cumulative" }, "2026-07");
    expect(r.days[0].kWh).toBe(75);
    // The first row has no predecessor, so it yields no interval — the
    // consumption before it genuinely isn't in this file.
    expect(r.days[0].intervalCount).toBe(2);
  });

  it("drops a backwards register step rather than inventing negative consumption", () => {
    const csv = [
      "date,time,reading",
      "2026-07-01,00:00,100000",
      "2026-07-01,01:00,40", // meter reset
      "2026-07-01,02:00,75",
    ].join("\n");
    const r = applyMapping(csv, { ...HOURLY, valueKind: "cumulative" }, "2026-07");
    expect(r.rowsNegative).toBe(1);
    expect(r.days[0].kWh).toBe(35);
  });

  it("excludes rows outside the operator's chosen period and says how many (INV-04)", () => {
    const csv = [
      "date,time,consumption",
      "2026-06-30,23:00,9",
      "2026-07-01,00:00,4",
      "2026-08-01,00:00,7",
    ].join("\n");
    const r = applyMapping(csv, HOURLY, "2026-07");
    expect(r.days).toHaveLength(1);
    expect(r.days[0].kWh).toBe(4);
    expect(r.rowsOutOfPeriod).toBe(2);
    expect(r.problems.join(" ")).toContain("outside 2026-07");
  });

  it("treats a blank value as unreadable, never as a zero", () => {
    // A zero is a separately-detected anomaly. Manufacturing one from an
    // empty cell would fabricate evidence of a meter fault.
    const csv = ["date,time,consumption", "2026-07-01,00:00,", "2026-07-01,01:00,5"].join("\n");
    const r = applyMapping(csv, HOURLY, "2026-07");
    expect(r.rowsUnparseable).toBe(1);
    expect(r.days[0].kWh).toBe(5);
  });

  it("ignores the trailing totals row a vendor export carries", () => {
    const csv = [
      "date,time,consumption",
      "2026-07-01,00:00,4",
      "2026-07-01,01:00,6",
      "TOTAL,,10",
    ].join("\n");
    const r = applyMapping(csv, { ...HOURLY, footerRowsToIgnore: 1 }, "2026-07");
    expect(r.days[0].kWh).toBe(10);
    expect(r.rowsUnparseable).toBe(0);
  });

  it("aggregates a whole month of hourly rows to one day each", () => {
    const lines = ["date,time,consumption"];
    for (let d = 1; d <= 31; d++) {
      for (let h = 0; h < 24; h++) {
        lines.push(`2026-07-${String(d).padStart(2, "0")},${String(h).padStart(2, "0")}:00,1.5`);
      }
    }
    const r = applyMapping(lines.join("\n"), HOURLY, "2026-07");
    expect(r.days).toHaveLength(31);
    expect(r.rowsParsed).toBe(744);
    expect(r.days.every((d) => d.kWh === 36)).toBe(true);
  });
});

describe("refuseMapping", () => {
  it("refuses a mapping that reads under 95% of the rows", () => {
    const csv = [
      "date,time,consumption",
      ...Array.from({ length: 10 }, (_, i) => `0${i + 1}/07/2026,00:00,4`),
    ].join("\n");
    // Read as ISO, none of these parse.
    const r = applyMapping(csv, HOURLY, "2026-07");
    expect(parseRate(r)).toBeLessThan(0.95);
    expect(refuseMapping(r, "2026-07")).toContain("only reads");
  });

  it("refuses a file whose rows all fall outside the chosen month", () => {
    const csv = hourlyCsv("2026-06-01", [4]);
    const r = applyMapping(csv, HOURLY, "2026-07");
    expect(refuseMapping(r, "2026-07")).toContain("No rows in this file fall inside 2026-07");
  });

  it("accepts a clean file", () => {
    const r = applyMapping(hourlyCsv("2026-07-01", Array(24).fill(2)), HOURLY, "2026-07");
    expect(refuseMapping(r, "2026-07")).toBeNull();
  });
});

describe("daysInPeriod", () => {
  it("knows February in a leap year", () => {
    expect(daysInPeriod("2028-02")).toBe(29);
    expect(daysInPeriod("2026-02")).toBe(28);
    expect(daysInPeriod("2026-07")).toBe(31);
    expect(daysInPeriod("2026-06")).toBe(30);
  });
});
