import { describe, expect, it } from "vitest";
import { duplicateRefuses } from "@/lib/invoice-duplicate";

describe("duplicateRefuses", () => {
  it("a same-number match always refuses, even for a non-service bill", () => {
    expect(duplicateRefuses({ number: "FT/2026-27/055", released: true, sameNumber: true }, true)).toBe(true);
  });
  it("a same-month match refuses a savings bill but not a flagged non-service bill", () => {
    const d = { number: "FT/2026-27/055", released: false, sameNumber: false };
    expect(duplicateRefuses(d, false)).toBe(true);
    expect(duplicateRefuses(d, true)).toBe(false);
  });
  it("no match refuses nothing", () => {
    expect(duplicateRefuses(null, false)).toBe(false);
  });
});
