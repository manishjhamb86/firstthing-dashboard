/**
 * The demo commissioning steps (2026-09-26, user-specified). Every demo walks
 * the full set, in this order:
 *
 *   Eligibility → Meter install & load test → Install gate pass →
 *   Pre-install period & readings → Schedule & assign the replacement →
 *   Light replacement → Completion gate pass → Post-install period & readings
 *
 * One pure function decides "you are here, do this next" for a demo, the same
 * convention as `dealProgress` one level up. The circuit page renders it; the
 * circuit's cached lifecycle state is derived from it (`demoCircuitState`), so
 * the deal map and every other reader of `Circuit.state` keep working.
 */
import type { DealStep, StepStatus } from "@/lib/deal-progress";

export type DemoStepFacts = {
  /** The circuit passed its eligibility checklist (a circuit-level fact). */
  eligible: boolean;
  meterInstalledAt: Date | null;
  /** The load test passed within tolerance, or operations overrode it. */
  loadValidated: boolean;
  hasInstallGatePass: boolean;
  prePeriodSet: boolean;
  preAccepted: boolean;
  /** Days changed since the last acceptance — the set needs re-accepting. */
  preChanged?: boolean;
  replacementOwnerName: string | null;
  replacementScheduledAt: Date | null;
  lightReplacementDate: Date | null;
  hasCompletionGatePass: boolean;
  postPeriodSet: boolean;
  postAccepted: boolean;
  postChanged?: boolean;
  /** The demo's own measured saving, once both sets are accepted. */
  savingsPct: number | null;
  inBand: boolean | null;
};

export type DemoStepKey =
  | "eligibility"
  | "meter"
  | "install-gate"
  | "pre-readings"
  | "assign-replacement"
  | "replacement"
  | "completion-gate"
  | "post-readings";

export type DemoStep = DealStep & { key: DemoStepKey };

function fmt(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const date = `${day}-${month}-${d.getUTCFullYear()}`;
  return hh === "00" && mm === "00" ? date : `${date} · ${hh}:${mm}`;
}

export function demoDoneFlags(f: DemoStepFacts): Record<DemoStepKey, boolean> {
  const meter = f.meterInstalledAt !== null && f.loadValidated;
  const replacement = f.lightReplacementDate !== null;
  return {
    eligibility: f.eligible,
    meter,
    "install-gate": f.hasInstallGatePass,
    "pre-readings": f.preAccepted,
    // The work is somebody's before it is a record: assigned AND booked.
    "assign-replacement": (f.replacementOwnerName !== null && f.replacementScheduledAt !== null) || replacement,
    replacement,
    "completion-gate": f.hasCompletionGatePass,
    "post-readings": f.postAccepted,
  };
}

export const DEMO_STEP_ORDER: DemoStepKey[] = [
  "eligibility",
  "meter",
  "install-gate",
  "pre-readings",
  "assign-replacement",
  "replacement",
  "completion-gate",
  "post-readings",
];

export function demoSteps(f: DemoStepFacts): DemoStep[] {
  const done = demoDoneFlags(f);
  const cur = DEMO_STEP_ORDER.findIndex((k) => !done[k]);
  const status = (k: DemoStepKey): StepStatus =>
    done[k] ? "done" : DEMO_STEP_ORDER.indexOf(k) === cur ? "current" : "locked";

  const steps: DemoStep[] = [
    {
      key: "eligibility",
      title: "Eligibility",
      status: status("eligibility"),
      summary: done.eligibility ? "Passed the eligibility checklist" : "Decided on the survey page",
    },
    {
      key: "meter",
      title: "Meter install & load test",
      status: status("meter"),
      summary: done.meter
        ? `Meter installed ${fmt(f.meterInstalledAt!)}`
        : f.meterInstalledAt && !f.loadValidated
          ? "The load test is outside ±10% — recheck, or operations overrides it"
          : "Pick the meter, the install date and validate its displayed load",
    },
    {
      key: "install-gate",
      title: "Install gate pass",
      status: status("install-gate"),
      summary: done["install-gate"] ? "Submitted" : "Submit the install gate pass — approval follows",
    },
    {
      key: "pre-readings",
      title: "Pre-install period & readings",
      status: status("pre-readings"),
      summary: done["pre-readings"]
        ? f.preChanged
          ? "Accepted — but days have changed since; re-accept to update the baseline"
          : "Accepted — the baseline is set"
        : !f.prePeriodSet
          ? "Choose the pre-install period"
          : "Review the period's days and accept them to set the baseline",
    },
    {
      key: "assign-replacement",
      title: "Schedule & assign the replacement",
      status: status("assign-replacement"),
      summary: done["assign-replacement"]
        ? f.replacementOwnerName && f.replacementScheduledAt
          ? `${f.replacementOwnerName} · ${fmt(f.replacementScheduledAt)}`
          : "Replacement recorded"
        : f.replacementOwnerName
          ? `Assigned to ${f.replacementOwnerName} — book the day with the society`
          : "Hand the replacement to a crew and book the day with the society",
    },
    {
      key: "replacement",
      title: "Light replacement",
      status: status("replacement"),
      summary: done.replacement
        ? `Replaced ${fmt(f.lightReplacementDate!)} — that day is left out of both periods`
        : "Record what was installed and the day the last light was replaced",
    },
    {
      key: "completion-gate",
      title: "Completion gate pass",
      status: status("completion-gate"),
      summary: done["completion-gate"]
        ? "Submitted"
        : "Itemize what was installed and removed, and submit it before the crew leaves",
    },
    {
      key: "post-readings",
      title: "Post-install period & readings",
      status: status("post-readings"),
      summary: done["post-readings"]
        ? f.savingsPct === null
          ? "Accepted"
          : f.postChanged
            ? `Accepted at ${f.savingsPct.toFixed(1)}% — days have changed since; re-accept to update`
            : `Accepted — ${f.savingsPct.toFixed(1)}% savings${f.inBand === false ? " (outside the 60–80% band)" : ""}`
        : !f.postPeriodSet
          ? "Choose the post-install period"
          : "Review the period's days and accept them to measure the saving",
    },
  ];

  // Name the step each locked one waits on.
  return steps.map((s, i) => {
    if (s.status !== "locked" || cur < 0) return s;
    const w = steps[cur];
    return i > cur ? { ...s, blockedBy: { index: cur + 1, title: w.title } } : s;
  });
}

export function demoComplete(f: DemoStepFacts): boolean {
  const done = demoDoneFlags(f);
  return DEMO_STEP_ORDER.every((k) => done[k]);
}

/** What the demo needs next, in the operator's words — read from the same steps. */
export function demoNextLabel(f: DemoStepFacts): string {
  const step = demoSteps(f).find((s) => s.status === "current");
  if (!step) return f.inBand === false ? "Resolve the out-of-range result" : "Open the circuit";
  switch (step.key) {
    case "eligibility":
      return "Awaiting the eligibility decision";
    case "meter":
      return "Install the meter and validate the load";
    case "install-gate":
      return "Submit the install gate pass";
    case "pre-readings":
      return f.prePeriodSet ? "Accept the pre-install readings" : "Choose the pre-install period";
    case "assign-replacement":
      return "Schedule the replacement and assign it to a crew";
    case "replacement":
      return "Record the light replacement";
    case "completion-gate":
      return "Submit the completion gate pass";
    case "post-readings":
      return f.postPeriodSet ? "Accept the post-install readings" : "Choose the post-install period";
  }
}

/**
 * The circuit lifecycle state a demo's progress stands for — the cache every
 * other reader of `Circuit.state` (deal map, dashboards, billing) keeps using.
 */
export function demoCircuitState(f: DemoStepFacts): string {
  const d = demoDoneFlags(f);
  if (!d.eligibility) return "surveyed";
  if (!d.meter) return "eligible";
  if (!d["install-gate"]) return "meter_installed";
  if (!d["pre-readings"]) return "pre_install_monitoring";
  if (!d.replacement || !d["completion-gate"]) return "awaiting_installation";
  if (!d["post-readings"]) return f.postPeriodSet ? "post_install_monitoring" : "post_install_pending";
  return f.inBand === false ? "benchmark_review" : "benchmark_confirmed";
}
