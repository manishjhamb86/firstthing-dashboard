import { describe, expect, it } from "vitest";
import { rankHomepageSocieties, refuseTestimonial, rupeesShort } from "@/lib/homepage-content";

const row = (id: string, pct: number | null, value: number, months = 3) => ({ societyId: id, name: id, location: "", savingsPct: pct, savedValue: value, months });

describe("rankHomepageSocieties", () => {
  it("orders by savings %, then ₹ saved", () => {
    const r = rankHomepageSocieties([row("a", 60, 100), row("b", 64, 50), row("c", 64, 90)], new Map(), 2);
    expect(r.map((x) => x.societyId)).toEqual(["c", "b", "a"]);
    expect(r.filter((x) => x.shown).map((x) => x.societyId)).toEqual(["c", "b"]);
  });
  it("puts pinned first by priority and keeps held off", () => {
    const r = rankHomepageSocieties(
      [row("a", 70, 100), row("b", 50, 10), row("c", 55, 10), row("d", 80, 999)],
      new Map([["b", { mode: "pinned", priority: 2 }], ["c", { mode: "pinned", priority: 1 }], ["d", { mode: "held", priority: 100 }]]),
      3,
    );
    expect(r.filter((x) => x.shown).map((x) => x.societyId)).toEqual(["c", "b", "a"]);
    expect(r.find((x) => x.societyId === "d")).toMatchObject({ shown: false, rank: null });
  });
  it("never shows a society with no published figure", () => {
    const r = rankHomepageSocieties([row("a", null, 0, 0), row("b", 61, 10)], new Map([["a", { mode: "pinned", priority: 1 }]]), 3);
    expect(r.filter((x) => x.shown).map((x) => x.societyId)).toEqual(["b"]);
  });
});

describe("refuseTestimonial", () => {
  it("checks length, name and consent", () => {
    expect(refuseTestimonial({ quote: "short", authorName: "A" })).toMatch(/at least/);
    expect(refuseTestimonial({ quote: "x".repeat(30), authorName: "" })).toMatch(/name/);
    expect(refuseTestimonial({ quote: "x".repeat(30), authorName: "A", needsConsent: true })).toMatch(/agree/);
    expect(refuseTestimonial({ quote: "x".repeat(30), authorName: "A", needsConsent: true, consent: true })).toBeNull();
  });
});

describe("rupeesShort", () => {
  it("reads as Indians write it", () => {
    expect(rupeesShort(48000)).toBe("₹48,000");
    expect(rupeesShort(1240000)).toBe("₹12 lakh");
    expect(rupeesShort(148000)).toBe("₹1.5 lakh");
    expect(rupeesShort(12000000)).toBe("₹1.2 crore");
  });
});
