import type { ChipTone } from "@/components/ui";

// One place for every status → label + chip-tone pairing, so a state added
// to the schema gets its presentation decided once — the previous per-page
// Record<string,string> copies had already drifted (circuit-list.tsx
// carried a dead `benchmarking` key for a state the enum no longer has).

export type StatusMeta = { label: string; tone: ChipTone };

export const SOCIETY_STATUS: Record<string, StatusMeta> = {
  prospect: { label: "Prospect", tone: "info" },
  active: { label: "Active", tone: "ok" },
  suspended: { label: "Suspended", tone: "warn" },
  terminated: { label: "Terminated", tone: "bad" },
};

export const PIPELINE_STAGE: Record<string, StatusMeta> = {
  lead: { label: "Lead", tone: "info" },
  survey_pending: { label: "Survey pending", tone: "warn" },
  closed_lost: { label: "Closed / lost", tone: "bad" },
};

export const CIRCUIT_STATE: Record<string, StatusMeta> = {
  surveyed: { label: "Surveyed", tone: "neu" },
  eligible: { label: "Eligible", tone: "ok" },
  ineligible: { label: "Ineligible", tone: "bad" },
  meter_installed: { label: "Meter installed", tone: "info" },
  pre_install_monitoring: { label: "Pre-install monitoring", tone: "info" },
  awaiting_installation: { label: "Awaiting installation", tone: "warn" },
  post_install_pending: { label: "Post-install pending", tone: "warn" },
  post_install_monitoring: { label: "Post-install monitoring", tone: "info" },
  benchmark_confirmed: { label: "Benchmark confirmed", tone: "ok" },
  benchmark_review: { label: "Benchmark under review", tone: "warn" },
  active_billing: { label: "Active billing", tone: "ok" },
  retired: { label: "Retired", tone: "neu" },
};

export const GATE_PASS_STATUS: Record<string, StatusMeta> = {
  submitted: { label: "Submitted — awaiting approval", tone: "warn" },
  provisional: { label: "Provisionally released", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
};

export const ENGAGEMENT_STATUS: Record<string, StatusMeta> = {
  active: { label: "Active", tone: "ok" },
  inactive: { label: "Inactive", tone: "neu" },
};

export const SERVICE_LINE_LABEL: Record<string, string> = {
  lighting: "Lighting",
  pumps: "Water pumps",
  solar: "Solar",
  wastewater: "Wastewater",
};

export const PORTAL_AUTHORITY_LABEL: Record<string, string> = {
  office_bearer: "Office-bearer",
  committee: "Committee",
  manager: "Manager",
};

export function statusMeta(map: Record<string, StatusMeta>, key: string): StatusMeta {
  return map[key] ?? { label: key, tone: "neu" };
}
