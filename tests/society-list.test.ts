import { describe, expect, it } from "vitest";
import { matchesQuery, sortSocieties, startedOn, type SocietyRow } from "@/lib/society-list";

const row = (o: Partial<SocietyRow> & { id: string }): SocietyRow => ({
  name: o.id, location: "Noida", flatCount: null, lights: null, circuits: 0, serviceLines: [], status: "active", billingStart: null, signedOn: null, ...o,
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
