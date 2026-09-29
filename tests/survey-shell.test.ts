import { describe, expect, it } from "vitest";
import {
  areaKeyOf,
  circuitGaps,
  contestedAreas,
  coordinatesPlausible,
  inventoryGaps,
  profileGaps,
  refuseSurveyWrite,
  resumeSection,
  sectionStates,
  submitBlockers,
} from "@/lib/survey-shell";

describe("survey sections", () => {
  it("reads untouched sections as not started and resumes at the first open one", () => {
    const s = sectionStates([
      { section: "profile", state: "complete" },
      { section: "inventory", state: "flagged" },
    ]);
    expect(s.circuits).toBe("not_started");
    expect(resumeSection(s)).toBe("circuits");
  });
});

describe("the lock after submission", () => {
  it("leaves a draft open, and closes a submitted survey to the field except in a queried section", () => {
    expect(refuseSurveyWrite({ status: "draft", sectionState: "complete", isOps: false })).toBeNull();
    expect(refuseSurveyWrite({ status: "submitted", sectionState: "complete", isOps: false })).toMatch(/read-only/);
    expect(refuseSurveyWrite({ status: "submitted", sectionState: "queried", isOps: false })).toBeNull();
  });
  it("lets operations correct a submitted survey — the office's forward-only count correction", () => {
    expect(refuseSurveyWrite({ status: "submitted", sectionState: "complete", isOps: true })).toBeNull();
  });
});

describe("profile (SCR-010)", () => {
  it("refuses a pin outside India and names each gap", () => {
    expect(coordinatesPlausible(28.6, 77.2)).toBe(true);
    expect(coordinatesPlausible(51.5, -0.1)).toBe(false);
    const gaps = profileGaps({ latitude: null, longitude: null, address: "", currentMembers: 1, primaryContact: false });
    expect(gaps).toHaveLength(3);
    expect(gaps[2]).toMatch(/primary contact/);
  });
  it("is complete with a pin, an address and a primary member", () => {
    expect(profileGaps({ latitude: 28.6, longitude: 77.2, address: "Sector 4", currentMembers: 2, primaryContact: true })).toEqual([]);
  });
});

describe("inventory (SCR-011)", () => {
  it("names a missing count, a missing type, an unexplained estimate and a contest", () => {
    const gaps = inventoryGaps(
      [
        { area: "Staircase — Tower A", lightType: "Staircase", count: 0, method: "walked", note: null },
        { area: "Basement parking — P1", lightType: "", count: 80, method: "estimated", note: "" },
      ],
      ["Lift lobby — Tower B"],
    );
    expect(gaps).toEqual([
      "Staircase — Tower A: enter how many lights are in this area.",
      "Basement parking — P1: which type of lighting is this?",
      "Basement parking — P1: say how the estimate was made.",
      "Lift lobby — Tower B was counted by two people — settle it before completing.",
    ]);
  });
});

describe("area claims (§0.1b)", () => {
  it("keys an area by its type and name, ignoring case and spacing", () => {
    expect(areaKeyOf("staircase", " Tower  B ", "")).toBe(areaKeyOf("staircase", "tower b", ""));
    expect(areaKeyOf("staircase", "Tower B", "")).not.toBe(areaKeyOf("lift_lobby", "Tower B", ""));
  });
  it("marks an area contested only when two people counted it — never one person's two rows", () => {
    const rows = [
      { id: "1", areaKey: "staircase|tower b", countedById: "priya" },
      { id: "2", areaKey: "staircase|tower b", countedById: "ravi" },
      { id: "3", areaKey: "basement|p1", countedById: "ravi" },
      { id: "4", areaKey: "basement|p1", countedById: "ravi" },
    ];
    const c = contestedAreas(rows);
    expect([...c.keys()]).toEqual(["staircase|tower b"]);
    expect(c.get("staircase|tower b")!.map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("circuits (SCR-012)", () => {
  it("needs an outcome for every light type the inventory found", () => {
    expect(circuitGaps({ inventoryTypes: [], resolvedTypeKeys: new Set() })[0]).toMatch(/Count the lighting first/);
    expect(
      circuitGaps({
        inventoryTypes: [
          { key: "staircase", label: "Staircase" },
          { key: "basement", label: "Basement" },
        ],
        resolvedTypeKeys: new Set(["staircase"]),
      }),
    ).toEqual(["Basement: select a circuit, or say why none is eligible."]);
  });
});

describe("submission", () => {
  it("names every section not finished, every contest and every teammate with work on their phone", () => {
    const states = sectionStates([
      { section: "profile", state: "complete" },
      { section: "inventory", state: "complete" },
      { section: "circuits", state: "in_progress" },
      { section: "pump_room", state: "flagged" },
    ]);
    expect(submitBlockers({ states, contestedAreas: ["Staircase — Tower B"], teammatesPending: [{ name: "Priya", count: 3 }] })).toEqual([
      "Circuit selection is not finished.",
      "Staircase — Tower B was counted by two people — settle it first.",
      "Priya's phone still has 3 items to send — ask them to open the app with signal.",
    ]);
  });
  it("is clear when every section is complete or flagged", () => {
    const states = sectionStates([
      { section: "profile", state: "complete" },
      { section: "inventory", state: "complete" },
      { section: "circuits", state: "complete" },
      { section: "pump_room", state: "flagged" },
    ]);
    expect(submitBlockers({ states, contestedAreas: [], teammatesPending: [] })).toEqual([]);
  });
});
