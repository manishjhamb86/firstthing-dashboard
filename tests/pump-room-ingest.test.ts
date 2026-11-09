import { describe, expect, it } from "vitest";
import { deriveDailyFigure } from "@/lib/pump-room-ingest";

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
