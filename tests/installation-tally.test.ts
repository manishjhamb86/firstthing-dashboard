import { describe, expect, it } from "vitest";
import { describeTally, installationTally } from "@/lib/installation-tally";

describe("installationTally", () => {
  it("counts installed for logged days, not their plan (the reported case)", () => {
    // 12 days planned to 1,653 but 1,151 installed, + 50 demo, 1,200 contracted.
    const days = Array.from({ length: 12 }, (_, i) => ({ plannedCount: i === 0 ? 1653 - 11 * 100 : 100, installedCount: i === 0 ? 1151 - 11 * 90 : 90 }));
    const t = installationTally(days, 50, 1200);
    expect(t.installed).toBe(1151);
    expect(t.totalInstalled).toBe(1201);
    expect(t.gap).toBe(1);
    expect(t.stillToInstall).toBe(0);
    expect(describeTally(t)).toBe("1,151 installed in 12 logged days + 50 on the demo circuit = 1,201 against 1,200 contracted — 1 over");
  });

  it("a shortfall on one day is not carried as owed; only unlogged days count their plan", () => {
    const t = installationTally(
      [
        { plannedCount: 300, installedCount: 100 },
        { plannedCount: 200, installedCount: null },
      ],
      0,
      500,
    );
    expect(t.expectedTotal).toBe(300);
    expect(t.gap).toBe(-200);
    expect(t.stillToInstall).toBe(400);
    expect(describeTally(t)).toBe("100 installed in 1 logged day + 200 planned for 1 day still to go = 300 against 500 contracted — 200 short");
  });

  it("nothing logged yet reads as the plan", () => {
    const t = installationTally([{ plannedCount: 400, installedCount: null }], 0, 400);
    expect(t.gap).toBe(0);
    expect(describeTally(t)).toBe("0 installed in 0 logged days + 400 planned for 1 day still to go = 400 against 400 contracted — reconciled");
  });
});
