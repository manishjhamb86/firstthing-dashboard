import { afterEach, describe, expect, it } from "vitest";
import { stageAccessGranted, stageAccessRequired } from "../src/lib/stage-access";

const ORIGINAL = process.env.STAGE_ACCESS_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.STAGE_ACCESS_SECRET;
  else process.env.STAGE_ACCESS_SECRET = ORIGINAL;
});

describe("stageAccessRequired / stageAccessGranted", () => {
  it("the gate is off when no secret is configured — matches production/dev, which carry neither", () => {
    delete process.env.STAGE_ACCESS_SECRET;
    expect(stageAccessRequired()).toBe(false);
    expect(stageAccessGranted(undefined)).toBe(true);
    expect(stageAccessGranted("anything")).toBe(true);
  });

  it("refuses a missing or wrong cookie once a secret is configured", () => {
    process.env.STAGE_ACCESS_SECRET = "the-real-secret";
    expect(stageAccessRequired()).toBe(true);
    expect(stageAccessGranted(undefined)).toBe(false);
    expect(stageAccessGranted("wrong-value")).toBe(false);
  });

  it("grants access on an exact match", () => {
    process.env.STAGE_ACCESS_SECRET = "the-real-secret";
    expect(stageAccessGranted("the-real-secret")).toBe(true);
  });
});
