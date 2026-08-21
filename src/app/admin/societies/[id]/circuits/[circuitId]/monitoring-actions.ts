"use server";

import { revalidatePath } from "next/cache";
import type { CommissioningWindowType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { generateDemoReportInternal } from "@/app/admin/pipeline/[id]/report/actions";
import {
  getWindowProgress,
  recordDailyReading,
  restartWindow,
  averageOfFirstValid,
  parseCommissioningCsv,
  startOfDayUTC,
  requiredValidDays,
} from "@/lib/monitoring-window";
import { detectAnomalies } from "@/lib/reading-anomaly";
import {
  BENCHMARK_MAX_PCT,
  BENCHMARK_MIN_PCT,
  judgePostInstallDay,
} from "@/lib/commissioning-anomaly";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";

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

  // A restart (FEAT-012-AC-3) moves windowStartAt forward, past whatever was
  // recorded before the anomaly — sometimes past dates that already have a
  // reading row. Writing one there anyway used to succeed silently: the
  // upsert has no date filter, so the row landed in the database but every
  // read (getWindowProgress, the readings table, the monitoring board) only
  // ever looks at date >= windowStartAt — the reading existed and was
  // permanently invisible everywhere. Refusing here, by name, is what MS-04's
  // "check for the action's own log line" rule and MS-08's "a refusal with
  // no log line is a refusal you cannot verify" both point at: silent success
  // is worse than a clear refusal.
  const requestedDate = startOfDayUTC(new Date(date));
  // This is RELATIVE ordering — a reading cannot predate the window its own
  // circuit opened — and it holds in demo mode too. Backdating is achieved by
  // giving the earlier STEPS their real historical dates (meter installed
  // 23 March => the window opens 24 March => March readings are in range),
  // not by disabling the check. A DEMO_MODE bypass was added here and removed
  // the same day: it broke the very validation the backfill depends on.
  if (requestedDate.getTime() < windowStartAt.getTime()) {
    logger.warn("commissioning.reading_before_window_start", {
      circuitId,
      windowType,
      date,
      windowStartAt,
    });
    return {
      error: `${date}: the window restarted on ${windowStartAt.toISOString().slice(0, 10)} — record a reading on or after that date instead.`,
    };
  }

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

  // The two windows ask different questions, so they get different rules —
  // see src/lib/commissioning-anomaly.ts for the full reasoning.
  //
  // PRE-INSTALL has no baseline yet (producing one is the point), so the only
  // available question is self-consistency: MS-07's ±5%-against-the-median
  // detector, shared with the billing path exactly as FEAT-045-AC-5 requires.
  //
  // POST-INSTALL has a baseline, and CON-20 says what a plausible day looks
  // like against it. That question is strictly more informative, and running
  // ±5% here flagged ordinary jitter — which, because an anomaly restarts
  // CON-19's count, meant a healthy circuit could never finish its window.
  let autoAnomalyNote = anomalyNote;
  if (consumptionKwh != null && !anomalyNote?.trim()) {
    const day = new Date(date);

    if (windowType === "post_install") {
      // The baseline in force on that day, replayed through any rescale
      // events (INV-07) rather than read straight off the circuit.
      const baseline = effectiveBaselineAt(
        circuit.preInstallBaseline,
        await db.benchmarkRescaleEvent.findMany({
          where: { circuitId, voidedAt: null },
          orderBy: { effectiveDate: "asc" },
        }),
        day,
      );
      const verdict = judgePostInstallDay(consumptionKwh, baseline ?? 0);
      if (verdict.anomaly) {
        autoAnomalyNote = `Flagged automatically: ${verdict.detail}`;
        logger.info("commissioning.auto_anomaly", {
          circuitId,
          windowType,
          date,
          kind: "outside_con20_band",
          savingsPct: verdict.savingsPct,
        });
      }
    } else {
      const findings = detectAnomalies([
        ...before.readings
          .filter((r) => r.status === "valid" && r.consumptionKwh != null)
          .map((r) => ({ date: r.date, kWh: r.consumptionKwh as number })),
        { date: day, kWh: consumptionKwh },
      ]);
      const hit = findings.find(
        (f) => f.blocksBilling && f.date?.toISOString().slice(0, 10) === day.toISOString().slice(0, 10),
      );
      if (hit) {
        autoAnomalyNote = `Flagged automatically: ${hit.detail}`;
        logger.info("commissioning.auto_anomaly", { circuitId, windowType, date, kind: hit.kind });
      }
    }
  }

  const autoFlagged = !!autoAnomalyNote && autoAnomalyNote !== anomalyNote;

  await recordDailyReading({
    circuitId,
    windowType,
    date: new Date(date),
    recordedById,
    // An automatically-flagged day keeps its reading — the value is what the
    // flag is *about*, and dropping it would leave a flag nobody can check,
    // and nothing for FEAT-015's review to rest on. The status is what makes
    // it not count toward the window.
    consumptionKwh,
    anomalyNote: autoAnomalyNote,
    status: autoFlagged ? "anomaly" : undefined,
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

  // The window completes at the required day count, which DEMO_MODE lowers
  // to 1 — the average is taken over however many that is, so the figure
  // still comes from real recorded days, just fewer of them.
  const needed = await requiredValidDays();
  if (progress.validCount >= needed) {
    const average = averageOfFirstValid(progress.readings, needed);

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
      // CON-10 — % savings between the baseline and post-install averages,
      // against the baseline *in force* (INV-07), which is the same figure
      // the day-level check used. Reading the raw commissioned baseline here
      // would let a mid-window rescale make the two disagree, so a set of
      // days each judged in-band could complete out of band.
      const completionBaseline = effectiveBaselineAt(
        fresh.preInstallBaseline,
        await db.benchmarkRescaleEvent.findMany({
          where: { circuitId, voidedAt: null },
          orderBy: { effectiveDate: "asc" },
        }),
        new Date(),
      ) as number;
      const savingsPct = ((completionBaseline - average) / completionBaseline) * 100;
      // CON-20 — only a result inside 60-80% becomes the fixed
      // benchmarkSavingsPct; outside it, FEAT-014-AC-5 routes to FEAT-015's
      // review queue instead of writing a benchmark.
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

      // Same rule as the CSV path: a confirmed benchmark answers whatever an
      // earlier out-of-band review was asking, so that review closes rather
      // than sitting at the top of the monitoring queue contradicting the
      // circuit's own page. Resolved, never deleted.
      if (withinBand) {
        await db.demoResultReview.updateMany({
          where: { circuitId, state: "open" },
          data: {
            state: "resolved",
            resolution: "rerun_window",
            resolutionNote: `Superseded by a re-measured result of ${savingsPct.toFixed(
              2,
            )}%, inside CON-20's ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band. Closed by the system when the benchmark confirmed.`,
            resolvedAt: new Date(),
          },
        });
      }

      // FEAT-015 — an out-of-range result opens a real review item rather
      // than parking the circuit in a state with nothing to act on. AC-5's
      // "repeat failure" is the count of prior reviews on this circuit, so a
      // second failure after a restart is ranked differently from a first.
      if (!withinBand) {
        const priorReviews = await db.demoResultReview.count({ where: { circuitId } });
        const review = await db.demoResultReview.create({
          data: {
            circuitId,
            occurrence: priorReviews + 1,
            measuredSavingsPct: savingsPct,
            preInstallBaseline: completionBaseline,
            postInstallAverage: average,
          },
        });
        logger.info("commissioning.demo_result_review_raised", {
          circuitId,
          reviewId: review.id,
          occurrence: priorReviews + 1,
          savingsPct,
        });
      }

      // FEAT-020-AC-1 — generation is automatic on BenchmarkConfirmed, not
      // something PER-01 has to remember to run. It self-refuses while any
      // sibling circuit is still commissioning, so calling it on every
      // confirmation is correct rather than premature; a blocked attempt is
      // logged and surfaced on the report screen (AC-3), never silent.
      if (withinBand && circuit.siteSurveyId) {
        const survey = await db.siteSurvey.findUnique({
          where: { id: circuit.siteSurveyId },
          select: { pipelineId: true },
        });
        if (survey) await generateDemoReportInternal(survey.pipelineId, null);
      }
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

/**
 * FEAT-015 — the day-level rule is CON-20's band, so a circuit that simply
 * isn't performing gets flagged every single day and its window can never
 * finish. "Record fix & restart" is the wrong answer there: nothing was
 * fixed. This is the other door out — the reading is real, the shortfall is
 * real, and it becomes a review item with an owner.
 *
 * Raising is PER-04's call (they are the one on site recording days);
 * FEAT-015-AC-4 gates *resolving* it to PER-01.
 */
export async function escalateOutOfBandResult(circuitId: string) {
  const gate = await resolveAdmin();
  if (!gate) return { error: "Your session is no longer valid. Sign in again." };
  if (!gate.permissions.includes("manage_survey")) {
    logger.warn("commissioning.escalate_refused", { actorId: gate.id, circuitId, gate: "manage_survey" });
    return { error: "Recording a commissioning result is a field-survey action." };
  }

  const circuit = await db.circuit.findUnique({ where: { id: circuitId } });
  if (!circuit) return { error: "Circuit not found." };
  if (circuit.preInstallBaseline == null || circuit.preInstallBaseline === 0) {
    return { error: "No pre-install baseline recorded — there is nothing to measure this against." };
  }

  const open = await db.demoResultReview.findFirst({ where: { circuitId, state: "open" } });
  if (open) return { error: "A review is already open for this circuit." };

  // The flagged days themselves are the evidence: their readings are kept
  // (status, not absence, is what excludes them from the window), so the
  // review records what was actually measured rather than a re-derivation.
  const flagged = await db.commissioningReading.findMany({
    where: {
      circuitId,
      windowType: "post_install",
      status: "anomaly",
      consumptionKwh: { not: null },
      ...(circuit.postInstallWindowStartAt ? { date: { gte: circuit.postInstallWindowStartAt } } : {}),
    },
    orderBy: { date: "asc" },
  });
  if (flagged.length === 0) {
    return { error: "No out-of-range day is recorded on this window — nothing to escalate." };
  }

  const measuredAverage =
    flagged.reduce((sum, r) => sum + (r.consumptionKwh as number), 0) / flagged.length;
  const baseline = effectiveBaselineAt(
    circuit.preInstallBaseline,
    await db.benchmarkRescaleEvent.findMany({ where: { circuitId, voidedAt: null }, orderBy: { effectiveDate: "asc" } }),
    new Date(),
  ) as number;
  const savingsPct = ((baseline - measuredAverage) / baseline) * 100;

  const priorReviews = await db.demoResultReview.count({ where: { circuitId } });
  const review = await db.demoResultReview.create({
    data: {
      circuitId,
      occurrence: priorReviews + 1,
      measuredSavingsPct: savingsPct,
      preInstallBaseline: baseline,
      postInstallAverage: measuredAverage,
    },
  });
  await db.circuit.update({ where: { id: circuitId }, data: { state: "benchmark_review" } });

  logger.info("commissioning.demo_result_review_raised", {
    circuitId,
    reviewId: review.id,
    occurrence: priorReviews + 1,
    savingsPct,
    via: "flagged_days",
    dayCount: flagged.length,
    raisedBy: gate.id,
  });

  await revalidateCircuit(circuitId);
  revalidatePath("/admin/demo-monitoring");
  return {};
}

// FEAT-012-AC-3/FEAT-014-AC-3 — the restart takes effect the midnight
// after the fix is recorded, logged as a distinct event.
export async function fixCommissioningAnomaly(circuitId: string, windowType: CommissioningWindowType) {
  const gate = await resolveAdmin();
  if (!gate) return { error: "Your session is no longer valid. Sign in again." };
  if (!gate.permissions.includes("manage_survey")) {
    logger.warn("commissioning.fix_refused", { actorId: gate.id, circuitId, gate: "manage_survey" });
    return { error: "Recording a commissioning fix is a field-survey action." };
  }
  const session = { user: { id: gate.id } };

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
