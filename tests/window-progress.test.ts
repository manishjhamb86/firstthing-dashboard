import { describe, expect, it } from "vitest";
import { windowProgress } from "@/lib/window-progress";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const NOW = new Date("2026-09-20T09:00:00Z");
const base = { windowStartAt: d("2026-09-01"), requiredValidDays: 5, now: NOW };

describe("windowProgress — the legacy commissioning window", () => {
  it("counts valid days and states CON-19's five-day gate", () => {
    const p = windowProgress({
      ...base,
      legacy: [
        { date: d("2026-09-02"), status: "valid" },
        { date: d("2026-09-03"), status: "valid" },
        { date: d("2026-09-04"), status: "anomaly" },
      ],
      stored: [],
    });
    expect(p.flow).toBe("legacy");
    expect(p.dayCount).toBe(2);
    expect(p.pendingAnomaly).toBe(true);
    expect(p.label).toBe("Day 2 of 5");
  });

  it("ignores days recorded before the window start", () => {
    const p = windowProgress({
      ...base,
      legacy: [
        { date: d("2026-08-30"), status: "valid" },
        { date: d("2026-09-02"), status: "valid" },
      ],
      stored: [],
    });
    expect(p.dayCount).toBe(1);
  });

  it("reports whether today's reading has been recorded", () => {
    expect(
      windowProgress({ ...base, legacy: [{ date: d("2026-09-20"), status: "valid" }], stored: [] })
        .loggedToday,
    ).toBe(true);
    expect(
      windowProgress({ ...base, legacy: [{ date: d("2026-09-19"), status: "valid" }], stored: [] })
        .loggedToday,
    ).toBe(false);
  });
});

describe("windowProgress — CON-45's stored readings", () => {
  // The defect this whole module exists for: the board saw none of these.
  it("counts uploaded days a legacy-only reader would have scored zero", () => {
    const p = windowProgress({
      ...base,
      legacy: [],
      stored: [
        { date: d("2026-09-02"), excludedAt: null, anomalyFlag: false },
        { date: d("2026-09-03"), excludedAt: null, anomalyFlag: false },
        { date: d("2026-09-04"), excludedAt: null, anomalyFlag: false },
      ],
    });
    expect(p.flow).toBe("stored");
    expect(p.dayCount).toBe(3);
  });

  it("never prints the five-day gate, which this flow does not have", () => {
    const p = windowProgress({
      ...base,
      legacy: [],
      stored: [{ date: d("2026-09-02"), excludedAt: null, anomalyFlag: false }],
    });
    expect(p.label).toBe("1 day uploaded");
    expect(p.label).not.toContain("of 5");
  });

  it("excluded days do not count toward the figure", () => {
    const p = windowProgress({
      ...base,
      legacy: [],
      stored: [
        { date: d("2026-09-02"), excludedAt: null, anomalyFlag: false },
        { date: d("2026-09-03"), excludedAt: new Date(), anomalyFlag: false },
      ],
    });
    expect(p.dayCount).toBe(1);
    expect(p.label).toBe("1 day uploaded");
  });

  it("a flagged stored day still holds the window open", () => {
    const p = windowProgress({
      ...base,
      legacy: [],
      stored: [{ date: d("2026-09-02"), excludedAt: null, anomalyFlag: true }],
    });
    expect(p.pendingAnomaly).toBe(true);
  });

  it("does not ask 'was today logged' of an uploaded sheet", () => {
    // Reporting false here would park every CSV circuit in the board's
    // "still needs today's reading" bucket for good.
    const p = windowProgress({
      ...base,
      legacy: [],
      stored: [{ date: d("2026-09-02"), excludedAt: null, anomalyFlag: false }],
    });
    expect(p.loggedToday).toBe(true);
  });
});

describe("windowProgress — nothing recorded yet", () => {
  it("says so, and is genuinely waiting on a person", () => {
    const p = windowProgress({ ...base, legacy: [], stored: [] });
    expect(p.flow).toBe("none");
    expect(p.dayCount).toBe(0);
    expect(p.loggedToday).toBe(false);
    expect(p.label).toBe("Awaiting the first reading");
  });

  it("a window whose only stored day predates it reads as empty, not as progress", () => {
    const p = windowProgress({
      ...base,
      legacy: [],
      stored: [{ date: d("2026-08-20"), excludedAt: null, anomalyFlag: false }],
    });
    expect(p.flow).toBe("none");
  });
});
