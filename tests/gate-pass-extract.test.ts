import { describe, expect, it } from "vitest";
import { gatePassMismatch } from "../src/lib/gate-pass-extract";

describe("gatePassMismatch", () => {
  it("agrees when both society and month match", () => {
    expect(
      gatePassMismatch({ matchedSocietyId: "soc-1", readDate: "2026-09-05", chosenSocietyId: "soc-1", chosenPeriod: "2026-09" }),
    ).toBe(false);
  });

  it("flags a different matched society", () => {
    expect(
      gatePassMismatch({ matchedSocietyId: "soc-2", readDate: "2026-09-05", chosenSocietyId: "soc-1", chosenPeriod: "2026-09" }),
    ).toBe(true);
  });

  it("flags a different month, even with the same society", () => {
    expect(
      gatePassMismatch({ matchedSocietyId: "soc-1", readDate: "2026-10-05", chosenSocietyId: "soc-1", chosenPeriod: "2026-09" }),
    ).toBe(true);
  });

  it("is never a mismatch when nothing could be read or matched — there is nothing to compare", () => {
    expect(
      gatePassMismatch({ matchedSocietyId: null, readDate: "", chosenSocietyId: "soc-1", chosenPeriod: "2026-09" }),
    ).toBe(false);
  });

  it("an unmatched society alone (no legible date) is not itself a mismatch", () => {
    expect(
      gatePassMismatch({ matchedSocietyId: null, readDate: "", chosenSocietyId: "soc-1", chosenPeriod: "2026-09" }),
    ).toBe(false);
  });
});
