import { describe, expect, it } from "vitest";
import { isRoleNotName, rankHomepageSocieties, refusePhotoKey, refuseTestimonial, rupeesShort } from "@/lib/homepage-content";

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

describe("real names", () => {
  it("refuses a role typed as a name", () => {
    for (const n of ["RWA office-bearer", "Secretary", "Facility manager", "Committee member", "Resident", "the society president"]) expect(isRoleNotName(n)).toBe(true);
    for (const n of ["Ravi Sharma", "Meena", "Col. R. S. Bedi (Retd.)"]) expect(isRoleNotName(n)).toBe(false);
    expect(refuseTestimonial({ quote: "x".repeat(30), authorName: "RWA office-bearer" })).toMatch(/real name/);
  });
});

describe("refusePhotoKey", () => {
  it("accepts only keys issued for testimonials, and for the society when scoped", () => {
    expect(refusePhotoKey(null)).toBeNull();
    expect(refusePhotoKey("Documents/Testimonials/KW_Srishti/author-1.jpg", "KW_Srishti")).toBeNull();
    expect(refusePhotoKey("Documents/KW_Srishti/2026-11/KYC/x.pdf")).toMatch(/not uploaded here/);
    expect(refusePhotoKey("Documents/Testimonials/Other/author-1.jpg", "KW_Srishti")).toMatch(/your society/);
    expect(refusePhotoKey("Documents/Testimonials/../x.jpg")).toMatch(/not uploaded here/);
  });
});
