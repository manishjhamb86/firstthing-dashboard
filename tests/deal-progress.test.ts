import { describe, expect, it } from "vitest";
import {
  circuitNextLabel,
  circuitSteps,
  dealProgress,
  mostAdvancedCandidate,
  type DealFacts,
} from "@/lib/deal-progress";

// A fresh lead: nothing beyond the pipeline row exists yet.
const freshLead: DealFacts = {
  pipelineId: "p1",
  societyId: "s1",
  stage: "lead",
  authoritative: true,
  surveyOwnerName: null,
  demoSkipped: false,
  surveyExists: false,
  areaCount: 0,
  candidates: [],
  reportStatus: null,
  kyc: { total: 0, resolved: 0 },
  offerStatus: null,
  contractStatus: null,
  installationState: null,
  certificateSigned: false,
};

const byKey = (f: DealFacts) =>
  Object.fromEntries(dealProgress(f).steps.map((s) => [s.key, s]));

describe("the spine has exactly one current step", () => {
  it("a fresh lead is current at the lead step, everything else locked (bar nothing)", () => {
    const { steps, next } = dealProgress(freshLead);
    expect(steps.filter((s) => s.status === "current").map((s) => s.key)).toEqual(["lead"]);
    expect(steps.filter((s) => s.status === "done")).toHaveLength(0);
    expect(next?.label).toBe("Record the demo proposal decision");
  });

  it("a non-authoritative lead's next action is the approval, not the proposal", () => {
    const { next } = dealProgress({ ...freshLead, authoritative: false });
    expect(next?.label).toBe("Get the lead approved");
  });

  it("locked steps carry no link — that IS the sequencing signal", () => {
    const steps = byKey(freshLead);
    expect(steps.offer.status).toBe("locked");
    expect(steps.offer.href).toBeDefined(); // href computed…
    const { steps: list } = dealProgress(freshLead);
    // …but the component only links reachable steps; the module must still
    // mark them locked so it can refuse.
    expect(list.find((s) => s.key === "agreement")?.status).toBe("locked");
  });
});

describe("survey and commissioning", () => {
  const surveyed: DealFacts = {
    ...freshLead,
    stage: "survey_pending",
    surveyOwnerName: "Neha Kapoor",
    surveyExists: true,
  };

  it("after the proposal, the survey is current and names both halves of its work", () => {
    const { steps, next } = dealProgress(surveyed);
    expect(steps.find((s) => s.key === "survey")?.status).toBe("current");
    expect(next?.label).toBe("Run the site survey");
  });

  it("a candidate awaiting its exception keeps the survey current, not commissioning", () => {
    const { steps, next } = dealProgress({
      ...surveyed,
      areaCount: 3,
      candidates: [{ id: "c1", state: "surveyed", location: null, lightType: "basement" }],
    });
    expect(steps.find((s) => s.key === "survey")?.status).toBe("current");
    expect(next?.label).toBe("Resolve the candidate's eligibility");
  });

  it("an eligible candidate moves the deal to commissioning, and next points AT THE CIRCUIT", () => {
    // This is the reported hole: "i couldnt find from where to add the
    // circuit or what to do next" — the next action must carry the circuit
    // page's own href, not the survey's.
    const { steps, next } = dealProgress({
      ...surveyed,
      areaCount: 3,
      candidates: [{ id: "c1", state: "eligible", location: "Basement B1", lightType: "basement" }],
    });
    expect(steps.find((s) => s.key === "commissioning")?.status).toBe("current");
    expect(next?.href).toBe("/admin/societies/s1/circuits/c1");
    expect(next?.label).toBe("Install the meter and validate the load");
  });

  it("commissioning progress is judged by the MOST advanced candidate", () => {
    const top = mostAdvancedCandidate([
      { id: "a", state: "surveyed", location: null, lightType: "basement" },
      { id: "b", state: "pre_install_monitoring", location: null, lightType: "stilt" },
      { id: "c", state: "eligible", location: null, lightType: "external" },
    ]);
    expect(top?.id).toBe("b");
  });

  it("benchmark_review does not read as a confirmed benchmark", () => {
    const { steps } = dealProgress({
      ...surveyed,
      candidates: [{ id: "c1", state: "benchmark_review", location: null, lightType: "basement" }],
    });
    expect(steps.find((s) => s.key === "commissioning")?.status).toBe("current");
    expect(steps.find((s) => s.key === "commissioning")?.summary).toMatch(/out-of-range/i);
  });
});

describe("report → offer → agreement → installation → billing", () => {
  const benchmarked: DealFacts = {
    ...freshLead,
    stage: "survey_pending",
    surveyOwnerName: "Neha Kapoor",
    surveyExists: true,
    areaCount: 3,
    candidates: [{ id: "c1", state: "benchmark_confirmed", location: null, lightType: "basement" }],
  };

  it("a confirmed benchmark makes the report current", () => {
    const { next } = dealProgress(benchmarked);
    // Not "generate": FEAT-020-AC-1 makes generation automatic on
    // BenchmarkConfirmed, so the action a person takes is to open it and
    // share it. Telling them to generate it reads like a chore nobody
    // assigned, and hid that the automatic run had failed.
    expect(next?.label).toBe("Open the demo report");
  });

  it("a drafted-but-unshared report is still the current step", () => {
    const { next } = dealProgress({ ...benchmarked, reportStatus: "draft" });
    expect(next?.label).toBe("Share the report with the society");
  });

  it("an issued offer waits on the society, and says so", () => {
    const { next } = dealProgress({ ...benchmarked, reportStatus: "shared", offerStatus: "issued" });
    expect(next?.label).toBe("Awaiting the society's offer decision");
  });

  it("an accepted offer with incomplete KYC routes next to KYC (GATE-01), not the agreement", () => {
    const { next, steps } = dealProgress({
      ...benchmarked,
      reportStatus: "shared",
      offerStatus: "accepted",
      kyc: { total: 3, resolved: 1 },
    });
    expect(steps.find((s) => s.key === "agreement")?.status).toBe("current");
    expect(next?.label).toBe("Complete KYC first");
    expect(next?.href).toBe("/admin/pipeline/p1/kyc");
  });

  it("with KYC done the agreement is the next action", () => {
    const { next } = dealProgress({
      ...benchmarked,
      reportStatus: "shared",
      offerStatus: "accepted",
      kyc: { total: 3, resolved: 3 },
    });
    expect(next?.label).toBe("Execute the agreement");
  });

  it("an active contract makes installation current", () => {
    const { next } = dealProgress({
      ...benchmarked,
      reportStatus: "shared",
      offerStatus: "accepted",
      kyc: { total: 3, resolved: 3 },
      contractStatus: "active",
    });
    expect(next?.label).toBe("Set up the installation project");
  });

  it("active billing ends the spine — no next action, billing marked done", () => {
    const { next, steps } = dealProgress({
      ...benchmarked,
      stage: "active_billing",
      reportStatus: "shared",
      offerStatus: "accepted",
      kyc: { total: 3, resolved: 3 },
      contractStatus: "active",
      installationState: "complete",
      certificateSigned: true,
    });
    expect(next).toBeNull();
    expect(steps.find((s) => s.key === "billing")?.status).toBe("done");
  });
});

describe("the KYC parallel track", () => {
  it("is locked on a fresh lead, parallel once the deal is moving, done when resolved", () => {
    expect(byKey(freshLead).kyc.status).toBe("locked");
    const moving = { ...freshLead, stage: "survey_pending", surveyExists: true, surveyOwnerName: "Neha Kapoor" };
    expect(byKey(moving).kyc.status).toBe("parallel");
    expect(byKey({ ...moving, kyc: { total: 3, resolved: 3 } }).kyc.status).toBe("done");
  });

  it("zero requirements is 'not started', never 'done'", () => {
    const moving = { ...freshLead, stage: "survey_pending", surveyExists: true, surveyOwnerName: "Neha Kapoor" };
    expect(byKey(moving).kyc.status).toBe("parallel");
    expect(byKey(moving).kyc.summary).toMatch(/start collecting early/i);
  });
});

describe("closed-lost and demo-skip", () => {
  it("closed-lost freezes the spine: no current step, no next action", () => {
    const { steps, next } = dealProgress({ ...freshLead, stage: "closed_lost" });
    expect(next).toBeNull();
    expect(steps.filter((s) => s.status === "current")).toHaveLength(0);
  });

  it("an ops-approved demo skip marks commissioning and report done without a benchmark", () => {
    const { steps, next } = dealProgress({
      ...freshLead,
      stage: "survey_pending",
      surveyOwnerName: "Neha Kapoor",
      surveyExists: true,
      demoSkipped: true,
      candidates: [{ id: "c1", state: "eligible", location: null, lightType: "basement" }],
    });
    expect(steps.find((s) => s.key === "commissioning")?.status).toBe("done");
    expect(steps.find((s) => s.key === "commissioning")?.summary).toMatch(/skip/i);
    expect(steps.find((s) => s.key === "report")?.status).toBe("done");
    expect(next?.label).toBe("Generate and issue the offer");
  });
});

describe("circuitSteps — the map one level down", () => {
  it("an eligible circuit is current at meter install", () => {
    const steps = circuitSteps({
      state: "eligible",
      hasInstallGatePass: false,
      hasCompletionGatePass: false,
      preInstallBaseline: null,
      lightReplacementDate: null,
      benchmarkSavingsPct: null,
    });
    expect(steps.find((s) => s.status === "current")?.key).toBe("meter");
    expect(steps.filter((s) => s.status === "current")).toHaveLength(1);
  });

  it("light replacement comes BEFORE the completion gate pass — the pass lists the work", () => {
    // This assertion used to read the other way round, on the grounds that
    // CON-18 is a departure gate. It is — and a departure gate is the LAST
    // thing that happens: the pass itemizes the equipment that physically
    // changed at the site, so it cannot be written before the work it lists.
    // FEAT-013-AC-1 has the same order ("records the replacement date and
    // completes the gate-pass sign-off"), and AC-3 gates marking the circuit
    // INSTALLED on the pass, not recording the work.
    const steps = circuitSteps({
      state: "awaiting_installation",
      hasInstallGatePass: true,
      hasCompletionGatePass: false,
      preInstallBaseline: 30,
      lightReplacementDate: null,
      benchmarkSavingsPct: null,
    });
    const keys = steps.map((s) => s.key);
    expect(keys.indexOf("replacement")).toBeLessThan(keys.indexOf("completion-gate"));
    expect(steps.find((s) => s.status === "current")?.key).toBe("replacement");
  });

  it("asks for the gate pass once the work is recorded, and not before", () => {
    const steps = circuitSteps({
      state: "awaiting_installation",
      hasInstallGatePass: true,
      hasCompletionGatePass: false,
      preInstallBaseline: 30,
      lightReplacementDate: new Date("2026-08-20"),
      benchmarkSavingsPct: null,
    });
    expect(steps.find((s) => s.status === "current")?.key).toBe("completion-gate");
    // And the benchmark step stays locked behind it — the crew has not left.
    expect(steps.find((s) => s.key === "benchmark")?.status).toBe("locked");
  });

  it("benchmark_review is current at the benchmark step and says why", () => {
    const steps = circuitSteps({
      state: "benchmark_review",
      hasInstallGatePass: true,
      hasCompletionGatePass: true,
      preInstallBaseline: 30,
      lightReplacementDate: new Date("2026-08-01"),
      benchmarkSavingsPct: null,
    });
    const cur = steps.find((s) => s.status === "current");
    expect(cur?.key).toBe("benchmark");
    expect(cur?.summary).toMatch(/outside CON-20/i);
  });

  it("ineligible collapses to the one step that matters", () => {
    const steps = circuitSteps({
      state: "ineligible",
      hasInstallGatePass: false,
      hasCompletionGatePass: false,
      preInstallBaseline: null,
      lightReplacementDate: null,
      benchmarkSavingsPct: null,
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].summary).toMatch(/no exception path/i);
  });

  it("a state past a step outranks a missing artifact — the map must stay coherent", () => {
    // The reported screenshot: a benchmark_review circuit with no stored
    // install gate pass showed step 3 as current while steps 4-6 read done.
    // The state machine can only reach benchmark_review THROUGH those steps,
    // so the missing artifact is a historical gap, not pending work.
    const steps = circuitSteps({
      state: "benchmark_review",
      hasInstallGatePass: false, // artifact missing…
      hasCompletionGatePass: false, // …both of them
      preInstallBaseline: 30,
      lightReplacementDate: null, // and this one too
      benchmarkSavingsPct: null,
    });
    expect(steps.find((s) => s.key === "install-gate")?.status).toBe("done");
    expect(steps.find((s) => s.key === "completion-gate")?.status).toBe("done");
    expect(steps.find((s) => s.key === "replacement")?.status).toBe("done");
    expect(steps.find((s) => s.status === "current")?.key).toBe("benchmark");
    expect(steps.filter((s) => s.status === "current")).toHaveLength(1);
  });

  it("every mid-lifecycle state has a next label in the operator's words", () => {
    for (const s of ["surveyed", "eligible", "meter_installed", "pre_install_monitoring", "awaiting_installation", "post_install_pending", "post_install_monitoring", "benchmark_review"]) {
      expect(circuitNextLabel(s)).not.toBe("Open the circuit");
    }
  });
});

describe("a locked step names what it is waiting on", () => {
  // "Unlocks when the demo report is shared" says the condition but not
  // where the work lives, and rendered as muted text it looked identical to
  // a completed step's summary (user-reported 2026-08-20).

  it("points at the first earlier step that is not done", () => {
    const steps = byKey(freshLead);
    // The NEAREST blocker, one link at a time: the survey waits on the
    // assignment, and the assignment waits on the lead. Before the assign
    // step existed the survey pointed straight at the lead; it should point
    // at whatever is actually next, not at the start of the chain.
    expect(steps.survey.blockedBy).toEqual({
      index: 2,
      title: "Assign the survey",
      href: "/admin/pipeline/p1",
    });
    expect(steps["assign-survey"].blockedBy).toEqual({
      index: 1,
      title: "Lead & demo proposal",
      href: "/admin/pipeline/p1",
    });
  });

  it("names the nearest blocker, not the first thing in the list", () => {
    // Lead and survey done; the deal sits at demo commissioning.
    const mid: DealFacts = {
      ...freshLead,
      stage: "survey_pending",
      surveyOwnerName: "Neha Kapoor",
      surveyExists: true,
      areaCount: 1,
      candidates: [{ id: "c1", state: "meter_installed", location: "Basement", lightType: "Tube" }],
    };
    const steps = byKey(mid);
    expect(steps.commissioning.status).toBe("current");
    // The offer is not waiting on the lead — it is waiting on the report,
    // which is waiting on commissioning.
    // The share step now sits between them, so it is the nearest blocker.
    expect(steps.offer.blockedBy?.title).toBe("Share the report with the society");
    expect(steps.report.blockedBy?.title).toBe("Demo commissioning");
  });

  it("skips the parallel KYC track — it never blocks a spine step", () => {
    // KYC runs alongside; treating it as a sequential blocker would tell the
    // operator the offer is held up by a document, which is not the rule.
    const withKyc: DealFacts = { ...freshLead, kyc: { total: 2, resolved: 0 } };
    const steps = byKey(withKyc);
    // Before the lead is approved KYC reads "locked" like anything else —
    // which is exactly why the skip is keyed on the track, not the status.
    expect(steps.kyc.status).toBe("locked");
    expect(steps.kyc.parallelTrack).toBe(true);
    for (const step of dealProgress(withKyc).steps) {
      expect(step.blockedBy?.title).not.toBe("KYC documents");
    }
    // …and once it is genuinely parallel, still never a blocker.
    const started = dealProgress({
      ...withKyc,
      stage: "survey_pending",
      surveyExists: true,
      areaCount: 1,
      candidates: [{ id: "c1", state: "meter_installed", location: null, lightType: "Tube" }],
    });
    expect(started.steps.find((x) => x.key === "kyc")?.status).toBe("parallel");
    for (const step of started.steps) {
      expect(step.blockedBy?.title).not.toBe("KYC documents");
    }
  });

  it("a done step and a current step never carry a blocker", () => {
    const done: DealFacts = {
      ...freshLead,
      stage: "active_billing",
      surveyExists: true,
      areaCount: 1,
      candidates: [{ id: "c1", state: "benchmark_confirmed", location: null, lightType: "Tube" }],
      reportStatus: "shared",
      offerStatus: "accepted",
      contractStatus: "active",
      certificateSigned: true,
    };
    for (const step of dealProgress(done).steps) {
      if (step.status !== "locked") expect(step.blockedBy).toBeUndefined();
    }
  });

  it("works one level down too — a circuit step names its own blocker", () => {
    const steps = circuitSteps({
      state: "eligible",
      hasInstallGatePass: false,
      hasCompletionGatePass: false,
      preInstallBaseline: null,
      lightReplacementDate: null,
      benchmarkSavingsPct: null,
    });
    const preWindow = steps.find((s) => s.key === "pre-window")!;
    expect(preWindow.status).toBe("locked");
    expect(preWindow.blockedBy?.title).toBe("Install gate pass");
  });
});

describe("the header phase agrees with the map", () => {
  // Pipeline.stage only moves at commercial milestones — it sits at
  // survey_pending from the agreed proposal right through the survey,
  // commissioning and the benchmark. A header reading it directly said
  // "Survey pending" above a map showing Site survey ✓ (user-reported
  // 2026-08-20).

  it("names the current step, not the stored stage", () => {
    const mid = dealProgress({
      ...freshLead,
      stage: "survey_pending",
      surveyOwnerName: "Neha Kapoor", // unchanged in the database…
      surveyExists: true,
      areaCount: 1,
      candidates: [{ id: "c1", state: "meter_installed", location: "Basement", lightType: "Tube" }],
    });
    expect(mid.steps.find((s) => s.key === "survey")?.status).toBe("done");
    // …so the phase must come from the map, or the two contradict.
    expect(mid.phase.label).toBe("Demo commissioning");
    expect(mid.phase.tone).toBe("info");
  });

  it("a fresh lead reads as the lead step", () => {
    expect(dealProgress(freshLead).phase.label).toBe("Lead & demo proposal");
  });

  it("closed-lost and live billing are their own phases, not a step", () => {
    expect(dealProgress({ ...freshLead, stage: "closed_lost" }).phase).toEqual({
      label: "Closed / lost",
      tone: "bad",
    });
    expect(
      dealProgress({
        ...freshLead,
        stage: "active_billing",
        surveyExists: true,
        areaCount: 1,
        candidates: [{ id: "c1", state: "benchmark_confirmed", location: null, lightType: "Tube" }],
        reportStatus: "shared",
        offerStatus: "accepted",
        contractStatus: "active",
        certificateSigned: true,
      }).phase,
    ).toEqual({ label: "Active billing", tone: "ok" });
  });
});

describe("generating the report and sharing it are separate steps", () => {
  // They were one step whose summary changed from "generate it" to "share
  // it" while the title and styling stayed identical — so nothing signalled
  // that the work had moved on, and the reader could not tell the new
  // sentence from the old one (user-reported 2026-08-20).

  const benchmarked: DealFacts = {
    ...freshLead,
    stage: "survey_pending",
    surveyOwnerName: "Neha Kapoor",
    surveyExists: true,
    areaCount: 1,
    candidates: [{ id: "c1", state: "benchmark_confirmed", location: null, lightType: "Tube" }],
  };

  it("with no report, the report step is current and sharing is locked behind it", () => {
    const steps = byKey(benchmarked);
    expect(steps.report.status).toBe("current");
    expect(steps["share-report"].status).toBe("locked");
    expect(steps["share-report"].blockedBy?.title).toBe("Demo savings report");
  });

  it("a generated draft completes the report step and moves the current one to sharing", () => {
    const steps = byKey({ ...benchmarked, reportStatus: "draft" });
    expect(steps.report.status).toBe("done");
    expect(steps.report.summary).toBe("Generated from the confirmed benchmark");
    expect(steps["share-report"].status).toBe("current");
    // The instruction is on its own row now, not a changed sentence.
    expect(steps["share-report"].summary).toContain("internal until you share it");
  });

  it("sharing completes both, and the offer opens", () => {
    const steps = byKey({ ...benchmarked, reportStatus: "shared" });
    expect(steps.report.status).toBe("done");
    expect(steps["share-report"].status).toBe("done");
    expect(steps["share-report"].summary).toContain("visible in the society's portal");
    expect(steps.offer.status).toBe("current");
  });

  it("a skipped demo skips both rather than stranding the share step", () => {
    const steps = byKey({ ...benchmarked, demoSkipped: true, candidates: [] });
    expect(steps.report.status).toBe("done");
    expect(steps["share-report"].status).toBe("done");
  });

  it("the phase chip names whichever of the two is current", () => {
    expect(dealProgress(benchmarked).phase.label).toBe("Demo savings report");
    expect(dealProgress({ ...benchmarked, reportStatus: "draft" }).phase.label).toBe(
      "Share the report with the society",
    );
  });
});
