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

/**
 * The team whose work the next step is. A deal is not one person's job —
 * the lead is sales', the survey and the demo commissioning are the field
 * team's, and the money is operations'. Naming the owner on the action is
 * what lets a screen tell "your turn" from "waiting on somebody else"
 * (user-asked 2026-08-24: the survey step showed a blue Continue card to a
 * sales account whose task it was not).
 */
export type NextOwner = "sales" | "field" | "ops" | "society";

export type NextAction = {
  label: string;
  detail: string;
  href: string;
  owner: NextOwner;
};

export type DealProgress = {
  steps: DealStep[];
  /** Null when the deal is closed-lost or fully through to billing. */
  next: NextAction | null;
  /**
   * Where the deal is, for a header chip. Deliberately NOT Pipeline.stage:
   * that column only moves at commercial milestones (it sits at
   * `survey_pending` from the moment the proposal is agreed right through
   * the survey, commissioning and the benchmark), so a header reading
   * "Survey pending" sat directly above a map showing Site survey ✓ —
   * user-reported 2026-08-20. One source of truth or the two disagree.
   */
  phase: { label: string; tone: "ok" | "info" | "warn" | "bad" | "neu" };
};

export type CandidateFacts = {
  id: string;
  state: string;
  location: string | null;
  lightType: string;
  /**
   * Whether the light replacement has been handed to a crew. The circuit
   * STATE cannot say — `awaiting_installation` covers both sides of it — so
   * the deal-level label was telling an operator to record work nobody had
   * been asked to do (user-reported 2026-08-25).
   */
  replacementAssigned?: boolean;
};

export type DealFacts = {
  pipelineId: string;
  societyId: string;
  stage: string;
  authoritative: boolean;
  /** The field person the survey is assigned to, if anyone. */
  surveyOwnerName: string | null;
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

/**
 * What a mid-commissioning circuit needs next, in the operator's words.
 *
 * Kept in step with `circuitSteps()` by hand, which is exactly how it went
 * wrong twice: it still said "submit the completion gate pass, THEN record
 * the light replacement" months after that order was corrected, and it knew
 * nothing about the replacement being assigned first. Anything added to the
 * circuit spine has to be reflected here — the unit tests below assert the
 * two agree.
 */
export function circuitNextLabel(c: { state: string; replacementAssigned?: boolean }): string {
  const state = c.state;
  if (state === "awaiting_installation") {
    // The replacement is somebody's job before it is a record, and the
    // completion gate pass lists work that has to have happened first.
    return c.replacementAssigned
      ? "Record the light replacement, then submit the completion gate pass"
      : "Schedule the replacement and assign it to a crew";
  }
  switch (state) {
    case "surveyed":
      return "Awaiting the light-count exception decision";
    case "eligible":
      return "Install the meter and validate the load";
    case "meter_installed":
      return "Submit the install gate pass";
    case "pre_install_monitoring":
      return "Record daily readings — 5 valid days set the baseline";
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
  // The demo proposal is recorded on the deal page itself, so "go and do it"
  // used to link to the page the reader was already looking at — a Continue
  // button that did nothing (user-reported twice). The step opens the form
  // instead, which is also what lets Cancel close it again.
  const proposalHref = `${base}?step=proposal`;
  const closed = f.stage === "closed_lost";

  // -- Per-step completion facts ------------------------------------------
  const leadDone = f.stage !== "lead" && f.stage !== "closed_lost";
  const top = mostAdvancedCandidate(f.candidates);
  const surveyDone = top != null && top.state !== "surveyed" && top.state !== "ineligible";
  const benchmarkDone =
    f.demoSkipped || (top != null && (CIRCUIT_RANK[top.state] ?? 0) >= 7);
  // Generating and sharing are two different acts by two different rules —
  // the system generates automatically on BenchmarkConfirmed (FEAT-020-AC-1),
  // a person decides when the society sees it. They were one step whose
  // SUMMARY changed from "generate it" to "share it" while the title and the
  // styling stayed identical, so nothing signalled that the work had moved
  // on (user-reported 2026-08-20: "after generating, the system doesn't
  // point the user to the share step and the customer again gets confused").
  const reportGenerated = f.demoSkipped || f.reportStatus !== null;
  const reportShared = f.demoSkipped || f.reportStatus === "shared";
  const kycStarted = f.kyc.total > 0;
  const kycDone = kycStarted && f.kyc.resolved >= f.kyc.total;
  const offerDone = f.offerStatus === "accepted";
  const contractDone = f.contractStatus === "active" || f.contractStatus === "amended";
  const installDone = f.certificateSigned || f.stage === "active_billing";
  const billingLive = f.stage === "active_billing";

  // Assigning the field work is its own step in the spine, so it is its own
  // done-flag — leaving it out made every later step's index disagree with
  // the map's, and the survey read as locked while it was current.
  // …and it cannot be done before the lead is. Assigning early otherwise
  // marked step 2 complete while step 1 was still open, so the map showed the
  // assignment as finished and the deal sat on "record the demo proposal
  // decision" with no visible way forward (user-reported 2026-08-24). Nothing
  // past step 1 counts until the proposal decision is submitted.
  const surveyAssignedFlag = leadDone && (f.surveyOwnerName !== null || surveyDone);
  const doneFlags = [
    leadDone,
    surveyAssignedFlag,
    surveyDone,
    benchmarkDone,
    reportGenerated,
    reportShared,
    offerDone,
    contractDone,
    installDone,
    billingLive,
  ];
  // The current step is the first not-done one along the spine (KYC is
  // handled separately as the parallel track).
  const currentIdx = closed ? -1 : doneFlags.findIndex((d) => !d);

  const status = (idx: number, done: boolean): StepStatus => {
    if (done) return "done";
    if (closed) return "locked";
    return idx === currentIdx ? "current" : "locked";
  };

  const circuitHref = top ? `/admin/societies/${f.societyId}/circuits/${top.id}` : undefined;

  const surveyAssigned = surveyAssignedFlag;

  const steps: DealStep[] = [
    {
      key: "lead",
      title: "Lead & demo proposal",
      status: status(0, leadDone),
      summary: leadDone
        ? "Proposal agreed — advanced to survey"
        : !f.authoritative
          ? "Pending the sales owner's approval — it can't advance until they approve it"
          : "Record the demo-meeting outcome",
      href: leadDone || !f.authoritative ? base : proposalHref,
    },
    {
      key: "assign-survey",
      title: "Assign the survey",
      status: status(1, surveyAssigned || surveyDone),
      summary: surveyAssigned && f.surveyOwnerName
        ? `Assigned to ${f.surveyOwnerName}`
        : surveyAssigned
          ? "No stored record — the survey went ahead without one"
          : surveyDone
          ? "Surveyed"
          : currentIdx === 1
            ? "Hand it to an engineer or inspector — they run the survey, not sales"
            : "Unlocks when the demo proposal is agreed",
      href: base,
    },
    {
      key: "survey",
      title: "Site survey",
      status: status(2, surveyDone),
      summary: surveyDone
        ? `${f.areaCount} areas · demo circuit selected`
        : currentIdx === 2
          ? f.candidates.length === 0
            ? "Record the lighting inventory by area, then pick the demo circuit"
            : "Candidate recorded — awaiting the eligibility decision"
          : "Unlocks when the demo proposal is agreed",
      href: f.surveyExists ? `${base}/survey` : undefined,
    },
    {
      key: "commissioning",
      title: "Demo commissioning",
      status: status(3, benchmarkDone),
      summary: f.demoSkipped
        ? "Skipped — ops-approved demo skip"
        : benchmarkDone
          ? "Benchmark confirmed"
          : currentIdx === 3 && top
            ? `${candidateLabel(top)}: ${circuitNextLabel(top)}`
            : "Unlocks when the survey selects a demo circuit — meter, baseline window, light replacement and benchmark all happen on the circuit page",
      href: circuitHref,
    },
    {
      key: "report",
      title: "Demo savings report",
      status: status(4, reportGenerated),
      summary: f.demoSkipped
        ? "Skipped with the demo"
        : reportGenerated
          ? "Generated from the confirmed benchmark"
          : currentIdx === 4
            // Generation is automatic on BenchmarkConfirmed (FEAT-020-AC-1),
            // so this state is only reached when the automatic run was
            // blocked — the screen names which circuit is holding it up.
            ? "Generates itself from the confirmed benchmark — open it if it hasn't"
            : "Unlocks when the benchmark is confirmed",
      href: `${base}/report`,
    },
    {
      key: "share-report",
      title: "Share the report with the society",
      status: status(5, reportShared),
      summary: f.demoSkipped
        ? "Skipped with the demo"
        : reportShared
          ? "Shared — visible in the society's portal"
          : currentIdx === 5
            ? "The draft is internal until you share it. Sharing is what puts it in the society's portal."
            : "Unlocks once the report exists",
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
      status: status(6, offerDone),
      summary: offerDone
        ? "Accepted by the society"
        : currentIdx === 5
          ? f.offerStatus === "issued" || f.offerStatus === "countered"
            ? "Issued — awaiting the society's decision in their portal"
            : "Generate the offer from the benchmark and issue it"
          : "Unlocks when the demo report is shared",
      href: `${base}/offer`,
    },
    {
      key: "agreement",
      title: "Agreement & contract",
      status: status(7, contractDone),
      summary: contractDone
        ? "Contract active"
        : currentIdx === 6
          ? kycDone
            ? "Prepare, execute and activate the agreement"
            : "Offer accepted — but KYC must be complete first (GATE-01)"
          : "Unlocks when the society accepts the offer",
      href: `${base}/agreement`,
    },
    {
      key: "installation",
      title: "Full installation",
      status: status(8, installDone),
      summary: installDone
        ? "Completion certificate signed"
        : currentIdx === 7
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
        ? { label: "Get the lead approved", detail: "The sales owner approves it on this page.", href: base, owner: "sales" }
        : { label: "Record the demo proposal decision", detail: "The outcome of the demo meeting moves this deal forward.", href: proposalHref, owner: "sales" };
    } else if (!surveyAssigned && !surveyDone) {
      // The act that was invisible: somebody has to hand the field work to a
      // named engineer or inspector before it is anyone's to do
      // (user-asked 2026-08-24).
      next = {
        label: "Assign the survey",
        detail: "An engineer or inspector runs it — pick who, on this page.",
        href: base,
        owner: "sales",
      };
    } else if (!surveyDone) {
      next =
        f.candidates.length === 0
          ? { label: "Run the site survey", detail: "Record the lighting inventory by area, then pick the demo circuit.", href: `${base}/survey`, owner: "field" }
          : { label: "Resolve the candidate's eligibility", detail: "The selected candidate is awaiting its eligibility decision on the survey page.", href: `${base}/survey`, owner: "field" };
    } else if (!benchmarkDone && top) {
      next = {
        label: circuitNextLabel(top),
        detail: `Commissioning continues on the circuit page for ${candidateLabel(top)}.`,
        href: circuitHref as string,
        owner: "field",
      };
    } else if (!reportGenerated) {
      next = {
        label: "Open the demo report",
        detail:
          "It generates itself once the benchmark confirms — if it hasn't, the screen names the circuit holding it up.",
        href: `${base}/report`,
        owner: "ops",
      };
    } else if (!reportShared) {
      next = {
        label: "Share the report with the society",
        detail: "The draft is internal. Sharing is what puts it in the society's portal.",
        href: `${base}/report`,
        owner: "sales",
      };
    } else if (!offerDone) {
      next =
        f.offerStatus === "issued" || f.offerStatus === "countered"
          ? { label: "Awaiting the society's offer decision", detail: "The office-bearer accepts or counters in their portal.", href: `${base}/offer`, owner: "society" }
          : { label: "Generate and issue the offer", detail: "Priced from the confirmed benchmark.", href: `${base}/offer`, owner: "sales" };
    } else if (!contractDone) {
      next = kycDone
        ? { label: "Execute the agreement", detail: "Prepare, print, sign and activate the contract.", href: `${base}/agreement`, owner: "sales" }
        : { label: "Complete KYC first", detail: "GATE-01 — the agreement can't proceed until every document is verified or waived.", href: `${base}/kyc`, owner: "sales" };
    } else if (!installDone) {
      next = {
        label: f.installationState == null ? "Set up the installation project" : "Run the installation",
        detail: "Batch plan, daily society-approved batches, then the completion certificate.",
        href: `${base}/installation`,
        owner: "field",
      };
    }
  }

  const annotated = annotateBlockers(steps);
  const current = annotated.find((x) => x.status === "current");
  const phase: DealProgress["phase"] = closed
    ? { label: "Closed / lost", tone: "bad" }
    : billingLive
      ? { label: "Active billing", tone: "ok" }
      : current
        ? { label: current.title, tone: "info" }
        : { label: "In progress", tone: "info" };

  return { steps: annotated, next, phase };
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
  /** Who the replacement was handed to, and when they are going. */
  replacementOwnerName: string | null;
  replacementScheduledAt: Date | null;
  lightReplacementDate: Date | null;
  benchmarkSavingsPct: number | null;
};

function formatVisitDay(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const date = `${day}-${month}-${d.getUTCFullYear()}`;
  return hh === "00" && mm === "00" ? date : `${date} · ${hh}:${mm}`;
}

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
  // The replacement is somebody's job before it is a record. It used to be a
  // form that appeared after the baseline window with nobody's name on it —
  // "there should be an option to first schedule the replacement and assign
  // it to the inspector/installation team" (the user, 2026-08-25).
  const replacementAssignedDone = c.replacementOwnerName != null || replacementDone;
  const benchmarkDone = c.benchmarkSavingsPct != null;

  // Replacement BEFORE the completion gate pass. CON-18's pass itemizes the
  // equipment that physically changed and is approved before the crew leaves
  // — it is a departure gate, and it cannot be written before the work it
  // lists. The screen used to ask for it first (user-reported 2026-08-24).
  const flags = [
    eligibilityDone,
    meterDone,
    installGateDone,
    baselineDone,
    replacementAssignedDone,
    replacementDone,
    completionGateDone,
    benchmarkDone,
  ];
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
    mk("assign-replacement", "Schedule & assign the replacement", replacementAssignedDone, cur === 4,
      c.replacementOwnerName
        ? c.replacementScheduledAt
          ? `${c.replacementOwnerName} · ${formatVisitDay(c.replacementScheduledAt)}`
          : `Assigned to ${c.replacementOwnerName} — no day booked yet`
        : "No stored record — the lifecycle advanced past this step",
      "Hand the replacement to an engineer or inspector and book the day with the society",
      "Unlocks once the baseline window completes"),
    mk("replacement", "Light replacement", replacementDone, cur === 5,
      "Recorded — the replacement day is excluded, the post window starts the day after",
      "Record what was installed and the date the last light was replaced below",
      "Unlocks once the replacement is assigned"),
    mk("completion-gate", "Completion gate pass", completionGateDone, cur === 6,
      "Submitted",
      "Itemize what was installed and removed, get it signed, and submit it — CON-18 requires it before the crew may leave site",
      "Unlocks once the replacement is recorded"),
    mk("benchmark", "Post-install window → benchmark", benchmarkDone, cur === 7,
      "Benchmark confirmed in CON-20's 60-80% band",
      c.state === "benchmark_review"
        ? "The measured result fell outside CON-20's band — resolve the review below"
        : "Record one reading per day below — 5 valid days compute the savings benchmark",
      "Unlocks once the completion gate pass is submitted"),
  ]);
}
