import { describe, expect, it } from "vitest";
import { decideVoidCircuit, describeVoidBlock, hasProgress } from "@/lib/circuit-void";

const CREATOR = "user-creator";
const OTHER = "user-other";

const clean = {
  meterInstalledAt: null,
  preInstallBaseline: null,
  benchmarkSavingsPct: null,
  gatePassCount: 0,
  commissioningReadingCount: 0,
  meterReadingCount: 0,
  rescaleEventCount: 0,
  feeLineCount: 0,
  releasedFeeLineCount: 0,
};

function decide(over: Partial<Parameters<typeof decideVoidCircuit>[0]> = {}) {
  return decideVoidCircuit({
    actor: { id: CREATOR, isOps: false },
    createdById: CREATOR,
    alreadyVoided: false,
    reason: "added twice by mistake",
    facts: clean,
    ...over,
  });
}

describe("a circuit with nothing recorded against it", () => {
  it("can be removed by whoever added it", () => {
    expect(decide()).toEqual({ allowed: true, tier: "untouched" });
    // A candidate added twice during a survey is the field team's own
    // housekeeping — waiting on ops to tidy a typo buys no safety.
  });

  it("can be removed by ops", () => {
    expect(decide({ actor: { id: OTHER, isOps: true } })).toEqual({ allowed: true, tier: "untouched" });
  });

  it("cannot be removed by an unrelated non-ops account", () => {
    const d = decide({ actor: { id: OTHER, isOps: false } });
    expect(d.allowed).toBe(false);
    expect(d).toHaveProperty("reason", expect.stringMatching(/person who added this circuit/i));
  });

  it("falls through to ops-only when the creator is unknown", () => {
    // Every circuit predating the createdById column has a null creator.
    // Treating that as "anyone may claim it" would be the unsafe direction.
    expect(decide({ createdById: null, actor: { id: OTHER, isOps: false } }).allowed).toBe(false);
    expect(decide({ createdById: null, actor: { id: OTHER, isOps: true } }).allowed).toBe(true);
  });
});

describe("a circuit with commissioning work against it", () => {
  const withMeter = { ...clean, meterInstalledAt: new Date("2026-08-01") };

  it("is refused to its own creator", () => {
    const d = decide({ facts: withMeter });
    expect(d.allowed).toBe(false);
    expect(d).toHaveProperty("reason", expect.stringMatching(/operations lead action/i));
    // Voiding here discards work someone else did and evidence a later
    // figure may rest on — authorship stops being sufficient.
  });

  it("is allowed for ops", () => {
    expect(decide({ facts: withMeter, actor: { id: OTHER, isOps: true } })).toEqual({
      allowed: true,
      tier: "in_progress",
    });
  });

  it("counts every kind of recorded work as progress", () => {
    expect(hasProgress(clean)).toBe(false);
    expect(hasProgress({ ...clean, meterInstalledAt: new Date() })).toBe(true);
    expect(hasProgress({ ...clean, preInstallBaseline: 100 })).toBe(true);
    expect(hasProgress({ ...clean, benchmarkSavingsPct: 70 })).toBe(true);
    expect(hasProgress({ ...clean, gatePassCount: 1 })).toBe(true);
    expect(hasProgress({ ...clean, commissioningReadingCount: 1 })).toBe(true);
    expect(hasProgress({ ...clean, meterReadingCount: 1 })).toBe(true);
    expect(hasProgress({ ...clean, rescaleEventCount: 1 })).toBe(true);
    expect(hasProgress({ ...clean, feeLineCount: 1 })).toBe(true);
  });
});

describe("a circuit billed on a released invoice", () => {
  const billed = { ...clean, feeLineCount: 1, releasedFeeLineCount: 1 };

  it("cannot be removed by ops either — this is not a permission gap", () => {
    // GATE-02: released billing documents are append-only. Voiding the
    // circuit would silently unmake a line on an invoice the society holds.
    const d = decideVoidCircuit({
      actor: { id: OTHER, isOps: true },
      createdById: CREATOR,
      alreadyVoided: false,
      reason: "wrong circuit",
      facts: billed,
    });
    expect(d.allowed).toBe(false);
    expect(d).toHaveProperty("reason", expect.stringMatching(/already been shown/i));
  });

  it("points at the paths that do leave a record", () => {
    const d = decide({ facts: billed, actor: { id: OTHER, isOps: true } });
    expect(d).toHaveProperty("reason", expect.stringMatching(/amendment|deviation review/i));
  });

  it("refuses before it even asks for a reason", () => {
    // Order matters: prompting for a reason on an act that can never be
    // permitted would read as "give me the right words and it'll go through".
    const d = decide({ facts: billed, reason: "", actor: { id: OTHER, isOps: true } });
    expect(d).toHaveProperty("reason", expect.stringMatching(/already been shown/i));
  });

  it("still allows a fee line that has NOT been released", () => {
    expect(decide({ facts: { ...clean, feeLineCount: 1 }, actor: { id: OTHER, isOps: true } })).toEqual({
      allowed: true,
      tier: "in_progress",
    });
  });
});

describe("the shared refusals", () => {
  it("requires a stated reason", () => {
    expect(decide({ reason: "   " })).toHaveProperty("reason", expect.stringMatching(/record why/i));
  });

  it("refuses to void the same circuit twice", () => {
    expect(decide({ alreadyVoided: true })).toHaveProperty(
      "reason",
      expect.stringMatching(/already been removed/i),
    );
  });
});

describe("describeVoidBlock — what the screen says instead of offering it", () => {
  it("is silent when removal is available", () => {
    expect(describeVoidBlock(clean)).toBeNull();
  });

  it("names the circuit's own state, not the viewer's permissions", () => {
    expect(describeVoidBlock({ ...clean, gatePassCount: 1 })).toMatch(/commissioning work/i);
    expect(describeVoidBlock({ ...clean, releasedFeeLineCount: 1 })).toMatch(/Billed/i);
  });
});
