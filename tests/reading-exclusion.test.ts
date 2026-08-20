import { describe, expect, it } from "vitest";
import { exclusionRefusal, type ExclusionContext } from "@/lib/reading-exclusion";

const base: ExclusionContext = {
  phase: "post_install",
  replacementRecorded: true,
  benchmarkConfirmed: false,
  billed: false,
  isOps: true,
};

describe("exclusionRefusal", () => {
  it("allows a post-install day while the benchmark is still open", () => {
    expect(exclusionRefusal(base)).toBeNull();
  });

  it("freezes post-install days once the benchmark is confirmed", () => {
    // This is what was silently refusing behind an offered control.
    expect(exclusionRefusal({ ...base, benchmarkConfirmed: true })).toContain("fixed for the term");
  });

  it("freezes pre-install days once the lights are replaced", () => {
    expect(
      exclusionRefusal({ ...base, phase: "pre_install", replacementRecorded: true }),
    ).toContain("baseline");
  });

  it("still allows a pre-install day before the replacement", () => {
    expect(
      exclusionRefusal({ ...base, phase: "pre_install", replacementRecorded: false }),
    ).toBeNull();
  });

  it("keeps the benchmark decision with ops while it is still being made", () => {
    expect(exclusionRefusal({ ...base, isOps: false })).toContain("operations-lead");
  });

  it("a monitoring day stays excludable — that is the month still being worked", () => {
    expect(
      exclusionRefusal({ ...base, phase: "monitoring", benchmarkConfirmed: true, isOps: false }),
    ).toBeNull();
  });

  it("INV-03 outranks everything: billed is billed", () => {
    expect(exclusionRefusal({ ...base, phase: "monitoring", billed: true })).toContain("INV-03");
  });
});
