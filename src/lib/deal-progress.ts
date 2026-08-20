// The deal spine, as a sequence the screens can actually show.
//
// User-reported defect (2026-08-15): the pipeline page rendered every stage
// as an equal button and the survey/circuit pages rendered everything at
// once, so there was no way to tell what was done, what was next, or where
// the next action even lived ("it was like a lost thing i couldnt find from
// where to add the circuit or what to do next").
//
// This module is the single place the ordering lives. It takes plain facts
// about a pipeline (or a circuit) and returns the ordered steps with a
// status each, plus THE one next action. Pure on purpose — the same
// convention as portal-authority.ts / benchmark-rescale.ts — so the
// sequencing rules are unit-testable without a request context.
//
// The order is the blueprint's own deal-to-bill spine (08-prioritization.md
// §3.1, MS-03..MS-08): lead → survey → demo commissioning → demo report →
// offer → agreement → installation → billing, with KYC as the one genuinely
// parallel track (CON-23: collected alongside the demo, needed before the
// agreement — GATE-01).

export type StepStatus = "done" | "current" | "parallel" | "locked";

export type DealStep = {
  key: string;
  title: string;
  status: StepStatus;
  /** done: what happened. current: what to do. locked: what unlocks it. */
  summary: string;
  /** Only reachable steps get a link — a locked step linking anyway is how
   *  the "everything at once" feel happens. */
  href?: string;
  /**
   * For a locked step: the earlier sequential step that has to finish first,
   * by its position in this list. "Unlocks when the demo report is shared"
   * says what the condition is but not where the work lives, and rendered as
   * plain muted text it looked identical to a completed step's summary —
   * user-reported 2026-08-20 ("its not attracting users attention and gets
   * hidden"). Naming the blocking step turns the map into a pointer.
   */
  blockedBy?: { index: number; title: string; href?: string };
  /**
   * Marks a step that runs alongside the spine rather than in it (KYC —
   * CON-23). It is never the reason a later step is locked, whatever its own
   * status happens to be: before the lead is approved KYC reads "locked"
   * too, and without this flag the offer would have reported itself blocked
   * by a document collection it does not depend on.
   */
  parallelTrack?: true;
};

export type NextAction = { label: string; detail: string; href: string };

export type DealProgress = {
  steps: DealStep[];
  /** Null when the deal is closed-lost or fully through to billing. */
  next: NextAction | null;
};

export type CandidateFacts = {
  id: string;
  state: string;
  location: string | null;
  lightType: string;
};

export type DealFacts = {
  pipelineId: string;
  societyId: string;
  stage: string;
  authoritative: boolean;
  demoSkipped: boolean;
  surveyExists: boolean;
  areaCount: number;
  candidates: CandidateFacts[];
  /** Latest report version, if any. */
  reportStatus: "draft" | "shared" | null;
  kyc: { total: number; resolved: number };
  /** Latest offer version, if any. */
  offerStatus: string | null;
  contractStatus: string | null;
  installationState: string | null;
  certificateSigned: boolean;
};

// How far along the commissioning lifecycle a circuit state is. Branch
// states (ineligible, benchmark_review) deliberately sit at the rank of the
// step they interrupt, not past it.
const CIRCUIT_RANK: Record<string, number> = {
  surveyed: 0,
  ineligible: 0,
  eligible: 1,
  meter_installed: 2,
  pre_install_monitoring: 3,
  awaiting_installation: 4,
  post_install_pending: 5,
  post_install_monitoring: 5,
  benchmark_review: 6,
  benchmark_confirmed: 7,
  active_billing: 7,
  retired: 7,
};

export function mostAdvancedCandidate(candidates: CandidateFacts[]): CandidateFacts | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    (CIRCUIT_RANK[c.state] ?? 0) > (CIRCUIT_RANK[best.state] ?? 0) ? c : best,
  );
}

export function candidateLabel(c: CandidateFacts): string {
  return c.location || c.lightType;
}

/** What a mid-commissioning circuit needs next, in the operator's words. */
export function circuitNextLabel(state: string): string {
  switch (state) {
    case "surveyed":
      return "Awaiting the light-count exception decision";
    case "eligible":
      return "Install the meter and validate the load";
    case "meter_installed":
      return "Submit the install gate pass";
    case "pre_install_monitoring":
      return "Record daily readings — 5 valid days set the baseline";
    case "awaiting_installation":
      return "Submit the completion gate pass, then record the light replacement";
    case "post_install_pending":
    case "post_install_monitoring":
      return "Record daily readings — 5 valid days compute the benchmark";
    case "benchmark_review":
      return "Resolve the out-of-range result review";
    default:
      return "Open the circuit";
  }
}

/**
 * Fills in `blockedBy` for every locked step: the first EARLIER step that is
 * not done. Parallel steps are skipped deliberately — KYC runs alongside the
 * spine, so it is never the reason a later spine step is locked (GATE-01's
 * genuine KYC dependency is stated by the agreement step's own summary and
 * by the next action, not invented here).
 */
function annotateBlockers(steps: DealStep[]): DealStep[] {
  return steps.map((step, i) => {
    if (step.status !== "locked") return step;
    for (let j = i - 1; j >= 0; j--) {
      const earlier = steps[j];
      if (earlier.parallelTrack || earlier.status === "done" || earlier.status === "parallel") {
        continue;
      }
      return { ...step, blockedBy: { index: j + 1, title: earlier.title, href: earlier.href } };
    }
    return step;
  });
}

export function dealProgress(f: DealFacts): DealProgress {
  const base = `/admin/pipeline/${f.pipelineId}`;
  const closed = f.stage === "closed_lost";

  // -- Per-step completion facts ------------------------------------------
  const leadDone = f.stage !== "lead" && f.stage !== "closed_lost";
  const top = mostAdvancedCandidate(f.candidates);
  const surveyDone = top != null && top.state !== "surveyed" && top.state !== "ineligible";
  const benchmarkDone =
    f.demoSkipped || (top != null && (CIRCUIT_RANK[top.state] ?? 0) >= 7);
  const reportDone = f.demoSkipped || f.reportStatus === "shared";
  const kycStarted = f.kyc.total > 0;
  const kycDone = kycStarted && f.kyc.resolved >= f.kyc.total;
  const offerDone = f.offerStatus === "accepted";
  const contractDone = f.contractStatus === "active" || f.contractStatus === "amended";
  const installDone = f.certificateSigned || f.stage === "active_billing";
  const billingLive = f.stage === "active_billing";

  const doneFlags = [leadDone, surveyDone, benchmarkDone, reportDone, offerDone, contractDone, installDone, billingLive];
  // The current step is the first not-done one along the spine (KYC is
  // handled separately as the parallel track).
  const currentIdx = closed ? -1 : doneFlags.findIndex((d) => !d);

  const status = (idx: number, done: boolean): StepStatus => {
    if (done) return "done";
    if (closed) return "locked";
    return idx === currentIdx ? "current" : "locked";
  };

  const circuitHref = top ? `/admin/societies/${f.societyId}/circuits/${top.id}` : undefined;

  const steps: DealStep[] = [
    {
      key: "lead",
      title: "Lead & demo proposal",
      status: status(0, leadDone),
      summary: leadDone
        ? "Proposal agreed — advanced to survey"
        : !f.authoritative
          ? "Pending the sales owner's approval — it can't advance until they approve it"
          : "Record the demo-meeting outcome below",
      href: base,
    },
    {
      key: "survey",
      title: "Site survey",
      status: status(1, surveyDone),
      summary: surveyDone
        ? `${f.areaCount} areas · demo circuit selected`
        : currentIdx === 1
          ? f.candidates.length === 0
            ? "Record the lighting inventory by area, then pick the demo circuit"
            : "Candidate recorded — awaiting the eligibility decision"
          : "Unlocks when the demo proposal is agreed",
      href: f.surveyExists ? `${base}/survey` : undefined,
    },
    {
      key: "commissioning",
      title: "Demo commissioning",
      status: status(2, benchmarkDone),
      summary: f.demoSkipped
        ? "Skipped — ops-approved demo skip"
        : benchmarkDone
          ? "Benchmark confirmed"
          : currentIdx === 2 && top
            ? `${candidateLabel(top)}: ${circuitNextLabel(top.state)}`
            : "Unlocks when the survey selects a demo circuit — meter, baseline window, light replacement and benchmark all happen on the circuit page",
      href: circuitHref,
    },
    {
      key: "report",
      title: "Demo savings report",
      status: status(3, reportDone),
      summary: f.demoSkipped
        ? "Skipped with the demo"
        : reportDone
          ? "Shared with the society"
          : currentIdx === 3
            ? f.reportStatus === "draft"
              ? "Draft generated — review it and share it with the society"
              : "Generate the report from the confirmed benchmark"
            : "Unlocks when the benchmark is confirmed",
      href: `${base}/report`,
    },
    {
      key: "kyc",
      title: "KYC documents",
      parallelTrack: true,
      // The one genuinely parallel track — chased alongside the demo
      // (CON-23), but the agreement is gated on it (GATE-01).
      status: kycDone ? "done" : closed ? "locked" : leadDone ? "parallel" : "locked",
      summary: kycDone
        ? "All documents verified or waived"
        : kycStarted
          ? `${f.kyc.resolved} of ${f.kyc.total} resolved — runs alongside the demo; the agreement is gated on it`
          : "Runs alongside the demo — start collecting early; the agreement is gated on it",
      href: leadDone ? `${base}/kyc` : undefined,
    },
    {
      key: "offer",
      title: "Offer",
      status: status(4, offerDone),
      summary: offerDone
        ? "Accepted by the society"
        : currentIdx === 4
          ? f.offerStatus === "issued" || f.offerStatus === "countered"
            ? "Issued — awaiting the society's decision in their portal"
            : "Generate the offer from the benchmark and issue it"
          : "Unlocks when the demo report is shared",
      href: `${base}/offer`,
    },
    {
      key: "agreement",
      title: "Agreement & contract",
      status: status(5, contractDone),
      summary: contractDone
        ? "Contract active"
        : currentIdx === 5
          ? kycDone
            ? "Prepare, execute and activate the agreement"
            : "Offer accepted — but KYC must be complete first (GATE-01)"
          : "Unlocks when the society accepts the offer",
      href: `${base}/agreement`,
    },
    {
      key: "installation",
      title: "Full installation",
      status: status(6, installDone),
      summary: installDone
        ? "Completion certificate signed"
        : currentIdx === 6
          ? f.installationState == null
            ? "Set up the installation project and batch plan"
            : f.installationState === "planning"
              ? "Publish the batch plan, then run the daily batches"
              : "Run the daily batches through to the completion certificate"
          : "Unlocks when the contract is active",
      href: `${base}/installation`,
    },
    {
      key: "billing",
      title: "Monthly billing",
      status: billingLive ? "done" : "locked",
      summary: billingLive
        ? "Billing started the day after the certificate was signed (CON-22)"
        : "Starts automatically the day after the completion certificate is signed",
    },
  ];

  // -- The one next action ------------------------------------------------
  let next: NextAction | null = null;
  if (!closed && !billingLive) {
    if (!leadDone) {
      next = !f.authoritative
        ? { label: "Get the lead approved", detail: "The sales owner approves it on this page.", href: base }
        : { label: "Record the demo proposal decision", detail: "The outcome of the demo meeting moves this deal forward.", href: base };
    } else if (!surveyDone) {
      next =
        f.candidates.length === 0
          ? { label: "Run the site survey", detail: "Record the lighting inventory by area, then pick the demo circuit.", href: `${base}/survey` }
          : { label: "Resolve the candidate's eligibility", detail: "The selected candidate is awaiting its eligibility decision on the survey page.", href: `${base}/survey` };
    } else if (!benchmarkDone && top) {
      next = {
        label: circuitNextLabel(top.state),
        detail: `Commissioning continues on the circuit page for ${candidateLabel(top)}.`,
        href: circuitHref as string,
      };
    } else if (!reportDone) {
      next = {
        label: f.reportStatus === "draft" ? "Share the demo report" : "Generate the demo report",
        detail: "The society sees it in their portal once shared.",
        href: `${base}/report`,
      };
    } else if (!offerDone) {
      next =
        f.offerStatus === "issued" || f.offerStatus === "countered"
          ? { label: "Awaiting the society's offer decision", detail: "The office-bearer accepts or counters in their portal.", href: `${base}/offer` }
          : { label: "Generate and issue the offer", detail: "Priced from the confirmed benchmark.", href: `${base}/offer` };
    } else if (!contractDone) {
      next = kycDone
        ? { label: "Execute the agreement", detail: "Prepare, print, sign and activate the contract.", href: `${base}/agreement` }
        : { label: "Complete KYC first", detail: "GATE-01 — the agreement can't proceed until every document is verified or waived.", href: `${base}/kyc` };
    } else if (!installDone) {
      next = {
        label: f.installationState == null ? "Set up the installation project" : "Run the installation",
        detail: "Batch plan, daily society-approved batches, then the completion certificate.",
        href: `${base}/installation`,
      };
    }
  }

  return { steps: annotateBlockers(steps), next };
}

// ---------------------------------------------------------------------------
// The circuit's own commissioning sequence — same idea, one level down.
// The circuit page already renders each stage's workspace conditionally;
// this gives it the map that was missing.
// ---------------------------------------------------------------------------

export type CircuitFactsForSteps = {
  state: string;
  hasInstallGatePass: boolean;
  hasCompletionGatePass: boolean;
  preInstallBaseline: number | null;
  lightReplacementDate: Date | null;
  benchmarkSavingsPct: number | null;
};

export function circuitSteps(c: CircuitFactsForSteps): DealStep[] {
  const rank = CIRCUIT_RANK[c.state] ?? 0;
  const mk = (key: string, title: string, done: boolean, current: boolean, doneSummary: string, currentSummary: string, lockedSummary: string): DealStep => ({
    key,
    title,
    status: done ? "done" : current ? "current" : "locked",
    summary: done ? doneSummary : current ? currentSummary : lockedSummary,
  });

  if (c.state === "ineligible") {
    return [
      {
        key: "eligibility",
        title: "Eligibility (CON-16)",
        status: "current",
        summary: "Failed a hard criterion — no exception path. Pick a different candidate on the survey.",
      },
    ];
  }

  // Done = the artifact exists OR the state machine is already past the
  // step. The state can only advance through these steps, so a circuit in
  // benchmark_review with no stored install gate pass (stage data predating
  // a feature, an ops override) must still read as past it — otherwise the
  // map marks an early step "current" while later ones read done, which is
  // exactly the incoherence a map exists to prevent.
  const eligibilityDone = rank >= 1;
  const meterDone = rank >= 2;
  const installGateDone = c.hasInstallGatePass || rank >= 3;
  const baselineDone = c.preInstallBaseline != null || rank >= 4;
  const completionGateDone = c.hasCompletionGatePass || rank >= 5;
  const replacementDone = c.lightReplacementDate != null || rank >= 5;
  const benchmarkDone = c.benchmarkSavingsPct != null;

  const flags = [eligibilityDone, meterDone, installGateDone, baselineDone, completionGateDone, replacementDone, benchmarkDone];
  const cur = flags.findIndex((d) => !d);

  return annotateBlockers([
    mk("eligibility", "Eligibility (CON-16)", eligibilityDone, cur === 0,
      "Passed the eligibility checklist",
      "Awaiting the light-count exception decision on the survey page",
      ""),
    mk("meter", "Meter install & load validation", meterDone, cur === 1,
      "Load validated within CON-17's ±10%",
      "Install the meter and validate its displayed load below",
      "Unlocks once the circuit is eligible"),
    mk("install-gate", "Install gate pass", installGateDone, cur === 2,
      "Submitted",
      "Submit the install gate pass below — submission unblocks the next step, approval follows",
      "Unlocks once the meter is installed"),
    mk("pre-window", "Pre-install baseline window", baselineDone, cur === 3,
      "Baseline set from 5 valid days",
      "Record one reading per day below — 5 consecutive valid days set the baseline",
      "Unlocks once the install gate pass is submitted"),
    mk("completion-gate", "Completion gate pass", completionGateDone, cur === 4,
      "Submitted",
      "Submit the completion gate pass below — required before the crew may leave site (CON-18)",
      "Unlocks once the baseline window completes"),
    mk("replacement", "Light replacement", replacementDone, cur === 5,
      "Recorded — the replacement day is excluded, the post window starts the day after",
      "Record the date the last light was replaced below",
      "Unlocks once the completion gate pass is submitted"),
    mk("benchmark", "Post-install window → benchmark", benchmarkDone, cur === 6,
      "Benchmark confirmed in CON-20's 60-80% band",
      c.state === "benchmark_review"
        ? "The measured result fell outside CON-20's band — resolve the review below"
        : "Record one reading per day below — 5 valid days compute the savings benchmark",
      "Unlocks once the replacement is recorded"),
  ]);
}
