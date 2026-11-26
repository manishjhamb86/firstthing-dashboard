import { describe, expect, it } from "vitest";
import { refuseInstallationCorrector } from "@/lib/installation-dates";

const base = { demo: false, canOpenInstallation: true, certified: false, superAdmin: false, reason: "typo" };

describe("refuseInstallationCorrector", () => {
  it("any installation admin may correct before the certificate", () => {
    expect(refuseInstallationCorrector(base)).toBeNull();
  });
  it("after the certificate only the main admin may", () => {
    expect(refuseInstallationCorrector({ ...base, certified: true })).toMatch(/only Yogesh/);
    expect(refuseInstallationCorrector({ ...base, certified: true, superAdmin: true })).toBeNull();
  });
  it("once live a reason is required; in demo mode it is not", () => {
    expect(refuseInstallationCorrector({ ...base, reason: " " })).toMatch(/Say why/);
    expect(refuseInstallationCorrector({ ...base, demo: true, reason: "" })).toBeNull();
  });
  it("needs installation access", () => {
    expect(refuseInstallationCorrector({ ...base, canOpenInstallation: false })).toMatch(/access/);
  });
});
