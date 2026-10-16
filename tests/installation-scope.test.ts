import { describe, expect, it } from "vitest";
import { alreadyInstalledCount, remainingInstallationScope } from "@/lib/installation-scope";

describe("alreadyInstalledCount", () => {
  it("is the user's own reported shape: one demo circuit's 16 already replaced", () => {
    const circuits = [{ devices: [{ replacementCount: 16 }] }];
    expect(alreadyInstalledCount(circuits)).toBe(16);
  });

  it("sums across several circuits and several device lines", () => {
    const circuits = [
      { devices: [{ replacementCount: 16 }, { replacementCount: 4 }] },
      { devices: [{ replacementCount: 8 }] },
    ];
    expect(alreadyInstalledCount(circuits)).toBe(28);
  });

  it("is zero for a circuit whose replacement was never recorded", () => {
    expect(alreadyInstalledCount([{ devices: [{ replacementCount: null }] }])).toBe(0);
  });

  it("is zero with no circuits at all", () => {
    expect(alreadyInstalledCount([])).toBe(0);
  });
});

describe("remainingInstallationScope", () => {
  it("is the user's own worked example: 1155 surveyed, 16 already installed, 1139 remain", () => {
    expect(remainingInstallationScope(1155, 16)).toBe(1139);
  });

  it("never goes negative when a circuit's recorded replacement exceeds the raw survey tally", () => {
    expect(remainingInstallationScope(10, 16)).toBe(0);
  });

  it("is the full survey count when nothing has been installed yet", () => {
    expect(remainingInstallationScope(1155, 0)).toBe(1155);
  });
});
