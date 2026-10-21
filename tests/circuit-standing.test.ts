import { describe, expect, it } from "vitest";
import { isCircuitInactive } from "@/lib/circuit-standing";

const live = { voidedAt: null, siteSurvey: { pipeline: { closedLostStage: null, contract: null } } };

describe("isCircuitInactive", () => {
  it("is false for a null circuit — unknown stays permissive", () => expect(isCircuitInactive(null)).toBe(false));
  it("is false for a genuinely live circuit", () => expect(isCircuitInactive(live)).toBe(false));
  it("is true once voided", () => expect(isCircuitInactive({ ...live, voidedAt: new Date() })).toBe(true));
  it("is true once the deal closed lost, even with voidedAt null (the AIPL shape)", () => {
    expect(isCircuitInactive({ ...live, siteSurvey: { pipeline: { closedLostStage: "survey_pending", contract: null } } })).toBe(true);
  });
  it("is true once the contract is terminated", () => {
    expect(isCircuitInactive({ ...live, siteSurvey: { pipeline: { closedLostStage: null, contract: { status: "terminated" } } } })).toBe(true);
  });
  it("is false for an active contract", () => {
    expect(isCircuitInactive({ ...live, siteSurvey: { pipeline: { closedLostStage: null, contract: { status: "active" } } } })).toBe(false);
  });
  it("is false for a circuit with no survey at all — nothing to check", () => {
    expect(isCircuitInactive({ voidedAt: null, siteSurvey: null })).toBe(false);
  });
});
