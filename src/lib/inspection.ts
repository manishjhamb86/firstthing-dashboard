import type { InspectionSensorStatus } from "@prisma/client";

/**
 * The monthly inspection checklist — digitising FirsThing's own paper
 * "MOTION SENSOR LIGHT – QUICK INSPECTION CHECKLIST" form. Pure decision
 * logic only, so it unit-tests without a request context; the Server Action
 * is a thin shell around this, same convention as portal-authority.ts and
 * benchmark-rescale.ts.
 *
 * The paper form records ONLY faulty or notable fixtures — not a per-fixture
 * census — so a "finding" here is always one of those rows, never a healthy
 * one. The faulty count is deliberately never stored: it is `findings.length`
 * everywhere it is read, so it can never drift from the rows that back it,
 * unlike the paper form's own two separately hand-filled numbers.
 *
 * Filing is TWO acts, not one (2026-09-12, user-specified) — matching the
 * real walk: the header (who/where/when) is known on arrival; the checklist,
 * the total and the society representative's name are only known once the
 * walk-through is done. `start` claims the (society, area, period) slot and
 * captures the header; `finalize` records the walk's own findings and the
 * two summary figures. A row whose `totalLightsChecked` is still null is a
 * draft, in progress.
 */

export const SENSOR_STATUS_META: Record<
  InspectionSensorStatus,
  { label: string; tone: "ok" | "warn" | "bad" }
> = {
  ok: { label: "OK", tone: "ok" },
  full: { label: "Full", tone: "ok" },
  dim: { label: "Dim", tone: "warn" },
  off: { label: "OFF", tone: "bad" },
  flicker: { label: "Flicker", tone: "warn" },
};

export type FindingInput = {
  srNo: number;
  location: string;
  sensorStatus: InspectionSensorStatus;
  physicalDamage: boolean;
  actionReplace: boolean;
  remarks: string;
};

const PERIOD_RE = /^\d{4}-\d{2}$/;

export type InspectionStartInput = {
  area: string;
  period: string; // YYYY-MM
  inspectedAt: Date;
  inspectorName: string;
  inspectorContact: string;
};

/**
 * Everything that can be wrong with the header a visit opens with, checked
 * server-side regardless of what the form already validated client-side —
 * this codebase's standing rule that a disabled button is not a refusal.
 */
export function refuseInspectionStart(
  input: InspectionStartInput,
  context: { now: Date; existingActiveForSlot: boolean },
): string | null {
  if (input.inspectorName.trim() === "") return "The inspector's name is required.";
  if (input.inspectorContact.trim() === "") return "The inspector's contact number is required.";
  if (!PERIOD_RE.test(input.period)) return "The period must be a real month (YYYY-MM).";
  if (Number.isNaN(input.inspectedAt.getTime())) return "The inspection date/time is not valid.";
  if (input.inspectedAt.getTime() > context.now.getTime()) {
    return "The inspection cannot be dated in the future.";
  }
  if (context.existingActiveForSlot) {
    return "An inspection already exists for this society, area and month — void it first, or continue the one already in progress.";
  }
  return null;
}

export type InspectionFinalizeInput = {
  totalLightsChecked: number;
  findings: FindingInput[];
};

/** Refusals for the second act — the walk-through's own tally and checklist. */
export function refuseInspectionFinalize(input: InspectionFinalizeInput): string | null {
  if (!Number.isFinite(input.totalLightsChecked) || input.totalLightsChecked < 0) {
    return "Total lights checked must be a real, non-negative number.";
  }
  if (input.totalLightsChecked < input.findings.length) {
    return "Total lights checked cannot be less than the number of fixtures listed below.";
  }
  for (const f of input.findings) {
    if (f.location.trim() === "") return `Row ${f.srNo}: a location is required.`;
  }
  return null;
}

/** Derived, never stored — the single source of truth for "how many failed." */
export function faultyLightsCount(findingsCount: number): number {
  return findingsCount;
}

/** The paper form's own summary line, reconstructed rather than duplicated. */
export function inspectionSummary(input: { totalLightsChecked: number; findingsCount: number }): {
  totalLightsChecked: number;
  faultyLightsCount: number;
  faultyPct: number;
} {
  const faulty = faultyLightsCount(input.findingsCount);
  const faultyPct = input.totalLightsChecked > 0 ? (faulty / input.totalLightsChecked) * 100 : 0;
  return { totalLightsChecked: input.totalLightsChecked, faultyLightsCount: faulty, faultyPct };
}

export function refuseVoidInspection(input: { alreadyVoided: boolean; reason: string }): string | null {
  if (input.alreadyVoided) return "This inspection is already voided.";
  if (input.reason.trim() === "") return "Say why this inspection is being voided — a blank reason is not a reason.";
  return null;
}
