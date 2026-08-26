import { describe, it, expect } from "vitest";
import { normaliseSocietyPart, societyDedupeKey } from "@/lib/society-key";

describe("society dedupe key", () => {
  it("folds case, spacing and punctuation", () => {
    const a = societyDedupeKey("Mahagun Puram", "Noida");
    expect(societyDedupeKey("mahagun  puram", "noida")).toBe(a);
    expect(societyDedupeKey("Mahagun-Puram.", " NOIDA ")).toBe(a);
  });

  it("keeps same-named societies in different cities apart", () => {
    expect(societyDedupeKey("Green Valley", "Noida")).not.toBe(societyDedupeKey("Green Valley", "Gurugram"));
  });

  it("does not merge differently-named societies", () => {
    // Silently equating these would be a worse failure than keeping two rows.
    expect(societyDedupeKey("Brigade Cornerstone", "Whitefield")).not.toBe(
      societyDedupeKey("Brigade Cornerstone Apartments", "Whitefield"),
    );
  });

  it("cannot collide across the name/location boundary", () => {
    // "a b" + "c" must not key the same as "a" + "b c".
    expect(societyDedupeKey("a b", "c")).not.toBe(societyDedupeKey("a", "b c"));
  });

  it("normalises unicode-ish and numeric names without dropping digits", () => {
    expect(normaliseSocietyPart("Tower 12 — Block A")).toBe("tower 12 block a");
  });

  it("is stable for an already-normal value", () => {
    expect(normaliseSocietyPart("rg residency")).toBe("rg residency");
  });
});
