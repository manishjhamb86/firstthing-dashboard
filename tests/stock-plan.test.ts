import { describe, expect, it } from "vitest";
import {
  allocatePlan,
  dealLightRequirements,
  docCode,
  drawFifo,
  installedCountChange,
  prStatusFrom,
  receivedPerLine,
  refuseIssue,
  refusePrLines,
  requiredFor,
  slipOutstanding,
  slipState,
} from "@/lib/stock-plan";

describe("allocatePlan", () => {
  it("shares free stock oldest deal first and never promises it twice", () => {
    const rows = allocatePlan(
      [
        { societyId: "new", itemTypeId: "batten", required: 200, installed: 0, withCrews: 0, onOrder: 0 },
        { societyId: "old", itemTypeId: "batten", required: 420, installed: 0, withCrews: 0, onOrder: 0 },
      ],
      new Map([["batten", 300]]),
      ["old", "new"],
    );
    expect(rows[1]).toMatchObject({ freeAllocated: 300, toBuy: 120 });
    expect(rows[0]).toMatchObject({ freeAllocated: 0, toBuy: 200 });
  });
  it("takes off installed, crew-held and on-order before free stock", () => {
    const [r] = allocatePlan([{ societyId: "s", itemTypeId: "x", required: 100, installed: 30, withCrews: 20, onOrder: 40 }], new Map([["x", 100]]), ["s"]);
    expect(r).toMatchObject({ freeAllocated: 10, toBuy: 0 });
  });
  it("never goes negative when more is installed than required", () => {
    const [r] = allocatePlan([{ societyId: "s", itemTypeId: "x", required: 5, installed: 9, withCrews: 0, onOrder: 0 }], new Map(), ["s"]);
    expect(r).toMatchObject({ freeAllocated: 0, toBuy: 0 });
  });
});

describe("dealLightRequirements", () => {
  const itemBy = new Map([["dt-batten", "it-batten"], ["dt-surface", "it-surface"]]);
  it("takes the offer's full installation in the demo's light model", () => {
    const { byItem, unmapped } = dealLightRequirements(
      [{ circuitId: "c1", representedLightCount: 420, demoLightCount: 18 }],
      new Map([["c1", { id: "c1", meteredLightCount: 18, lines: [{ count: 18, replacementDeviceTypeId: "dt-batten", excluded: false }] }]]),
      itemBy,
    );
    expect(byItem.get("it-batten")).toBe(420);
    expect(unmapped).toEqual([]);
  });
  it("takes the demo lights off an older offer's total", () => {
    const { byItem } = dealLightRequirements(
      [{ circuitId: "c1", representedLightCount: 100 }],
      new Map([["c1", { id: "c1", meteredLightCount: 20, lines: [{ count: 20, replacementDeviceTypeId: "dt-batten", excluded: false }] }]]),
      itemBy,
    );
    expect(byItem.get("it-batten")).toBe(80);
  });
  it("splits a mixed circuit by the demo's own mix and names an unmapped one", () => {
    const { byItem, unmapped } = dealLightRequirements(
      [
        { circuitId: "c1", representedLightCount: 100, demoLightCount: 0 },
        { circuitId: "c2", representedLightCount: 50, demoLightCount: 0 },
      ],
      new Map([
        ["c1", { id: "c1", meteredLightCount: 10, lines: [{ count: 7, replacementDeviceTypeId: "dt-batten", excluded: false }, { count: 3, replacementDeviceTypeId: "dt-surface", excluded: false }, { count: 5, replacementDeviceTypeId: null, excluded: true }] }],
        ["c2", { id: "c2", meteredLightCount: 10, lines: [{ count: 10, replacementDeviceTypeId: "dt-other", excluded: false }] }],
      ]),
      itemBy,
    );
    expect(byItem.get("it-batten")).toBe(70);
    expect(byItem.get("it-surface")).toBe(30);
    expect(unmapped).toEqual(["c2"]);
  });
});

describe("requiredFor", () => {
  it("prefers the typed line", () => {
    expect(requiredFor(420, 400)).toEqual({ quantity: 400, source: "typed" });
    expect(requiredFor(420, undefined)).toEqual({ quantity: 420, source: "deal" });
    expect(requiredFor(undefined, undefined)).toEqual({ quantity: 0, source: "none" });
  });
});

describe("purchase requirements", () => {
  const lines = [
    { id: "a", itemTypeId: "x", quantity: 100 },
    { id: "b", itemTypeId: "x", quantity: 50 },
    { id: "c", itemTypeId: "y", quantity: 2 },
  ];
  it("fills received stock into lines in order", () => {
    const got = receivedPerLine(lines, new Map([["x", 120]]));
    expect(got.get("a")).toBe(100);
    expect(got.get("b")).toBe(20);
    expect(got.get("c")).toBe(0);
    expect(prStatusFrom("sent", lines, got)).toBe("partly_received");
  });
  it("is received when every line has arrived, sent when nothing has", () => {
    expect(prStatusFrom("sent", lines, receivedPerLine(lines, new Map([["x", 150], ["y", 2]])))).toBe("received");
    expect(prStatusFrom("partly_received", lines, receivedPerLine(lines, new Map()))).toBe("sent");
    expect(prStatusFrom("draft", lines, receivedPerLine(lines, new Map([["x", 999]])))).toBe("draft");
  });
  it("asks why when ordering below the shortfall", () => {
    const l = [{ quantity: 100, shortfall: 120, unit: "pcs", name: "Batten", whole: true }];
    expect(refusePrLines(l, "")).toMatch(/say why/);
    expect(refusePrLines(l, "Rest from the next lot")).toBeNull();
    expect(refusePrLines([{ ...l[0]!, quantity: 1.5 }], "x")).toMatch(/whole pieces/);
  });
});

describe("issue slips", () => {
  it("codes run per month", () => {
    const on = new Date("2026-11-23T00:00:00Z");
    expect(docCode("IS", on, [])).toBe("IS-2611-001");
    expect(docCode("IS", on, ["IS-2611-013", "IS-2610-040", "PR-2611-099"])).toBe("IS-2611-014");
  });
  it("what is still held is issued less installed less returned", () => {
    const m = slipOutstanding(
      [
        { kind: "issue", itemTypeId: "x", quantity: 120, fromLocationId: "off", toLocationId: "emp" },
        { kind: "deploy", itemTypeId: "x", quantity: 86, fromLocationId: "emp", toLocationId: "site" },
        { kind: "return_to_office", itemTypeId: "x", quantity: 4, fromLocationId: "emp", toLocationId: "off" },
      ],
      "emp",
    );
    expect(m.get("x")).toEqual({ issued: 120, installed: 86, returned: 4, held: 30 });
  });
  it("is overdue past its date with anything held", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(slipState(new Date("2026-11-14T00:00:00Z"), 34, now)).toBe("overdue");
    expect(slipState(new Date("2026-11-25T00:00:00Z"), 1, now)).toBe("due_soon");
    expect(slipState(new Date("2026-12-01T00:00:00Z"), 1, now)).toBe("on_time");
    expect(slipState(new Date("2026-11-14T00:00:00Z"), 0, now)).toBe("closed");
  });
  it("refuses a slip that would be wrong as a whole", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    const ok = { employeeId: "e", societyId: "s", issuedOn: new Date("2026-11-23T00:00:00Z"), dueOn: new Date("2026-12-01T00:00:00Z"), lines: 1 };
    expect(refuseIssue(ok, now)).toBeNull();
    expect(refuseIssue({ ...ok, dueOn: new Date("2026-11-20T00:00:00Z") }, now)).toMatch(/before the issue date/);
    expect(refuseIssue({ ...ok, issuedOn: new Date("2026-11-24T00:00:00Z") }, now)).toMatch(/future/);
    expect(refuseIssue({ ...ok, lines: 0 }, now)).toMatch(/at least one/);
  });
  it("draws oldest first and says how much is short", () => {
    expect(drawFifo([{ batchId: "a", available: 30 }, { batchId: "b", available: 300 }], 100)).toEqual({ draws: [{ batchId: "a", quantity: 30 }, { batchId: "b", quantity: 70 }] });
    expect(drawFifo([{ batchId: "a", available: 30 }], 100)).toEqual({ short: 70 });
  });
});

describe("installedCountChange", () => {
  it("adds or takes off the difference", () => {
    expect(installedCountChange(3, 5)).toEqual({ add: 2, remove: 0 });
    expect(installedCountChange(5, 1)).toEqual({ add: 0, remove: 4 });
  });
});
