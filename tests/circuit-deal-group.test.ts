import { describe, expect, it } from "vitest";
import { groupCircuitsByDeal } from "@/lib/circuit-deal-group";

type C = {
  id: string;
  siteSurveyId: string | null;
  location: string | null;
  lightType: string;
  demoLights: number;
  fullInstallation: number;
  isLive: boolean;
  state: string;
};

const c = (over: Partial<C> & { id: string }): C => ({
  siteSurveyId: "survey-1",
  location: "Basement",
  lightType: "TubeLight",
  demoLights: 0,
  fullInstallation: 1000,
  isLive: false,
  state: "benchmark_confirmed",
  ...over,
});

describe("groupCircuitsByDeal", () => {
  it("groups two circuits sharing a survey and location, combining demo lights", () => {
    const { groups, solo } = groupCircuitsByDeal([
      c({ id: "a", demoLights: 49, fullInstallation: 1395, isLive: false, state: "awaiting_installation" }),
      c({ id: "b", demoLights: 20, fullInstallation: 1395, isLive: true, state: "pre_install_monitoring" }),
    ]);
    expect(solo).toHaveLength(0);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Basement");
    expect(groups[0].combinedDemoLights).toBe(69);
    expect(groups[0].fullInstallationDisagreement).toBeNull();
    expect(groups[0].combinedTotal).toBe(69 + 1395);
    expect(groups[0].members.map((m) => m.isLive)).toEqual([false, true]);
  });

  it("flags disagreeing full-installation figures rather than picking one", () => {
    const { groups } = groupCircuitsByDeal([
      c({ id: "a", demoLights: 20, fullInstallation: 1375 }),
      c({ id: "b", demoLights: 49, fullInstallation: 1395 }),
    ]);
    expect(groups[0].fullInstallationDisagreement).toEqual([1375, 1395]);
    expect(groups[0].combinedTotal).toBeNull();
  });

  it("a circuit alone in its group stays solo", () => {
    const { groups, solo } = groupCircuitsByDeal([c({ id: "a" })]);
    expect(groups).toHaveLength(0);
    expect(solo.map((x) => x.id)).toEqual(["a"]);
  });

  it("never groups on a missing location, even sharing a survey", () => {
    const { groups, solo } = groupCircuitsByDeal([
      c({ id: "a", location: null }),
      c({ id: "b", location: null }),
    ]);
    expect(groups).toHaveLength(0);
    expect(solo.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("never groups circuits from different surveys, even with the same location text", () => {
    const { groups, solo } = groupCircuitsByDeal([
      c({ id: "a", siteSurveyId: "survey-1" }),
      c({ id: "b", siteSurveyId: "survey-2" }),
    ]);
    expect(groups).toHaveLength(0);
    expect(solo).toHaveLength(2);
  });

  it("location matching is case- and whitespace-insensitive", () => {
    const { groups } = groupCircuitsByDeal([
      c({ id: "a", location: "Basement" }),
      c({ id: "b", location: "  basement  " }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("three circuits on one deal all group together", () => {
    const { groups } = groupCircuitsByDeal([
      c({ id: "a", demoLights: 10 }),
      c({ id: "b", demoLights: 20 }),
      c({ id: "c", demoLights: 30 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].combinedDemoLights).toBe(60);
  });
});
