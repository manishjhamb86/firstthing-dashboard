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
  // NOT "Survey pending": this stage spans the agreed proposal right through
  // the survey, the commissioning and the benchmark — it only moves when the
  // demo report is shared. Labelled as the survey, it contradicted every
  // surface showing Site survey ✓ (user-reported 2026-08-20). The detail
  // header resolves the live step from dealProgress(); list surfaces show
  // this coarser stage, so it has to be true for the whole span.
  survey_pending: { label: "Demo in progress", tone: "info" },
  demo_reported: { label: "Demo reported", tone: "info" },
  offered: { label: "Offer issued", tone: "warn" },
  agreed: { label: "Agreed", tone: "ok" },
  installation: { label: "Installing", tone: "info" },
  active_billing: { label: "Active billing", tone: "ok" },
  closed_lost: { label: "Closed / lost", tone: "bad" },
};

// MS-05
export const KYC_REQUIREMENT_STATUS: Record<string, StatusMeta> = {
  outstanding: { label: "Outstanding", tone: "warn" },
  received: { label: "Received — awaiting verification", tone: "info" },
  verified: { label: "Verified", tone: "ok" },
  not_applicable: { label: "Not applicable", tone: "neu" },
};

export const KYC_FILE_STATE: Record<string, StatusMeta> = {
  pending: { label: "Awaiting verification", tone: "warn" },
  verified: { label: "Verified", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
};

export const RECEIPT_CHANNEL_LABEL: Record<string, string> = {
  portal: "Society portal",
  whatsapp: "WhatsApp",
  email: "Email",
  call: "Phone call",
  in_person: "In person",
};

export const OFFER_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neu" },
  issued: { label: "Issued — awaiting response", tone: "warn" },
  countered: { label: "Countered", tone: "info" },
  accepted: { label: "Accepted", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
};

export const DEMO_REPORT_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft — internal only", tone: "neu" },
  shared: { label: "Shared with the society", tone: "ok" },
};

export const CONTRACT_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neu" },
  active: { label: "Active", tone: "ok" },
  amended: { label: "Amended", tone: "info" },
  expired: { label: "Expired", tone: "neu" },
  terminated: { label: "Terminated", tone: "bad" },
};

export const BENCHMARK_SOURCE_LABEL: Record<string, string> = {
  measured: "Measured from the demo",
  negotiated_fixed: "Negotiated fixed (CON-25)",
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

// MS-06
export const BATCH_STATE: Record<string, StatusMeta> = {
  draft: { label: "In progress", tone: "neu" },
  awaiting_review: { label: "Awaiting the society", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  disputed: { label: "Disputed", tone: "bad" },
};

// CON-21's gate, as the field, ops and society surfaces each show it — one
// mapping so "blocked" never reads as a warning on one screen and an error
// on another.
export const DAY_GATE_STATUS: Record<string, StatusMeta> = {
  clear: { label: "Clear", tone: "ok" },
  pending: { label: "Awaiting review", tone: "info" },
  at_risk: { label: "Deadline near", tone: "warn" },
  blocked: { label: "Blocked", tone: "bad" },
  late_approved: { label: "Approved late", tone: "warn" },
  skipped: { label: "Gate skipped", tone: "warn" },
};

export const BLOCKER_TYPE_LABEL: Record<string, string> = {
  stock_shortage: "Stock shortage",
  access_denied: "Access denied",
  site_condition: "Site condition",
  count_discrepancy: "Count discrepancy",
  equipment_fault: "Equipment fault",
};

export const BLOCKER_STATUS: Record<string, StatusMeta> = {
  open: { label: "Open", tone: "bad" },
  resolved: { label: "Resolved", tone: "ok" },
  waived: { label: "Waived", tone: "warn" },
};

export const INSTALLATION_PROJECT_STATE: Record<string, StatusMeta> = {
  planning: { label: "Planning", tone: "neu" },
  published: { label: "In progress", tone: "info" },
  complete: { label: "Complete", tone: "ok" },
};

// MS-07
export const READING_UPLOAD_STATUS: Record<string, StatusMeta> = {
  pending_normalization: { label: "Awaiting mapping", tone: "warn" },
  awaiting_mapping: { label: "Confirm the mapping", tone: "warn" },
  ready: { label: "Ready to commit", tone: "info" },
  committed: { label: "Committed", tone: "ok" },
  abandoned: { label: "Abandoned", tone: "neu" },
  superseded: { label: "Superseded", tone: "neu" },
};

export const READING_ANOMALY_KIND: Record<string, StatusMeta> = {
  zero_reading: { label: "Zero reading", tone: "bad" },
  out_of_range: { label: "Out of range", tone: "bad" },
  day_over_day_jump: { label: "Day-over-day jump", tone: "bad" },
  missing_days: { label: "Missing days", tone: "warn" },
};

export const READING_ANOMALY_STATUS: Record<string, StatusMeta> = {
  open: { label: "Open", tone: "bad" },
  accepted: { label: "Accepted as real", tone: "ok" },
  excluded: { label: "Days excluded", tone: "info" },
  sent_back: { label: "Sent back for re-upload", tone: "warn" },
};
