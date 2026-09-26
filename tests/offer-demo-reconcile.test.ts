import { describe, expect, it } from "vitest";
import { demoMatchesAgreed, DEMO_MATCH_TOLERANCE_PCT } from "@/lib/offer-demo-reconcile";

describe("demoMatchesAgreed — a demo matches the agreed figure to rounding", () => {
  it("French Apartment: measured 64.38% against an agreed 64.36%", () => {
    expect(demoMatchesAgreed(64.38, 64.36)).toBe(true);
  });
  it("an agreement rounded to the whole percent still matches", () => {
    expect(demoMatchesAgreed(64.38, 64)).toBe(true);
    expect(demoMatchesAgreed(63.6, 64)).toBe(true);
  });
  it("more than half a point apart is a different figure", () => {
    expect(DEMO_MATCH_TOLERANCE_PCT).toBe(0.5);
    expect(demoMatchesAgreed(64.51, 64)).toBe(false);
    expect(demoMatchesAgreed(62, 64.36)).toBe(false);
  });
  it("no measurement is never a match", () => {
    expect(demoMatchesAgreed(null, 64.36)).toBe(false);
  });
});
