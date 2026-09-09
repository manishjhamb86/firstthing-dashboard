import { describe, it, expect } from "vitest";
import {
  covers,
  currentInstallation,
  installationAt,
  refuseOverlap,
  sliceDaysByInstallation,
  unattributedDays,
  type Installation,
} from "@/lib/meter-installation";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const stay = (o: Partial<Installation> & { id: string; installedAt: Date }): Installation => ({
  circuitId: "ckt-a",
  societyId: "soc-a",
  removedAt: null,
  ...o,
});

describe("a meter's stay is a half-open interval", () => {
  const s = stay({ id: "1", installedAt: d("2026-03-01"), removedAt: d("2026-06-01") });

  it("includes its first day and excludes its removal day", () => {
    expect(covers(s, d("2026-03-01"))).toBe(true);
    expect(covers(s, d("2026-05-31"))).toBe(true);
    // The removal instant belongs to whatever comes next — that is what lets
    // an exchange share a boundary with no gap and no overlap.
    expect(covers(s, d("2026-06-01"))).toBe(false);
    expect(covers(s, d("2026-02-28"))).toBe(false);
  });

  it("an open stay has no end", () => {
    const open = stay({ id: "2", installedAt: d("2026-06-01") });
    expect(covers(open, d("2030-01-01"))).toBe(true);
    expect(currentInstallation([s, open])?.id).toBe("2");
    expect(currentInstallation([s])).toBeNull();
  });
});

describe("a reused meter's readings follow the meter, not its current binding", () => {
  // The reported case: a meter at society A until June, then moved to B.
  const history: Installation[] = [
    stay({ id: "a", circuitId: "ckt-a", societyId: "soc-a", installedAt: d("2026-03-01"), removedAt: d("2026-06-01") }),
    stay({ id: "b", circuitId: "ckt-b", societyId: "soc-b", installedAt: d("2026-06-01") }),
  ];

  it("attributes each day to where the meter actually was", () => {
    expect(installationAt(history, d("2026-04-15"))?.societyId).toBe("soc-a");
    expect(installationAt(history, d("2026-06-02"))?.societyId).toBe("soc-b");
    // The changeover day itself belongs to the incoming stay.
    expect(installationAt(history, d("2026-06-01"))?.societyId).toBe("soc-b");
  });

  it("never attributes the old society's history to the new one", () => {
    const days = ["2026-04-01", "2026-05-31", "2026-06-01", "2026-07-01"].map(d);
    const sliced = sliceDaysByInstallation(days, history);
    expect(sliced.map((s) => s.installation?.circuitId)).toEqual([
      "ckt-a",
      "ckt-a",
      "ckt-b",
      "ckt-b",
    ]);
  });

  it("reports days the meter recorded before any stay, rather than dropping them", () => {
    // A meter that was reading in February, before we recorded it anywhere.
    const sliced = sliceDaysByInstallation([d("2026-02-10"), d("2026-04-01")], history);
    expect(unattributedDays(sliced).map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-02-10"]);
  });
});

describe("overlap is refused in words before the database refuses it", () => {
  const meterStays: Installation[] = [
    stay({ id: "a", circuitId: "ckt-a", installedAt: d("2026-03-01"), removedAt: d("2026-06-01") }),
  ];

  it("lets an exchange share its boundary — no gap, no overlap", () => {
    expect(
      refuseOverlap({ installedAt: d("2026-06-01"), meterStays, circuitStays: [] }),
    ).toBeNull();
  });

  it("refuses a stay that starts before the meter left its last one", () => {
    const r = refuseOverlap({ installedAt: d("2026-05-31"), meterStays, circuitStays: [] });
    expect(r?.at).toBe("meter");
    expect(r?.message).toMatch(/in one place at a time/i);
  });

  it("refuses a second meter on one circuit — CON-11's billing grain", () => {
    const circuitStays: Installation[] = [stay({ id: "x", installedAt: d("2026-01-01") })];
    const r = refuseOverlap({ installedAt: d("2026-07-01"), meterStays: [], circuitStays });
    expect(r?.at).toBe("circuit");
    expect(r?.message).toMatch(/one meter at a time/i);
  });

  it("refuses a removal that precedes its own installation", () => {
    expect(
      refuseOverlap({
        installedAt: d("2026-06-01"),
        removedAt: d("2026-05-01"),
        meterStays: [],
        circuitStays: [],
      })?.message,
    ).toMatch(/after its installation/i);
  });

  it("does not refuse a row against itself when it is re-checked", () => {
    expect(
      refuseOverlap({
        installedAt: d("2026-03-01"),
        removedAt: d("2026-06-01"),
        meterStays,
        circuitStays: [],
        ignoreId: "a",
      }),
    ).toBeNull();
  });
});
