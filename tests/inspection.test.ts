import { describe, expect, it } from "vitest";
import {
  faultyLightsCount,
  findMatchingLocation,
  inspectionSummary,
  refuseDiscardDraft,
  refuseFindingLocation,
  refuseInspectionFinalize,
  refuseInspectionStart,
  refuseVoidInspection,
  SENSOR_STATUS_META,
  type InspectionFinalizeInput,
  type InspectionStartInput,
} from "@/lib/inspection";

function startInput(overrides: Partial<InspectionStartInput> = {}): InspectionStartInput {
  return {
    area: "Basement",
    period: "2026-09",
    inspectedAt: new Date("2026-09-10T10:00:00Z"),
    inspectorName: "Ramesh Kumar",
    inspectorContact: "9876543210",
    ...overrides,
  };
}

const NOW = new Date("2026-09-12T00:00:00Z");

describe("refuseInspectionStart", () => {
  it("accepts a well-formed header", () => {
    expect(refuseInspectionStart(startInput(), { now: NOW, existingActiveForSlot: false })).toBeNull();
  });

  it("refuses a blank inspector name", () => {
    expect(
      refuseInspectionStart(startInput({ inspectorName: "  " }), { now: NOW, existingActiveForSlot: false }),
    ).toMatch(/inspector's name/i);
  });

  it("refuses a blank inspector contact", () => {
    expect(
      refuseInspectionStart(startInput({ inspectorContact: "" }), { now: NOW, existingActiveForSlot: false }),
    ).toMatch(/contact/i);
  });

  it("refuses a malformed period", () => {
    expect(
      refuseInspectionStart(startInput({ period: "September 2026" }), { now: NOW, existingActiveForSlot: false }),
    ).toMatch(/real month/i);
  });

  it("refuses a future inspection date", () => {
    expect(
      refuseInspectionStart(startInput({ inspectedAt: new Date("2026-09-13T00:00:00Z") }), {
        now: NOW,
        existingActiveForSlot: false,
      }),
    ).toMatch(/future/i);
  });

  it("accepts an inspection dated exactly now", () => {
    expect(refuseInspectionStart(startInput({ inspectedAt: NOW }), { now: NOW, existingActiveForSlot: false })).toBeNull();
  });

  it("refuses a duplicate slot (society, area, period already active)", () => {
    expect(refuseInspectionStart(startInput(), { now: NOW, existingActiveForSlot: true })).toMatch(/already exists/i);
  });
});

function finalizeInput(overrides: Partial<InspectionFinalizeInput> = {}): InspectionFinalizeInput {
  return { totalLightsChecked: 42, findings: [], ...overrides };
}

describe("refuseInspectionFinalize", () => {
  it("accepts a well-formed finalize with no findings", () => {
    expect(refuseInspectionFinalize(finalizeInput())).toBeNull();
  });

  it("refuses a negative total-checked figure", () => {
    expect(refuseInspectionFinalize(finalizeInput({ totalLightsChecked: -1 }))).toMatch(/non-negative/i);
  });

  it("refuses fewer lights checked than findings listed", () => {
    const input = finalizeInput({
      totalLightsChecked: 1,
      findings: [
        { srNo: 1, location: "Lift lobby A", sensorStatus: "off", physicalDamage: false, actionReplace: true, remarks: "" },
        { srNo: 2, location: "Lift lobby B", sensorStatus: "dim", physicalDamage: false, actionReplace: false, remarks: "" },
      ],
    });
    expect(refuseInspectionFinalize(input)).toMatch(/cannot be less/i);
  });

  it("accepts when total checked equals the finding count", () => {
    const input = finalizeInput({
      totalLightsChecked: 2,
      findings: [
        { srNo: 1, location: "Lift lobby A", sensorStatus: "off", physicalDamage: false, actionReplace: true, remarks: "" },
        { srNo: 2, location: "Lift lobby B", sensorStatus: "dim", physicalDamage: false, actionReplace: false, remarks: "" },
      ],
    });
    expect(refuseInspectionFinalize(input)).toBeNull();
  });

  it("refuses a finding row with a blank location", () => {
    const input = finalizeInput({
      totalLightsChecked: 1,
      findings: [{ srNo: 1, location: "  ", sensorStatus: "off", physicalDamage: false, actionReplace: true, remarks: "" }],
    });
    expect(refuseInspectionFinalize(input)).toMatch(/Row 1/);
  });
});

describe("faultyLightsCount / inspectionSummary", () => {
  it("derives the faulty count from the finding count, never a stored figure", () => {
    expect(faultyLightsCount(3)).toBe(3);
    expect(faultyLightsCount(0)).toBe(0);
  });

  it("computes the faulty percentage against the total checked", () => {
    expect(inspectionSummary({ totalLightsChecked: 200, findingsCount: 6 })).toEqual({
      totalLightsChecked: 200,
      faultyLightsCount: 6,
      faultyPct: 3,
    });
  });

  it("does not divide by zero when nothing was checked", () => {
    expect(inspectionSummary({ totalLightsChecked: 0, findingsCount: 0 }).faultyPct).toBe(0);
  });
});

describe("refuseVoidInspection", () => {
  it("refuses an already-voided inspection", () => {
    expect(refuseVoidInspection({ alreadyVoided: true, reason: "duplicate entry" })).toMatch(/already voided/i);
  });

  it("refuses a blank reason", () => {
    expect(refuseVoidInspection({ alreadyVoided: false, reason: "  " })).toMatch(/blank reason/i);
  });

  it("accepts a stated reason on a live inspection", () => {
    expect(refuseVoidInspection({ alreadyVoided: false, reason: "Filed against the wrong society" })).toBeNull();
  });
});

describe("SENSOR_STATUS_META", () => {
  it("covers every enum value with a label and tone", () => {
    for (const key of ["ok", "full", "dim", "off", "flicker"] as const) {
      expect(SENSOR_STATUS_META[key].label).toBeTruthy();
      expect(["ok", "warn", "bad"]).toContain(SENSOR_STATUS_META[key].tone);
    }
  });
});

describe("refuseFindingLocation", () => {
  it("a blank location is refused", () => {
    expect(refuseFindingLocation("")).toMatch(/location is required/i);
    expect(refuseFindingLocation("   ")).toMatch(/location is required/i);
  });
  it("a real location is accepted", () => {
    expect(refuseFindingLocation("Lift lobby 3rd floor")).toBeNull();
  });
});

describe("refuseDiscardDraft — \"no two users cancelling each other's work\" (2026-10-06, user-asked)", () => {
  it("an untouched draft, or one touched by one person, may be discarded", () => {
    expect(refuseDiscardDraft({ alreadyFinalized: false, alreadyVoided: false, distinctContributors: 0 })).toBeNull();
    expect(refuseDiscardDraft({ alreadyFinalized: false, alreadyVoided: false, distinctContributors: 1 })).toBeNull();
  });
  it("more than one contributor refuses, pointing at operations instead", () => {
    expect(refuseDiscardDraft({ alreadyFinalized: false, alreadyVoided: false, distinctContributors: 2 })).toMatch(/operations/i);
  });
  it("an already-finished or already-voided inspection cannot be discarded this way", () => {
    expect(refuseDiscardDraft({ alreadyFinalized: true, alreadyVoided: false, distinctContributors: 0 })).toMatch(/already finished/i);
    expect(refuseDiscardDraft({ alreadyFinalized: false, alreadyVoided: true, distinctContributors: 0 })).toMatch(/no longer exists/i);
  });
});

describe("findMatchingLocation — the duplicate nudge, never a block", () => {
  const existing = [
    { location: "Lift lobby 3rd floor", addedById: "a1" },
    { location: "Basement B2 ramp", addedById: "a2" },
  ];
  it("an exact, case-insensitive match is found", () => {
    expect(findMatchingLocation("lift lobby 3rd floor", existing)?.addedById).toBe("a1");
    expect(findMatchingLocation("  LIFT LOBBY 3RD FLOOR  ", existing)?.addedById).toBe("a1");
  });
  it("a genuinely different location finds nothing", () => {
    expect(findMatchingLocation("Terrace water tank", existing)).toBeNull();
  });
  it("a blank needle never matches", () => {
    expect(findMatchingLocation("   ", existing)).toBeNull();
  });
});
