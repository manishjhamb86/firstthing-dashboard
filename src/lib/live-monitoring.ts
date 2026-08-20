// "Live monitoring" — the monthly readings that feed billing, as distinct
// from the commissioning windows that produce a benchmark.
//
// The two were sharing a screen: the circuit page offered "Upload this
// month's readings" the moment a demo benchmark was confirmed, which is
// before the offer, the agreement and the installation have even happened
// (user-reported 2026-08-20: "This doesn't belong in the stepper screen. It
// should come after the full installation. In the monitoring tab.").
//
// That was a sequencing error as well as a placement one. A monthly figure
// is what a society is billed on, and billing does not start until the day
// after the completion certificate is signed (CON-22) — so a month uploaded
// before then is a figure with no contract behind it.

import type { Prisma } from "@prisma/client";

/**
 * A circuit is in live monitoring once its benchmark is confirmed AND its
 * deal has actually finished installing. Both halves matter: the benchmark
 * is what a savings % is measured against, and the certificate is what makes
 * the month billable.
 */
export const LIVE_MONITORING_WHERE = {
  voidedAt: null,
  benchmarkSavingsPct: { not: null },
  siteSurvey: {
    pipeline: {
      OR: [{ stage: "active_billing" as const }, { installationProject: { certificate: { isNot: null } } }],
    },
  },
} satisfies Prisma.CircuitWhereInput;

/** Why a given circuit is not live yet — shown where the upload used to be. */
export function liveMonitoringBlocker(c: {
  benchmarkSavingsPct: number | null;
  installationCertificateSigned: boolean;
}): string | null {
  if (c.benchmarkSavingsPct === null) {
    return "Monthly readings start once the demo benchmark is confirmed — the savings on every month are measured against it.";
  }
  if (!c.installationCertificateSigned) {
    return "Monthly readings start after the full installation is signed off. Billing begins the day after the completion certificate (CON-22), so there is nothing to bill a month against yet.";
  }
  return null;
}
