import { describe, expect, it } from "vitest";
import { parsePumpRoomSheet } from "@/lib/pump-room-xlsx";
import type { Sheet } from "@/lib/xlsx";

function sheet(rows: string[][]): Sheet {
  return { name: "Sheet1", rows };
}

describe("parsePumpRoomSheet", () => {
  it("reads ts/kw/kwh/total_flow by header name, not position", () => {
    const result = parsePumpRoomSheet([
      sheet([
        ["total_flow", "ts", "kwh", "kw"],
        ["100.5", "2026-11-01 00:30", "12.3", "5.1"],
        ["105.0", "2026-11-01 01:30", "12.9", "5.0"],
      ]),
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      ts: new Date(Date.UTC(2026, 10, 1, 0, 30)),
      kw: 5.1,
      kwh: 12.3,
      totalFlow: 100.5,
    });
  });

  it("parses an Excel serial ts, keeping the time of day whole (not truncated to a date)", () => {
    // 46000.5 = 2025-12-13 12:00 — the time matters here, since the closing
    // sample is chosen by the LATEST ts, not just the latest date.
    const result = parsePumpRoomSheet([sheet([["ts", "kwh"], ["46000.5", "7"]])]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ts.toISOString()).toBe(new Date(Math.round((46000.5 - 25569) * 86400000)).toISOString());
  });

  it("rejects a date that does not exist (31 February and friends)", () => {
    const result = parsePumpRoomSheet([sheet([["ts", "kwh"], ["2026-02-31 00:00", "5"]])]);
    expect(result.rows).toHaveLength(0);
    expect(result.rowsUnparseable).toBe(1);
  });

  it("counts a row with a missing kwh as unparseable rather than dropping it silently", () => {
    const result = parsePumpRoomSheet([
      sheet([
        ["ts", "kwh"],
        ["2026-11-01 00:00", "10"],
        ["2026-11-01 01:00", ""],
      ]),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rowsUnparseable).toBe(1);
    expect(result.problems[0]).toMatch(/1 row could not be read/);
  });

  it("skips a blank trailing row", () => {
    const result = parsePumpRoomSheet([
      sheet([
        ["ts", "kwh"],
        ["2026-11-01 00:00", "10"],
        ["", ""],
      ]),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rowsUnparseable).toBe(0);
  });

  it("sorts rows by ts regardless of file order", () => {
    const result = parsePumpRoomSheet([
      sheet([
        ["ts", "kwh"],
        ["2026-11-01 02:00", "3"],
        ["2026-11-01 00:00", "1"],
        ["2026-11-01 01:00", "2"],
      ]),
    ]);
    expect(result.rows.map((r) => r.kwh)).toEqual([1, 2, 3]);
  });

  it("finds the header among several sheets, not only the first", () => {
    const result = parsePumpRoomSheet([
      sheet([["Notes"], ["nothing here"]]),
      sheet([["ts", "kwh"], ["2026-11-01 00:00", "4"]]),
    ]);
    expect(result.rows).toHaveLength(1);
  });

  it("states a clear problem when no sheet has the expected columns", () => {
    const result = parsePumpRoomSheet([sheet([["foo", "bar"], ["1", "2"]])]);
    expect(result.rows).toHaveLength(0);
    expect(result.problems[0]).toMatch(/No sheet with ts\/kwh columns/);
  });

  it("kw is optional — a file with only ts/kwh still parses", () => {
    const result = parsePumpRoomSheet([sheet([["ts", "kwh"], ["2026-11-01 00:00", "9"]])]);
    expect(result.rows[0].kw).toBeNull();
    expect(result.rows[0].totalFlow).toBeNull();
  });
});
