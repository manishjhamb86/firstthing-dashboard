import { describe, expect, it } from "vitest";
import { EMPTY_BODY_SHA256, signPayload, stringToSign, tuyaSign } from "@/lib/tuya-sign";

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
