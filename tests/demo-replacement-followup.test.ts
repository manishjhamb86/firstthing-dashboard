import { describe, it, expect } from "vitest";
import { remainingLinesOf, refuseMissingFollowUp, refuseCompleteFollowUp } from "@/lib/demo-replacement-followup";

describe("remainingLinesOf — the exact '47 of 50' shape", () => {
  it("a fully replaced line leaves nothing remaining", () => {
    expect(remainingLinesOf([{ lineId: "a", deviceTypeName: "Tube light", lineCount: 50, replacedCount: 50 }])).toEqual([]);
  });

  it("a partial line reports the gap", () => {
    expect(remainingLinesOf([{ lineId: "a", deviceTypeName: "Tube light", lineCount: 50, replacedCount: 47 }])).toEqual([
      { lineId: "a", deviceTypeName: "Tube light", remainingCount: 3 },
    ]);
  });

  it("only the partial lines are reported, among several", () => {
    const lines = [
      { lineId: "a", deviceTypeName: "Tube light", lineCount: 50, replacedCount: 47 },
      { lineId: "b", deviceTypeName: "Surface light", lineCount: 10, replacedCount: 10 },
    ];
    expect(remainingLinesOf(lines)).toEqual([{ lineId: "a", deviceTypeName: "Tube light", remainingCount: 3 }]);
  });
});

describe("refuseMissingFollowUp — a partial replacement needs a stated plan", () => {
  it("nothing remaining needs no plan at all", () => {
    expect(refuseMissingFollowUp([], null)).toBeNull();
  });

  it("something remaining with no plan is refused, naming the count", () => {
    const remaining = [{ lineId: "a", deviceTypeName: "Tube light", remainingCount: 3 }];
    expect(refuseMissingFollowUp(remaining, null)).toMatch(/3 lights/);
  });

  it("a plan with a blank reason is still refused", () => {
    const remaining = [{ lineId: "a", deviceTypeName: "Tube light", remainingCount: 3 }];
    expect(refuseMissingFollowUp(remaining, { plan: "field_revisit", reason: "   " })).toMatch(/why/i);
  });

  it("a plan with a real reason is accepted", () => {
    const remaining = [{ lineId: "a", deviceTypeName: "Tube light", remainingCount: 3 }];
    expect(refuseMissingFollowUp(remaining, { plan: "society_completes", reason: "Car parked under the fixture." })).toBeNull();
  });

  it("singular wording for exactly one light", () => {
    const remaining = [{ lineId: "a", deviceTypeName: "Tube light", remainingCount: 1 }];
    expect(refuseMissingFollowUp(remaining, null)).toMatch(/1 light was left/);
  });
});

describe("refuseCompleteFollowUp", () => {
  it("an open record may be completed", () => {
    expect(refuseCompleteFollowUp({ completedAt: null, voidedAt: null })).toBeNull();
  });
  it("an already-completed record refuses a second completion", () => {
    expect(refuseCompleteFollowUp({ completedAt: new Date(), voidedAt: null })).toMatch(/already/i);
  });
  it("a voided record refuses outright", () => {
    expect(refuseCompleteFollowUp({ completedAt: null, voidedAt: new Date() })).toMatch(/withdrawn/i);
  });
});
