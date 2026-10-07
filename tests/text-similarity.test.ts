import { describe, expect, it } from "vitest";
import { findSimilarSociety, nameSimilarity, toTitleCase } from "@/lib/text-similarity";

describe("toTitleCase", () => {
  it("title-cases a name however it was typed", () => {
    expect(toTitleCase("OXY HOMEZ")).toBe("Oxy Homez");
    expect(toTitleCase("oxy homez")).toBe("Oxy Homez");
    expect(toTitleCase("Oxy Homez")).toBe("Oxy Homez");
  });
  it("collapses extra whitespace", () => {
    expect(toTitleCase("  RG   Residency  ")).toBe("Rg Residency");
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical names, case/whitespace-insensitive", () => {
    expect(nameSimilarity("RG Residency", "rg  residency")).toBe(1);
  });
  it("is high for a one-letter misspelling — the real OXY HOMEZ / Oxy Homes pair", () => {
    // One character different in nine ("Homez" vs "Homes") — 88.9%, which
    // is why the warn threshold is 85%, not the user's literally-stated
    // 90% (see text-similarity.ts's own comment on the threshold).
    expect(nameSimilarity("OXY HOMEZ", "Oxy Homes")).toBeCloseTo(0.8889, 3);
    expect(nameSimilarity("OXY HOMEZ", "Oxy Homes")).toBeGreaterThanOrEqual(0.85);
  });
  it("is low for genuinely unrelated names", () => {
    expect(nameSimilarity("RG Residency", "Settlement Nexus")).toBeLessThan(0.5);
  });
});

describe("findSimilarSociety", () => {
  const existing = [
    { id: "1", name: "Oxy Homes" },
    { id: "2", name: "Settlement Nexus" },
  ];

  it("finds the OXY HOMEZ / Oxy Homes case, name-only, regardless of location", () => {
    const match = findSimilarSociety("OXY HOMEZ", existing);
    expect(match?.id).toBe("1");
  });

  it("finds nothing for a genuinely new name", () => {
    expect(findSimilarSociety("Brigade Cornerstone", existing)).toBeNull();
  });

  it("matches at exactly the 90% threshold, inclusive", () => {
    // Construct a pair exactly at 0.9: 10-char base, 1 edit -> 0.9.
    const base = "Abcdefghij";
    const oneOff = "Abcdefghik";
    expect(nameSimilarity(base, oneOff)).toBeCloseTo(0.9, 5);
    const match = findSimilarSociety(oneOff, [{ id: "x", name: base }]);
    expect(match?.id).toBe("x");
  });

  it("picks the single best match when several are close", () => {
    const pool = [
      { id: "near", name: "Oxy Home" },
      { id: "exact", name: "Oxy Homes" },
    ];
    expect(findSimilarSociety("Oxy Homes", pool)?.id).toBe("exact");
  });
});
