import { describe, it, expect } from "vitest";
import {
  authorizeUrl,
  decodeHundredDaysKwh,
  ewelinkHost,
  nonce,
  signAuthorize,
  signBody,
  signQuery,
  todayAgrees,
} from "@/lib/ewelink-sign";

// Both vectors are CoolKit's own worked examples (en/DeveloperGuideV2.md and
// en/OAuth2.0.md). Pinned because the API answers any deviation with a bare
// "sign invalid" and nothing more.
describe("request signing", () => {
  it("matches the published POST-body example", () => {
    const body = JSON.stringify({ email: "1234@gmail.com", password: "12345678", countryCode: "+1" });
    expect(signBody(body, "OdPuCZ4PkPPi0rVKRVcGmll2NM6vVk0c")).toBe(
      "ttZ/gluzqrafvGonjMD20p4//arW6KoZKbo1SOMEzCA=",
    );
  });

  it("matches the published authorize-link example", () => {
    expect(signAuthorize("ABC", "123", "abc")).toBe("v1+mfNY2ukxswM8sZOTg99srZsVnUVv9DGXeav1096M=");
  });

  it("sorts GET parameters alphabetically, whatever order they were given in", () => {
    const a = signQuery({ num: 0, lang: "en", beginIndex: -9999999 }, "s");
    const b = signQuery({ beginIndex: -9999999, lang: "en", num: 0 }, "s");
    expect(a).toBe(b);
    expect(a).toBe(signBody("beginIndex=-9999999&lang=en&num=0", "s"));
  });

  it("never signs the sign itself", () => {
    expect(signQuery({ a: 1, sign: "x" }, "s")).toBe(signQuery({ a: 1 }, "s"));
  });
});

describe("hosts and nonce", () => {
  it("sends India to the Asia host", () => expect(ewelinkHost("as")).toBe("https://as-apia.coolkit.cc"));
  it("falls back to Asia rather than to an undefined host", () =>
    expect(ewelinkHost("mars")).toBe("https://as-apia.coolkit.cc"));
  it("is 8 alphanumerics, as the header requires", () => expect(nonce()).toMatch(/^[a-zA-Z0-9]{8}$/));
  it("carries the state that proves the callback answers our own request", () => {
    const url = authorizeUrl({ appId: "ABC", appSecret: "abc", redirectUrl: "https://x/cb", state: "st-1", seq: 123 });
    const q = new URL(url).searchParams;
    expect(q.get("state")).toBe("st-1");
    expect(q.get("authorization")).toBe(signAuthorize("ABC", 123, "abc"));
    expect(q.get("grantType")).toBe("authorization_code");
  });
});

describe("the hundred-day blob", () => {
  const hex = (days: [number, number][]) =>
    days.map(([w, h]) => w.toString(16).padStart(4, "0") + h.toString(16).padStart(2, "0")).join("");
  const pad = (head: [number, number][]) =>
    hex([...head, ...Array.from({ length: 100 - head.length }, () => [0, 0] as [number, number])]);

  it("reads the current day first, as the protocol states", () => {
    const r = decodeHundredDaysKwh(pad([[12, 34], [7, 5]]));
    expect(r.ok && r.days[0]).toBe(12.34);
    expect(r.ok && r.days[1]).toBe(7.05);
  });

  it("returns exactly 100 days", () => {
    const r = decodeHundredDaysKwh(pad([]));
    expect(r.ok && r.days.length).toBe(100);
  });

  it("refuses a blob of the wrong length rather than decoding part of it", () => {
    expect(decodeHundredDaysKwh("00").ok).toBe(false);
  });

  it("refuses anything that is not hex", () => {
    expect(decodeHundredDaysKwh("z".repeat(600)).ok).toBe(false);
  });

  // The guard that matters: a fractional byte above 99 means the three bytes
  // are not whole/whole/hundredths, so the READING is wrong — better to
  // refuse than to bill somebody on a misread blob.
  it("refuses a blob whose fractional byte cannot be hundredths", () => {
    const r = decodeHundredDaysKwh(pad([[1, 0xff]]));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/fractional byte/);
  });

  it("proves itself against the device's own figure for today", () => {
    expect(todayAgrees([12.34], 12.34)).toBe(true);
    expect(todayAgrees([12.34], 12.35)).toBe(true); // both are 2-decimal
    expect(todayAgrees([12.34], 75)).toBe(false);
    expect(todayAgrees([], 0)).toBe(false);
  });
});
