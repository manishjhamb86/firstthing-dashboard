import { describe, expect, it } from "vitest";
import { planCountCorrection } from "@/lib/count-correction";

const base = {
  lines: [{ id: "l1", count: 63, replacementCount: 63 }],
  lineId: "l1",
  newCount: 55,
  circuitMeteredCount: 63,
  demos: [
    { id: "d1", meteredLightCount: 55 },
    { id: "d2", meteredLightCount: 63 },
    { id: "d3", meteredLightCount: 63 },
  ],
};

describe("planCountCorrection", () => {
  it("fixes the wrong figure everywhere it was carried, and nowhere else", () => {
    const p = planCountCorrection(base);
    if ("error" in p) throw new Error(p.error);
    expect(p).toMatchObject({ oldCount: 63, newCount: 55, totalNew: 55, replacementCount: 55, circuitMeteredCount: 55, demoIds: ["d2", "d3"] });
  });
  it("with several lines, the total is what the circuit and demos carried", () => {
    const p = planCountCorrection({
      ...base,
      lines: [{ id: "l1", count: 93, replacementCount: 90 }, { id: "l2", count: 7, replacementCount: null }],
      newCount: 90,
      circuitMeteredCount: 100,
      demos: [{ id: "d1", meteredLightCount: 100 }],
    });
    if ("error" in p) throw new Error(p.error);
    expect(p).toMatchObject({ totalOld: 100, totalNew: 97, replacementCount: "unchanged", circuitMeteredCount: 97, demoIds: ["d1"] });
  });
  it("refuses no change and nonsense", () => {
    expect(planCountCorrection({ ...base, newCount: 63 })).toHaveProperty("error");
    expect(planCountCorrection({ ...base, newCount: 0 })).toHaveProperty("error");
    expect(planCountCorrection({ ...base, newCount: 2.5 })).toHaveProperty("error");
    expect(planCountCorrection({ ...base, lineId: "nope" })).toHaveProperty("error");
  });
});
