/**
 * When a demo stops being editable (2026-09-26, user-specified).
 *
 *  - Until the deal's demo report that includes it is SHARED with the
 *    society, everything is editable — that is when the society has seen the
 *    figure, the point IPMVP/FEMP treat the baseline as agreed.
 *  - In demo mode, always editable.
 *  - After sharing, operations can "Unlock for correction" with a reason; it
 *    relocks when someone relocks it, or on its own after 24 hours.
 */

export const UNLOCK_HOURS = 24;

export type DemoLockInput = {
  sharedInReport: boolean;
  unlockedUntil: Date | null;
  demoMode: boolean;
  now: Date;
};

export type DemoLockState =
  | { editable: true; why: "demo_mode" | "open" | "unlocked" }
  | { editable: false; why: "locked" };

export function demoLockState(i: DemoLockInput): DemoLockState {
  if (i.demoMode) return { editable: true, why: "demo_mode" };
  if (!i.sharedInReport) return { editable: true, why: "open" };
  if (i.unlockedUntil && i.unlockedUntil.getTime() > i.now.getTime()) return { editable: true, why: "unlocked" };
  return { editable: false, why: "locked" };
}

export const LOCKED_MESSAGE =
  "This demo's report has been shared with the society, so the demo is locked. Operations can unlock it for correction, with a reason.";

export function refuseUnlock(i: { isOps: boolean; reason: string; sharedInReport: boolean }): string | null {
  if (!i.isOps) return "Unlocking a shared demo is an operations lead action.";
  if (!i.sharedInReport) return "This demo is not locked — its report has not been shared.";
  if (!i.reason.trim()) return "Say why the demo needs correcting — the unlock is recorded with its reason.";
  return null;
}

export function unlockUntil(now: Date): Date {
  return new Date(now.getTime() + UNLOCK_HOURS * 3_600_000);
}
