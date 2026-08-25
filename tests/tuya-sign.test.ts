import { describe, expect, it } from "vitest";
import { EMPTY_BODY_SHA256, signPayload, stringToSign, tuyaSign } from "@/lib/tuya-sign";
import { normaliseLevel } from "@/lib/tuya";

// The string construction is the whole bug surface: Tuya answers a wrong
// signature with a bare "sign invalid", so the ordering and the newlines are
// pinned here instead of rediscovered against the live API.
describe("Tuya request signing", () => {
  it("builds the string-to-sign exactly as the API verifies it", () => {
    expect(stringToSign("get", "/v1.0/token?grant_type=1")).toBe(
      `GET\n${EMPTY_BODY_SHA256}\n\n/v1.0/token?grant_type=1`,
    );
  });

  it("splices the access token between the id and the timestamp — and only for business calls", () => {
    const base = { accessId: "id123", timestamp: "1700000000000", method: "GET", path: "/p" };
    expect(signPayload(base)).toBe(`id1231700000000000GET\n${EMPTY_BODY_SHA256}\n\n/p`);
    expect(signPayload({ ...base, accessToken: "tokX" })).toBe(
      `id123tokX1700000000000GET\n${EMPTY_BODY_SHA256}\n\n/p`,
    );
  });

  it("signs uppercase hex — Tuya rejects lowercase", () => {
    const sig = tuyaSign("secret", "payload");
    expect(sig).toMatch(/^[0-9A-F]{64}$/);
    // Stable across runs: a known vector, so a refactor that changes the
    // algorithm (not just the string) also fails loudly.
    expect(sig).toBe("B82FCB791ACEC57859B989B430A826488CE2E479FDF92326BD0A2E8375A42BA4");
  });

  it("the query string is part of the signed path, not stripped", () => {
    expect(stringToSign("GET", "/v2.0/cloud/thing/device?page_size=100")).toContain("?page_size=100");
  });
});

describe("a raw level is not a percentage", () => {
  // The datapoint is named liquid_level_percent and carries a "%" unit, and
  // is still not a percentage: the IT56WLCW declares its range as 0-60, so a
  // raw 45 is 75% full. We showed 45% while the Smart Life app showed 75%,
  // and the app was right (2026-08-25).
  it("normalises through the device's own declared maximum", () => {
    expect(normaliseLevel(45, 60)).toBe(75);
    expect(normaliseLevel(60, 60)).toBe(100);
    expect(normaliseLevel(0, 60)).toBe(0);
    expect(normaliseLevel(15, 60)).toBe(25);
  });

  it("leaves a genuine 0-100 datapoint alone", () => {
    expect(normaliseLevel(45, 100)).toBe(45);
  });

  it("never lets a bad maximum reach a figure a society reads as its water", () => {
    // A zero or missing max would produce Infinity or NaN. Falling back to
    // "already a percentage" is the only safe reading.
    expect(normaliseLevel(45, 0)).toBe(45);
    expect(normaliseLevel(45, Number.NaN)).toBe(45);
    expect(normaliseLevel(45, -60)).toBe(45);
  });

  it("clamps a device reporting above its own declared range", () => {
    expect(normaliseLevel(75, 60)).toBe(100);
    expect(normaliseLevel(-5, 60)).toBe(0);
  });

  it("rounds to a whole percent — a tank is not measured to the decimal", () => {
    expect(normaliseLevel(20, 60)).toBe(33);
    expect(normaliseLevel(40, 60)).toBe(67);
  });
});
