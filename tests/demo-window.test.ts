import { describe, expect, it } from "vitest";
import { demoPhase, readingSection, refuseDemoWindows, windowDates, type DemoWindowFields } from "@/lib/demo-window";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const c: DemoWindowFields = {
  meterInstalledAt: d("2026-08-10"),
  lightReplacementDate: d("2026-08-17"),
  ...windowDates({ preFrom: "2026-08-11", preTo: "2026-08-15", postFrom: "2026-08-18", postTo: "2026-08-24" }),
};

describe("demo windows — the user's own example", () => {
  it("11–15 Aug are pre, 18–24 Aug are post, nothing else is a demo day", () => {
    expect(demoPhase(d("2026-08-11"), c)).toBe("pre");
    expect(demoPhase(d("2026-08-15"), c)).toBe("pre");
    expect(demoPhase(d("2026-08-16"), c)).toBe("outside");
    expect(demoPhase(d("2026-08-17"), c)).toBe("outside");
    expect(demoPhase(d("2026-08-18"), c)).toBe("post");
    expect(demoPhase(d("2026-08-24"), c)).toBe("post");
    expect(demoPhase(d("2026-08-25"), c)).toBe("outside");
    expect(demoPhase(d("2026-08-10"), c)).toBe("outside");
  });
  it("without windows, the old rule: after the meter until the replacement is pre, after it post", () => {
    const old = { ...c, preDemoFrom: null, preDemoTo: null, postDemoFrom: null, postDemoTo: null };
    expect(demoPhase(d("2026-08-16"), old)).toBe("pre");
    expect(demoPhase(d("2026-08-25"), old)).toBe("post");
    expect(demoPhase(d("2026-08-17"), old)).toBe("outside");
  });
  it("one window set, the other on the old rule", () => {
    const onlyPost = { ...c, preDemoFrom: null, preDemoTo: null };
    expect(demoPhase(d("2026-08-16"), onlyPost)).toBe("pre");
    expect(demoPhase(d("2026-08-25"), onlyPost)).toBe("outside");
  });
});

describe("refuseDemoWindows", () => {
  const cc = { meterInstalledAt: d("2026-08-10"), lightReplacementDate: d("2026-08-17") };
  const now = d("2026-09-25");
  it("accepts the example", () => expect(refuseDemoWindows({ preFrom: "2026-08-11", preTo: "2026-08-15", postFrom: "2026-08-18", postTo: "2026-08-24" }, cc, now)).toBeNull());
  it("a window needs both ends", () => expect(refuseDemoWindows({ preFrom: "2026-08-11", preTo: "", postFrom: "", postTo: "" }, cc, now)).toMatch(/both a start and an end/));
  it("pre cannot start on the meter day, nor reach the replacement", () => {
    expect(refuseDemoWindows({ preFrom: "2026-08-10", preTo: "2026-08-15", postFrom: "", postTo: "" }, cc, now)).toMatch(/day after/);
    expect(refuseDemoWindows({ preFrom: "2026-08-11", preTo: "2026-08-17", postFrom: "", postTo: "" }, cc, now)).toMatch(/before the lights/);
  });
  it("post starts after the replacement day, and not in the future", () => {
    expect(refuseDemoWindows({ preFrom: "", preTo: "", postFrom: "2026-08-17", postTo: "2026-08-20" }, cc, now)).toMatch(/day after/);
    expect(refuseDemoWindows({ preFrom: "", preTo: "", postFrom: "2026-09-20", postTo: "2026-09-30" }, cc, now)).toMatch(/future/);
  });
  it("clearing both windows is allowed", () => expect(refuseDemoWindows({ preFrom: "", preTo: "", postFrom: "", postTo: "" }, cc, now)).toBeNull());
});

describe("readingSection — which list a stored day is shown under", () => {
  const f = { ...c, benchmarkSavingsPct: 66.67, benchmarkFromDemos: false };
  it("with both periods set, only their days are pre/post; the rest are other readings", () => {
    expect(readingSection(d("2026-08-11"), f)).toBe("pre_install");
    expect(readingSection(d("2026-08-16"), f)).toBe("monitoring");
    expect(readingSection(d("2026-08-18"), f)).toBe("post_install");
    expect(readingSection(d("2026-08-24"), f)).toBe("post_install");
    expect(readingSection(d("2026-08-25"), f)).toBe("monitoring");
  });
  it("the install day and the replacement day are listed nowhere", () => {
    expect(readingSection(d("2026-08-10"), f)).toBeNull();
    expect(readingSection(d("2026-08-17"), f)).toBeNull();
  });
  it("no post period and a benchmark from the demos: later days are monthly readings", () => {
    const g = { ...f, postDemoFrom: null, postDemoTo: null, benchmarkFromDemos: true };
    expect(readingSection(d("2026-08-25"), g)).toBe("monitoring");
    expect(readingSection(d("2026-08-25"), { ...g, benchmarkFromDemos: false })).toBe("post_install");
  });
});
