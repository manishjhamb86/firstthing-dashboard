import { describe, expect, it } from "vitest";
import { describeLightCountChange, filterCustomerRelevant, type LightCountHistoryEntry } from "@/lib/circuit-light-history";

function entry(p: Partial<LightCountHistoryEntry>): LightCountHistoryEntry {
  return {
    at: "01-01-2026",
    kind: "correction",
    reason: null,
    demoFrom: null,
    demoTo: null,
    fullFrom: null,
    fullTo: null,
    ids: ["id"],
    excludedAt: null,
    excludedReason: null,
    ...p,
  };
}

describe("filterCustomerRelevant", () => {
  it("passes through an empty list", () => {
    expect(filterCustomerRelevant([])).toEqual([]);
  });

  it("keeps a single, non-reversing correction", () => {
    const e = entry({ demoFrom: 34, demoTo: 40, ids: ["a"] });
    expect(filterCustomerRelevant([e])).toEqual([e]);
  });

  it("the reported case: an exact, immediate back-and-forth cancels out entirely", () => {
    // Newest-first, matching every caller's own convention — the later edit
    // (76 -> 34) listed first, the earlier one (34 -> 76) listed second.
    const later = entry({ demoFrom: 76, demoTo: 34, ids: ["later"] });
    const earlier = entry({ demoFrom: 34, demoTo: 76, ids: ["earlier"] });
    expect(filterCustomerRelevant([later, earlier])).toEqual([]);
  });

  it("a real, multi-step sequence that happens to return to the same value is NOT collapsed", () => {
    // 34 -> 76 -> 80 -> 34: each step is a different, real correction: this
    // is not one mistake immediately undone, so every entry stays visible.
    const e1 = entry({ demoFrom: 34, demoTo: 76, ids: ["e1"] });
    const e2 = entry({ demoFrom: 76, demoTo: 80, ids: ["e2"] });
    const e3 = entry({ demoFrom: 80, demoTo: 34, ids: ["e3"] });
    // newest-first
    expect(filterCustomerRelevant([e3, e2, e1])).toEqual([e3, e2, e1]);
  });

  it("a chain of repeated flip-flopping fully cancels via the stack", () => {
    // Ascending: 34->76, 76->34, 34->76, 76->34 — two back-and-forth pairs in a row.
    const e1 = entry({ demoFrom: 34, demoTo: 76, ids: ["e1"] });
    const e2 = entry({ demoFrom: 76, demoTo: 34, ids: ["e2"] });
    const e3 = entry({ demoFrom: 34, demoTo: 76, ids: ["e3"] });
    const e4 = entry({ demoFrom: 76, demoTo: 34, ids: ["e4"] });
    expect(filterCustomerRelevant([e4, e3, e2, e1])).toEqual([]);
  });

  it("a manually excluded entry is dropped regardless of shape", () => {
    const e = entry({ demoFrom: 34, demoTo: 40, ids: ["a"], excludedAt: "01-01-2026", excludedReason: "test data" });
    expect(filterCustomerRelevant([e])).toEqual([]);
  });

  it("a paired (demo + full-installation) reversal cancels when both halves reverse together", () => {
    const later = entry({ demoFrom: 76, demoTo: 34, fullFrom: 900, fullTo: 942, ids: ["later"] });
    const earlier = entry({ demoFrom: 34, demoTo: 76, fullFrom: 942, fullTo: 900, ids: ["earlier"] });
    expect(filterCustomerRelevant([later, earlier])).toEqual([]);
  });

  it("entries of different shapes (one paired, one not) never count as reversing each other", () => {
    const later = entry({ demoFrom: 76, demoTo: 34, ids: ["later"] }); // no paired full-installation move
    const earlier = entry({ demoFrom: 34, demoTo: 76, fullFrom: 942, fullTo: 900, ids: ["earlier"] });
    expect(filterCustomerRelevant([later, earlier])).toEqual([later, earlier]);
  });

  it("a verified rescale and a correction that exactly reverse each other still cancel — kind-agnostic", () => {
    const rescale = entry({ kind: "rescale", demoFrom: 34, demoTo: 76, ids: ["r1"] });
    const correction = entry({ kind: "correction", demoFrom: 76, demoTo: 34, ids: ["c1"] });
    expect(filterCustomerRelevant([correction, rescale])).toEqual([]);
  });

  it("a single verified rescale, with nothing to cancel against, stays visible", () => {
    const rescale = entry({ kind: "rescale", demoFrom: 34, demoTo: 76, reason: "Walked", ids: ["r1"] });
    expect(filterCustomerRelevant([rescale])).toEqual([rescale]);
  });
});

describe("describeLightCountChange", () => {
  it("a verified rescale reads 'changed', never 'corrected' — nothing was wrong before", () => {
    const e = entry({ kind: "rescale", demoFrom: 34, demoTo: 76, reason: "Walked" });
    expect(describeLightCountChange(e)).toBe("The light count on this circuit changed 34 → 76 — Walked.");
  });

  it("a verified rescale with no note omits the dash", () => {
    const e = entry({ kind: "rescale", demoFrom: 34, demoTo: 76, reason: null });
    expect(describeLightCountChange(e)).toBe("The light count on this circuit changed 34 → 76.");
  });

  it("an ordinary correction still reads 'corrected', unchanged", () => {
    const e = entry({ kind: "correction", demoFrom: 34, demoTo: 40 });
    expect(describeLightCountChange(e)).toBe("The demo's count was corrected 34 → 40.");
  });
});
