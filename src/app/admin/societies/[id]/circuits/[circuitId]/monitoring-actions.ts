"use server";

import { revalidatePath } from "next/cache";
import type { CommissioningWindowType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { getWindowProgress, recordDailyReading, restartWindow, averageOfFirstValid, REQUIRED_VALID_DAYS } from "@/lib/monitoring-window";

const BENCHMARK_MIN_PCT = 60; // CON-20
const BENCHMARK_MAX_PCT = 80;

// FEAT-012/FEAT-014 — one action drives both windows, since FEAT-014's own
// description states it "mirrors FEAT-012's mechanism" exactly. Gated to
// manage_survey (PER-04); the joint PER-04/PER-01 permission split doesn't
// apply here since neither window has a PER-01-only action beyond what
// manage_survey already covers (unlike FEAT-011's override).
export async function recordCommissioningReading(
  circuitId: string,
  windowType: CommissioningWindowType,
  date: string,
  input: { consumptionKwh?: number; anomalyNote?: string }
) {
  const session = await requireAdminPermission("manage_survey");

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const windowStartAt = windowType === "pre_install" ? circuit.preInstallWindowStartAt : circuit.postInstallWindowStartAt;
  if (!windowStartAt) return { error: "This monitoring window hasn't started yet." };

  const before = await getWindowProgress(circuitId, windowType, windowStartAt);
  if (before.pendingAnomaly) {
    return { error: "An anomaly is still open on this window — record the fix before adding another reading." };
  }

  if (input.consumptionKwh == null && !input.anomalyNote?.trim()) {
    return { error: "Either a consumption reading or an anomaly note is required." };
  }
  if (input.consumptionKwh != null && (!Number.isFinite(input.consumptionKwh) || input.consumptionKwh < 0)) {
    return { error: "Consumption must be a non-negative number." };
  }

  await recordDailyReading({
    circuitId,
    windowType,
    date: new Date(date),
    recordedById: session.user.id,
    consumptionKwh: input.consumptionKwh,
    anomalyNote: input.anomalyNote,
  });

  // The circuit's state reflects "a window is actively running" from the
  // first reading onward, distinct from the pending state before any
  // reading exists (FEAT-012-AC-2 / FEAT-014-AC-2's empty state).
  if (windowType === "pre_install" && circuit.state === "meter_installed") {
    await db.circuit.update({ where: { id: circuitId }, data: { state: "pre_install_monitoring" } });
  }
  if (windowType === "post_install" && circuit.state === "post_install_pending") {
    await db.circuit.update({ where: { id: circuitId }, data: { state: "post_install_monitoring" } });
  }

  const progress = await getWindowProgress(circuitId, windowType, windowStartAt);

  if (progress.validCount >= REQUIRED_VALID_DAYS) {
    const average = averageOfFirstValid(progress.readings, REQUIRED_VALID_DAYS);

    if (windowType === "pre_install") {
      await db.circuit.update({
        where: { id: circuitId },
        data: { preInstallBaseline: average, state: "awaiting_installation" },
      });
      logger.info("commissioning.pre_install_window_complete", { circuitId, baseline: average });
    } else {
      if (circuit.preInstallBaseline == null || circuit.preInstallBaseline === 0) {
        logger.error("commissioning.post_install_missing_baseline", { circuitId });
        return { error: "No pre-install baseline recorded — cannot compute savings." };
      }
      // CON-10 — % savings between the baseline and post-install averages.
      const savingsPct = ((circuit.preInstallBaseline - average) / circuit.preInstallBaseline) * 100;
      // CON-20 — only a result inside 60-80% becomes the fixed
      // benchmarkSavingsPct; outside it, FEAT-014-AC-5 routes to FEAT-015
      // (not built) instead of writing a benchmark.
      const withinBand = savingsPct >= BENCHMARK_MIN_PCT && savingsPct <= BENCHMARK_MAX_PCT;
      await db.circuit.update({
        where: { id: circuitId },
        data: {
          postInstallBaseline: average,
          ...(withinBand
            ? { benchmarkSavingsPct: savingsPct, state: "benchmark_confirmed" }
            : { state: "benchmark_review" }),
        },
      });
      logger.info("commissioning.post_install_window_complete", { circuitId, savingsPct, withinBand });
    }
  }

  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}

// FEAT-012-AC-3/FEAT-014-AC-3 — the restart takes effect the midnight
// after the fix is recorded, logged as a distinct event.
export async function fixCommissioningAnomaly(circuitId: string, windowType: CommissioningWindowType) {
  const session = await requireAdminPermission("manage_survey");

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const restartFrom = await restartWindow(circuitId, windowType);

  await db.circuit.update({
    where: { id: circuitId },
    data:
      windowType === "pre_install"
        ? { preInstallWindowStartAt: restartFrom }
        : { postInstallWindowStartAt: restartFrom },
  });

  logger.info("commissioning.anomaly_fixed", { circuitId, windowType, restartFrom, fixedBy: session.user.id });
  revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
  return {};
}
