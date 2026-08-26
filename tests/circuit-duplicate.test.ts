import { describe, expect, it } from "vitest";
import { findDuplicateCircuit } from "@/lib/circuit-duplicate";

const basement = {
  id: "ckt-1",
  lightType: "basement",
  meteredLightCount: 96,
  location: "Basement",
  sourcePeriod: "2025-08",
};

describe("a second report of the same circuit", () => {
  it("is recognised by the light type and the count", () => {
    // Ace City's own case: a post-installation report built the circuit, then
    // the pre-installation report of the same lights built another.
    const v = findDuplicateCircuit(
      { lightType: "basement", meteredLightCount: 96, period: "2025-08" },
      [basement],
    );
    expect(v?.duplicate.id).toBe("ckt-1");
    expect(v?.reason).toContain("96 lights");
    expect(v?.reason).toContain("at Basement");
  });

  it("says so when both documents are filed under the same month", () => {
    const v = findDuplicateCircuit(
      { lightType: "basement", meteredLightCount: 96, period: "2025-08" },
      [basement],
    );
    expect(v?.reason).toContain("same month (2025-08)");
  });

  it("and does not claim that when the months differ", () => {
    const v = findDuplicateCircuit(
      { lightType: "basement", meteredLightCount: 96, period: "2026-01" },
      [basement],
    );
    expect(v).not.toBeNull();
    expect(v?.reason).not.toContain("same month");
  });

  it("matches whatever case the light type is written in", () => {
    expect(
      findDuplicateCircuit({ lightType: " Basement ", meteredLightCount: 96 }, [basement]),
    ).not.toBeNull();
  });
});

describe("a circuit that is genuinely another one", () => {
  it("a different light type is not a duplicate", () => {
    expect(
      findDuplicateCircuit({ lightType: "lift_lobby", meteredLightCount: 96 }, [basement]),
    ).toBeNull();
  });

  it("a different count is not a duplicate", () => {
    // Ace City's lift lobby is 80 lights against the basement's 96.
    expect(
      findDuplicateCircuit({ lightType: "basement", meteredLightCount: 80 }, [basement]),
    ).toBeNull();
  });

  it("and a society with no circuits at all is never one", () => {
    expect(findDuplicateCircuit({ lightType: "basement", meteredLightCount: 96 }, [])).toBeNull();
  });
});
