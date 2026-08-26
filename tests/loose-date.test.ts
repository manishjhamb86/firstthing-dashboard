import { describe, expect, it } from "vitest";
import { dateOptions, readLooseDate } from "@/lib/loose-date";

describe("dates as documents print them", () => {
  it("reads a named month whichever side it sits on", () => {
    // All four are on Ace City's own agreement.
    expect(readLooseDate("23 Oct 2025")).toEqual({ kind: "exact", iso: "2025-10-23" });
    expect(readLooseDate("10 NOV 2025")).toEqual({ kind: "exact", iso: "2025-11-10" });
    expect(readLooseDate("23 October 2025")).toEqual({ kind: "exact", iso: "2025-10-23" });
    expect(readLooseDate("Oct 23, 2025")).toEqual({ kind: "exact", iso: "2025-10-23" });
  });

  it("passes an ISO date through", () => {
    expect(readLooseDate("2025-10-23")).toEqual({ kind: "exact", iso: "2025-10-23" });
    expect(readLooseDate("2025-10-23T00:00:00Z")).toEqual({ kind: "exact", iso: "2025-10-23" });
  });

  it("gives BOTH readings of an ambiguous numeric date rather than choosing", () => {
    // A month of billing rides on this, and only the document settles it.
    expect(readLooseDate("10/11/2025")).toEqual({
      kind: "ambiguous",
      dayFirst: "2025-11-10",
      monthFirst: "2025-10-11",
    });
    expect(readLooseDate("11/10/25")).toEqual({
      kind: "ambiguous",
      dayFirst: "2025-10-11",
      monthFirst: "2025-11-10",
    });
  });

  it("but reads a numeric date that can only mean one thing", () => {
    expect(readLooseDate("23/10/2025")).toEqual({ kind: "exact", iso: "2025-10-23" });
    expect(readLooseDate("10/23/2025")).toEqual({ kind: "exact", iso: "2025-10-23" });
  });

  it("a same-day pair is not ambiguous", () => {
    expect(readLooseDate("07/07/2025")).toEqual({ kind: "exact", iso: "2025-07-07" });
  });

  it("refuses a day that does not exist rather than rolling it forward", () => {
    // Date would make this 3 March; a reading dated a day that never
    // happened is worse than one refused.
    expect(readLooseDate("31/02/2025")).toBeNull();
    expect(readLooseDate("31 Feb 2025")).toBeNull();
    expect(readLooseDate("2025-02-31")).toBeNull();
  });

  it("says nothing about text that is not a date", () => {
    expect(readLooseDate("")).toBeNull();
    expect(readLooseDate("Date -")).toBeNull();
    expect(readLooseDate("from the date of installation completion")).toBeNull();
  });

  it("offers one option for a clear date and two for an ambiguous one", () => {
    expect(dateOptions("23 Oct 2025")).toEqual([{ iso: "2025-10-23", label: "2025-10-23" }]);
    expect(dateOptions("10/11/2025").map((o) => o.iso)).toEqual(["2025-11-10", "2025-10-11"]);
    expect(dateOptions("Date -")).toEqual([]);
  });
});
