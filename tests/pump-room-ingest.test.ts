import { describe, expect, it } from "vitest";
import { deriveDailyFigure, subjectLabelOf } from "@/lib/pump-room-ingest";

describe("subjectLabelOf", () => {
  it("reads the label after the colon from a plain subject", () => {
    expect(subjectLabelOf("EMS-Automated daily Report : RG Residency")).toBe("RG Residency");
  });

  it("strips a manual-forward prefix, which a real auto-forward never adds but a test copy always does", () => {
    expect(subjectLabelOf("Fwd: EMS-Automated daily Report : RG Residency")).toBe("RG Residency");
    expect(subjectLabelOf("Fw: EMS-Automated daily Report : RG Residency")).toBe("RG Residency");
  });

  it("strips a stacked forward-of-a-reply prefix", () => {
    expect(subjectLabelOf("Fwd: Re: EMS-Automated daily Report : RG Residency")).toBe("RG Residency");
  });

  it("is case-insensitive on both the prefix and the vendor boilerplate", () => {
    expect(subjectLabelOf("FWD: ems-automated daily report : RG Residency")).toBe("RG Residency");
  });

  it("falls back to the whole trimmed subject when the pattern does not match at all — never silently dropped", () => {
    expect(subjectLabelOf("  Something else entirely  ")).toBe("Something else entirely");
  });
});

describe("deriveDailyFigure", () => {
  it("has no figure for the first-ever reading — correct, not a loss", () => {
    expect(deriveDailyFigure(120, null)).toEqual({ dailyKwh: null, registerWentBackwards: false });
  });

  it("differences a normal day against the previous day's own closing sample", () => {
    expect(deriveDailyFigure(132.5, 120)).toEqual({ dailyKwh: 12.5, registerWentBackwards: false });
  });

  it("a flat day (no consumption) is a real zero, not withheld", () => {
    expect(deriveDailyFigure(120, 120)).toEqual({ dailyKwh: 0, registerWentBackwards: false });
  });

  it("flags a backwards register and withholds the figure, never a negative number", () => {
    expect(deriveDailyFigure(50, 120)).toEqual({ dailyKwh: null, registerWentBackwards: true });
  });
});
