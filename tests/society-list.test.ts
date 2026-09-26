import { describe, expect, it } from "vitest";
import { matchesQuery, societyStanding, sortSocieties, startedOn, type SocietyRow } from "@/lib/society-list";

const row = (o: Partial<SocietyRow> & { id: string }): SocietyRow => ({
  name: o.id, location: "Noida", flatCount: null, lights: null, circuits: 0, serviceLines: [], status: "active", standing: "active", paying: false, billingStart: null, signedOn: null, ...o,
});
const rows = [
  row({ id: "A", billingStart: "2025-11-15" }),
  row({ id: "B", signedOn: "2026-01-10" }),
  row({ id: "C", billingStart: "2026-06-01", signedOn: "2026-05-01" }),
  row({ id: "D" }),
];

describe("societies list", () => {
  it("billing start, else signed date", () => {
    expect(startedOn(rows[2])).toEqual({ date: "2026-06-01", kind: "billing" });
    expect(startedOn(rows[1])).toEqual({ date: "2026-01-10", kind: "signed" });
    expect(startedOn(rows[3])).toBeNull();
  });
  it("default order: newest start first, no date last", () => {
    expect(sortSocieties(rows, "started", "desc").map((r) => r.id)).toEqual(["C", "B", "A", "D"]);
  });
  it("a society with no date sinks in both directions", () => {
    expect(sortSocieties(rows, "started", "asc").map((r) => r.id)).toEqual(["A", "B", "C", "D"]);
  });
  it("filters on every word, name or location", () => {
    expect(matchesQuery(row({ id: "x", name: "ATS Village", location: "Noida" }), "ats noi")).toBe(true);
    expect(matchesQuery(row({ id: "x", name: "ATS Village", location: "Noida" }), "ats gurgaon")).toBe(false);
    expect(matchesQuery(row({ id: "x" }), "  ")).toBe(true);
  });
});

describe("societyStanding", () => {
  const today = "2026-09-26";
  it("active means billing has started", () => {
    expect(societyStanding({ status: "active", billingStart: "2026-06-01", today })).toBe("active");
    expect(societyStanding({ status: "prospect", billingStart: "2026-06-01", today })).toBe("active");
  });
  it("an executed agreement with billing not yet started is still a prospect", () => {
    expect(societyStanding({ status: "active", billingStart: null, today })).toBe("prospect");
    expect(societyStanding({ status: "active", billingStart: "2026-10-01", today })).toBe("prospect");
  });
  it("suspended and terminated stand as recorded", () => {
    expect(societyStanding({ status: "terminated", billingStart: "2026-06-01", today })).toBe("terminated");
    expect(societyStanding({ status: "suspended", billingStart: "2026-06-01", today })).toBe("suspended");
  });
});
