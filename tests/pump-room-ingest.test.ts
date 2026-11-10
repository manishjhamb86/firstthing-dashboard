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
  it("falls back to this day's own opening-to-closing span when there is no prior day — approximate, stated as such", () => {
    expect(deriveDailyFigure(132.5, 120, null)).toEqual({ daily: 12.5, wentBackwards: false, basedOnSameDayOpening: true });
  });

  it("differences a normal day against the previous day's own closing sample, ignoring this day's own opening", () => {
    expect(deriveDailyFigure(132.5, 999, 120)).toEqual({ daily: 12.5, wentBackwards: false, basedOnSameDayOpening: false });
  });

  it("a flat day (no change) is a real zero, not withheld, on either basis", () => {
    expect(deriveDailyFigure(120, 120, null)).toEqual({ daily: 0, wentBackwards: false, basedOnSameDayOpening: true });
    expect(deriveDailyFigure(120, 999, 120)).toEqual({ daily: 0, wentBackwards: false, basedOnSameDayOpening: false });
  });

  it("flags a backwards register against the previous day and withholds the figure, never a negative number", () => {
    expect(deriveDailyFigure(50, 999, 120)).toEqual({ daily: null, wentBackwards: true, basedOnSameDayOpening: false });
  });

  it("flags a backwards register within the same file (closing below opening) when there is no prior day either", () => {
    expect(deriveDailyFigure(50, 120, null)).toEqual({ daily: null, wentBackwards: true, basedOnSameDayOpening: true });
  });
});
