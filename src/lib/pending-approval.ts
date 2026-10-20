import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isSuperAdmin } from "@/lib/super-admin";
import type { Prisma } from "@prisma/client";

/**
 * Corrections to the demo process, benchmark, light-count change and
 * agreement need one named account's sign-off when anyone else makes them
 * (2026-10-20, user-asked) — ordinary forward progress (starting a demo,
 * submitting a gate pass, recording a meter install, preparing/printing/
 * signing the agreement, generating an offer) is unaffected; this only
 * covers actions that CORRECT something already on record.
 *
 * Every gated action calls `requireSuperApproval()` once, right after its
 * own validation and right before its own write — so a request is only ever
 * queued if it would otherwise have succeeded. Approving re-invokes the SAME
 * action with the stored args (src/app/admin/approvals/dispatch.ts), which
 * re-runs every one of those checks against whatever is true at that
 * moment — the same safety property `acceptDateChange`'s "superseded" check
 * gives the date-change queue, generalised to any correction.
 */
export const PENDING_APPROVAL_KIND_LABEL = {
  setBenchmarkOverride: "Benchmark override",
  recordLightCountChange: "Light-count change recorded",
  correctRescaleEvent: "Light-count change corrected",
  voidRescaleEvent: "Light-count change voided",
  setDemoLightCount: "Demo light count corrected",
  correctAgreementDates: "Agreement / contract dates corrected",
  correctUnitElectricityRate: "Unit electricity rate corrected",
  overrideDemoLoad: "Load-test override",
  unlockDemo: "Demo unlocked for editing",
  removeDemo: "Demo removed",
  setDemoRejected: "Demo accepted / rejected",
} as const;

export type PendingApprovalKind = keyof typeof PENDING_APPROVAL_KIND_LABEL;

export function isPendingApprovalKind(s: string): s is PendingApprovalKind {
  return Object.prototype.hasOwnProperty.call(PENDING_APPROVAL_KIND_LABEL, s);
}

const PENDING_MESSAGE =
  "Submitted — this needs Yogesh Kumar's approval before it applies. Nothing has changed yet.";

/**
 * The gate. Returns `null` (proceed as normal — this IS the named account)
 * or `{ error }` (queued; the caller returns this in place of its own
 * success). Never throws, never writes anything but the queued row itself.
 */
export async function requireSuperApproval(input: {
  actorId: string;
  actorEmail: string | null | undefined;
  kind: PendingApprovalKind;
  summary: string;
  societyId: string;
  args: unknown;
}): Promise<{ error: string } | null> {
  if (isSuperAdmin(input.actorEmail)) return null;
  await db.pendingApproval.create({
    data: {
      kind: input.kind,
      summary: input.summary,
      societyId: input.societyId,
      args: input.args as Prisma.InputJsonValue,
      requestedById: input.actorId,
    },
  });
  logger.info("pending_approval.queued", { actorId: input.actorId, kind: input.kind, summary: input.summary, societyId: input.societyId });
  return { error: PENDING_MESSAGE };
}
