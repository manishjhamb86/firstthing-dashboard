import { describe, expect, it } from "vitest";
import { generateUnits, logbookMonths, pumpRoomGaps, refuseStructure, unitGap, type PumpStructure, type UnitAnswer } from "@/lib/pump-room";

const room = (over: Partial<PumpStructure> = {}): PumpStructure => ({
  pumpType: "Centrifugal",
  pumpHp: 7.5,
  pumpCount: 3,
  feedPipe: "2 in",
  outflowPipe: "3 in",
  vfdArrangement: "",
  towers: [
    { name: "Tower A", tanks: [{ type: "RCC", capacityL: 20000 }, { type: "RCC", capacityL: 20000 }] },
    { name: "Tower B", tanks: [{ type: "Sintex", capacityL: 5000 }] },
  ],
  ...over,
});

describe("the generated unit list (SCR-013 pass 2)", () => {
  it("writes itself from the structure: room units, a VFD per pump, two per tank", () => {
    const u = generateUnits(room());
    expect(u.filter((x) => x.category === "vfd").map((x) => x.unitKey)).toEqual(["vfd:p1", "vfd:p2", "vfd:p3"]);
    expect(u.filter((x) => x.category === "float_switch").map((x) => x.label)).toEqual(["Tower A, Tank 1", "Tower A, Tank 2", "Tower B, Tank 1"]);
    expect(u).toHaveLength(2 + 3 + 1 + 3 * 2);
  });
  it("has one VFD when it is shared", () => {
    expect(generateUnits(room({ vfdArrangement: "shared" })).filter((x) => x.category === "vfd").map((x) => x.unitKey)).toEqual(["vfd:shared"]);
  });
});

describe("the room's structure (pass 1)", () => {
  it("refuses a pump size or count out of range, and names the tank missing its capacity", () => {
    expect(refuseStructure(room({ pumpHp: 0.1 }))).toMatch(/HP/);
    expect(refuseStructure(room({ pumpCount: 25 }))).toMatch(/Between 1 and 20/);
    expect(refuseStructure(room({ towers: [{ name: "Tower A", tanks: [{ type: "RCC", capacityL: null }] }] }))).toBe("Tower A, Tank 1: capacity in litres.");
    expect(refuseStructure(room())).toBeNull();
  });
  it("accepts a tower with no tanks — recording zero is fine", () => {
    expect(refuseStructure(room({ towers: [{ name: "Club house", tanks: [] }] }))).toBeNull();
  });
});

describe("a unit's answer", () => {
  const u = { unitKey: "float_switch:t2:k2", category: "float_switch" as const, label: "Tower B, Tank 2" };
  const a = (over: Partial<UnitAnswer>): UnitAnswer => ({ installed: true, brand: "Kalinda", model: "FS-1", condition: "working", photos: 1, ...over });
  it("ends at 'not fitted' — nothing else is asked", () => {
    expect(unitGap(u, a({ installed: false, brand: "", model: "", condition: null, photos: 0 }))).toBeNull();
  });
  it("names the unit when an installed one has no photo", () => {
    expect(unitGap(u, a({ photos: 0 }))).toBe("Tower B, Tank 2 — float switch / level sensor needs a photo — an installed item without one isn't a complete audit.");
  });
  it("asks whether one is fitted when unanswered", () => {
    expect(unitGap(u, undefined)).toMatch(/is one fitted/);
  });
});

describe("completing the section", () => {
  it("needs every unit answered and the logbook photographed or marked not maintained", () => {
    const s = room({ pumpCount: 1, towers: [] });
    const answers = new Map(generateUnits(s).map((u) => [u.unitKey, { installed: false, brand: "", model: "", condition: null, photos: 0 } as UnitAnswer]));
    expect(pumpRoomGaps({ structure: s, answers, logbookNotMaintained: false, logbookPages: 0 })).toEqual(["Add the towers the room serves."]);
    const s2 = room({ pumpCount: 1, towers: [{ name: "A", tanks: [] }] });
    const answers2 = new Map(generateUnits(s2).map((u) => [u.unitKey, { installed: false, brand: "", model: "", condition: null, photos: 0 } as UnitAnswer]));
    expect(pumpRoomGaps({ structure: s2, answers: answers2, logbookNotMaintained: false, logbookPages: 0 })).toEqual([
      "Photograph the logbook, or record that it isn't maintained.",
    ]);
    expect(pumpRoomGaps({ structure: s2, answers: answers2, logbookNotMaintained: true, logbookPages: 0 })).toEqual([]);
  });
  it("offers this month and the 12 before it for a logbook page", () => {
    const m = logbookMonths(new Date("2026-09-29T10:00:00Z"));
    expect(m[0]).toBe("2026-09");
    expect(m[12]).toBe("2025-09");
    expect(m).toHaveLength(13);
  });
});
