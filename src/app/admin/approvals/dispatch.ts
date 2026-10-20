import "server-only";

/**
 * Maps a PendingApprovalKind to the owning action it re-invokes (2026-10-20).
 * Every one of these is a real exported Server Action from its own file —
 * nothing here duplicates their logic. Calling one through this dispatch,
 * from the approver's own session, re-runs its FULL validation: the
 * approver's permissions (always satisfied — the named account holds every
 * permission these need), and every business rule against CURRENT state,
 * which is what makes approving safe even if something moved underneath the
 * request since it was raised.
 *
 * Kept in its own file, separate from pending-approval.ts, so the gate
 * helper (imported BY every one of these actions) never imports the actions
 * back — no import cycle.
 */
import { overrideDemoLoad, removeDemo, setBenchmarkOverride, setDemoLightCount, setDemoRejected, unlockDemo } from "@/app/admin/societies/[id]/circuits/[circuitId]/demo-step-actions";
import { correctRescaleEvent, recordLightCountChange, voidRescaleEvent } from "@/app/admin/societies/[id]/circuits/[circuitId]/rescale-actions";
import { correctAgreementDates, correctUnitElectricityRate } from "@/app/admin/pipeline/[id]/agreement/actions";
import type { PendingApprovalKind } from "@/lib/pending-approval";

type Result = { error?: string } | { ok?: true } | Record<string, unknown>;

export const PENDING_APPROVAL_DISPATCH: Record<PendingApprovalKind, (args: unknown) => Promise<Result>> = {
  setBenchmarkOverride: (args) => setBenchmarkOverride(args as Parameters<typeof setBenchmarkOverride>[0]),
  recordLightCountChange: (args) => {
    const a = args as { circuitId: string; input: Parameters<typeof recordLightCountChange>[1] };
    return recordLightCountChange(a.circuitId, a.input);
  },
  correctRescaleEvent: (args) => {
    const a = args as { eventId: string; input: Parameters<typeof correctRescaleEvent>[1] };
    return correctRescaleEvent(a.eventId, a.input);
  },
  voidRescaleEvent: (args) => {
    const a = args as { eventId: string; reason: string };
    return voidRescaleEvent(a.eventId, a.reason);
  },
  setDemoLightCount: (args) => setDemoLightCount(args as Parameters<typeof setDemoLightCount>[0]),
  correctAgreementDates: (args) => {
    const a = args as { pipelineId: string; input: Parameters<typeof correctAgreementDates>[1] };
    return correctAgreementDates(a.pipelineId, a.input);
  },
  correctUnitElectricityRate: (args) => {
    const a = args as { pipelineId: string; rate: number; reason: string };
    return correctUnitElectricityRate(a.pipelineId, a.rate, a.reason);
  },
  overrideDemoLoad: (args) => {
    const a = args as { demoId: string; reason: string };
    return overrideDemoLoad(a.demoId, a.reason);
  },
  unlockDemo: (args) => {
    const a = args as { demoId: string; reason: string };
    return unlockDemo(a.demoId, a.reason);
  },
  removeDemo: (args) => removeDemo(args as Parameters<typeof removeDemo>[0]),
  setDemoRejected: (args) => setDemoRejected(args as Parameters<typeof setDemoRejected>[0]),
};
