/**
 * Monitoring — the days a live circuit is measured and billed on
 * (2026-09-26, user-specified).
 *
 *  - They start at the billing start: the completion certificate's
 *    `billingStartDate`, else the contract's `termStart` — the same rule the
 *    invoice loader bills from, so the monitoring figure and the invoice
 *    always begin on the same day. Days between a demo's post period and that
 *    date are kept but feed nothing.
 *  - The same circuit-day can arrive from the meter (projected from the hourly
 *    store through the meter history) and from the global monthly upload. The
 *    meter wins; the upload fills days no meter covers; the losing value is
 *    kept on the row, never lost.
 */

export function monitoringStart(i: {
  certificateBillingStart: Date | null;
  contractTermStart: Date | null;
}): Date | null {
  return i.certificateBillingStart ?? i.contractTermStart ?? null;
}

export type Origin = "meter" | "monthly_upload" | "legacy";

export type ExistingDay = {
  kWh: number;
  origin: Origin;
  rawFileId: string;
  released: boolean;
  otherKwh: number | null;
  otherOrigin: Origin | null;
};

export type IncomingDay = {
  kWh: number;
  origin: "meter" | "monthly_upload";
  rawFileId: string;
  dataHours?: number | null;
};

export type MergeAction =
  | { kind: "skip"; why: "released" | "unchanged" | "meter_holds_day" }
  | { kind: "create" }
  | {
      kind: "update";
      /** The row's own value becomes the incoming one. */
      replaceValue: boolean;
      /** What the "other" slot should hold afterwards. */
      other: { kWh: number | null; origin: Origin | null };
      /** The value being replaced, kept as supersession when it was the same source. */
      supersede: boolean;
    };

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export function mergeMonitoringDay(existing: ExistingDay | null, incoming: IncomingDay): MergeAction {
  if (!existing) return { kind: "create" };
  if (existing.released) return { kind: "skip", why: "released" };

  if (incoming.origin === "meter") {
    if (existing.origin === "meter") {
      if (near(existing.kWh, incoming.kWh)) return { kind: "skip", why: "unchanged" };
      return {
        kind: "update",
        replaceValue: true,
        other: { kWh: existing.otherKwh, origin: existing.otherOrigin },
        supersede: true,
      };
    }
    // Meter takes the day; the upload's figure moves to "other".
    return { kind: "update", replaceValue: true, other: { kWh: existing.kWh, origin: existing.origin }, supersede: false };
  }

  // Incoming monthly upload.
  if (existing.origin === "meter") {
    if (existing.otherKwh !== null && near(existing.otherKwh, incoming.kWh) && existing.otherOrigin === "monthly_upload") {
      return { kind: "skip", why: "meter_holds_day" };
    }
    return { kind: "update", replaceValue: false, other: { kWh: incoming.kWh, origin: "monthly_upload" }, supersede: false };
  }
  if (near(existing.kWh, incoming.kWh)) return { kind: "skip", why: "unchanged" };
  return { kind: "update", replaceValue: true, other: { kWh: existing.otherKwh, origin: existing.otherOrigin }, supersede: true };
}
