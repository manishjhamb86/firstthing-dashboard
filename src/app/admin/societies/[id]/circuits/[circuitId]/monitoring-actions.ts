"use server";

import { revalidatePath } from "next/cache";
import type { CommissioningWindowType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  getWindowProgress,
  recordDailyReading,
  restartWindow,
  averageOfFirstValid,
  parseCommissioningCsv,
  REQUIRED_VALID_DAYS,
} from "@/lib/monitoring-window";

const BENCHMARK_MIN_PCT = 60; // CON-20
const BENCHMARK_MAX_PCT = 80;

// The row-level rules (anomaly gating, completion/benchmark computation)
// used by both a single day's submission and the CSV bulk upload below —
// factored out so the two entry points can't drift apart. Re-fetches the
// circuit fresh on every call rather than being handed a possibly-stale
// one, since a bulk upload calls this in a loop and an earlier row in the
// same batch can complete the window mid-loop.
async function applyCommissioningReading(
  circuitId: string,
  windowType: CommissioningWindowType,
  date: string,
  consumptionKwh: number | undefined,
  anomalyNote: string | undefined,
  recordedById: string
): Promise<{ error?: string }> {
  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };

  const windowStartAt = windowType === "pre_install" ? circuit.preInstallWindowStartAt : circuit.postInstallWindowStartAt;
  if (!windowStartAt) return { error: `${date}: this monitoring window hasn't started yet.` };

  const baselineAlready = windowType === "pre_install" ? circuit.preInstallBaseline != null : circuit.postInstallBaseline != null;
  if (baselineAlready) return { error: `${date}: this window has already completed.` };

  const before = await getWindowProgress(circuitId, windowType, windowStartAt);
  if (before.pendingAnomaly) {
    return { error: `${date}: an anomaly is still open on this window — record the fix before adding another reading.` };
  }

  if (consumptionKwh == null && !anomalyNote?.trim()) {
    return { error: `${date}: either a consumption reading or an anomaly note is required.` };
  }
  if (consumptionKwh != null && (!Number.isFinite(consumptionKwh) || consumptionKwh < 0)) {
    return { error: `${date}: consumption must be a non-negative number.` };
  }

  await recordDailyReading({
    circuitId,
    windowType,
    date: new Date(date),
    recordedById,
    consumptionKwh,
    anomalyNote,
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
      const fresh = await db.circuit.findUnique({ where: { id: circuitId } });
      if (fresh?.preInstallBaseline == null || fresh.preInstallBaseline === 0) {
        logger.error("commissioning.post_install_missing_baseline", { circuitId });
        return { error: "No pre-install baseline recorded — cannot compute savings." };
      }
      // CON-10 — % savings between the baseline and post-install averages.
      const savingsPct = ((fresh.preInstallBaseline - average) / fresh.preInstallBaseline) * 100;
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

  return {};
}

async function revalidateCircuit(circuitId: string) {
  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (circuit) revalidatePath(`/admin/societies/${circuit.societyId}/circuits/${circuitId}`);
}

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
  const result = await applyCommissioningReading(circuitId, windowType, date, input.consumptionKwh, input.anomalyNote, session.user.id);
  if (result.error) return result;
  await revalidateCircuit(circuitId);
  return {};
}

// The "sheet upload" — a CSV of `date,consumption_kwh[,anomaly_note]` rows
// applied in chronological order through the same row-level rules as a
// single day's entry. Stops at the first row that fails (an anomaly gate,
// a window that's already complete, a bad value) rather than skipping
// past it, since later rows in the same sheet are only meaningful once
// earlier ones have actually landed — a partial, honestly-reported result
// beats silently reordering or dropping rows.
export async function uploadCommissioningReadingsCsv(circuitId: string, windowType: CommissioningWindowType, csvText: string) {
  const session = await requireAdminPermission("manage_survey");

  const rows = parseCommissioningCsv(csvText);
  if (rows.length === 0) {
    return {
      succeeded: 0,
      total: 0,
      error: "No rows found — expected a header row with date,consumption_kwh[,anomaly_note] columns.",
    };
  }

  let succeeded = 0;
  let stoppedAt: { date: string; error: string } | undefined;

  for (const row of rows) {
    const result = await applyCommissioningReading(circuitId, windowType, row.date, row.consumptionKwh, row.anomalyNote, session.user.id);
    if (result.error) {
      stoppedAt = { date: row.date, error: result.error };
      break;
    }
    succeeded++;
  }

  await revalidateCircuit(circuitId);

  logger.info("commissioning.csv_uploaded", {
    circuitId,
    windowType,
    rowCount: rows.length,
    succeeded,
    stoppedEarly: !!stoppedAt,
  });

  return {
    succeeded,
    total: rows.length,
    error: stoppedAt ? `Stopped at ${stoppedAt.date}: ${stoppedAt.error} (${succeeded} of ${rows.length} rows applied)` : undefined,
  };
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
