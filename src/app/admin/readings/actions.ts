"use server";

import { revalidatePath } from "next/cache";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { requireOps } from "./ops";
import { proposeMapping, type MappingProposal } from "@/lib/reading-ingest-ai";
import {
  applyMapping,
  parseRate,
  refuseMapping,
  utcDayOf,
  type ReadingMapping,
} from "@/lib/reading-normalize";
import { detectAnomalies } from "@/lib/reading-anomaly";
import { coverageOf } from "@/lib/reading-coverage";

const PATH = "/admin/readings";

// ── FEAT-043 — upload, raw file first ────────────────────────────────────

/**
 * Records the raw file. Called *after* the browser has PUT the bytes to S3,
 * which is the order CON-30 and SCR-080 both specify: the file is stored
 * before any interpretation of it exists, so a failure anywhere downstream —
 * a dead AI, a wrong mapping, a closed tab — never costs the evidence.
 */
export async function recordRawUpload(input: {
  circuitId: string;
  period: string;
  s3Key: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  vendor?: string;
}) {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    return { error: "Pick the month these readings are for." };
  }
  // INV-04 restated as a guard, not just a form constraint: the period is a
  // selection, and a selection in the future is a mistake every time.
  const now = new Date();
  const thisPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (input.period > thisPeriod) {
    return { error: `${input.period} hasn't happened yet. Pick a month that has.` };
  }

  const circuit = await db.circuit.findUnique({
    where: { id: input.circuitId },
    select: { id: true, societyId: true },
  });
  if (!circuit) return { error: "That circuit no longer exists." };

  const file = await db.rawReadingFile.create({
    data: {
      circuitId: circuit.id,
      period: input.period,
      s3Key: input.s3Key,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      vendor: input.vendor?.trim() || null,
      status: "pending_normalization",
      uploadedById: ops.session.user.id,
    },
  });

  logger.info("ingest.raw_recorded", {
    actorId: ops.session.user.id,
    rawFileId: file.id,
    circuitId: circuit.id,
    period: input.period,
    byteSize: input.byteSize,
  });
  revalidatePath(PATH);
  return { rawFileId: file.id };
}

/**
 * FEAT-043-AC-1 / FEAT-044 — ask the model what shape the file is.
 *
 * AC-3 is the reason this never throws on an AI failure: the raw file is
 * already stored, and the upload simply stays `pending_normalization` with
 * the reason recorded. Readings are not lost because an external service was
 * down; they are waiting, and the operator can still map the file by hand.
 */
export type MappingOutcome =
  | { kind: "error"; error: string }
  | { kind: "ai_unavailable"; error: string }
  | { kind: "proposal"; proposal: MappingProposal };

export async function requestMapping(
  rawFileId: string,
  fileText: string,
  answers?: Record<string, string>,
): Promise<MappingOutcome> {
  const ops = await requireOps();
  if (!ops.ok) return { kind: "error", error: ops.error };

  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { kind: "error", error: "That upload is no longer in the queue." };
  if (file.status === "committed") {
    return { kind: "error", error: "This file has already been committed." };
  }

  try {
    const proposal = await proposeMapping(fileText, answers);
    await db.rawReadingFile.update({
      where: { id: rawFileId },
      data: {
        status: "awaiting_mapping",
        proposedMapping: proposal.mapping as unknown as object,
        clarifications: {
          questions: proposal.questions,
          answers: answers ?? {},
          columnNames: proposal.columnNames,
          notes: proposal.notes,
        },
        aiConfidence: proposal.confidence,
        aiError: null,
      },
    });
    logger.info("ingest.mapping_proposed", {
      actorId: ops.session.user.id,
      rawFileId,
      confidence: proposal.confidence,
      questions: proposal.questions.length,
    });
    revalidatePath(PATH);
    return { kind: "proposal", proposal };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.rawReadingFile.update({
      where: { id: rawFileId },
      data: { status: "pending_normalization", aiError: message.slice(0, 500) },
    });
    logger.error("ingest.normalization_unavailable", { rawFileId, message });
    revalidatePath(PATH);
    return {
      kind: "ai_unavailable",
      error:
        "The file is stored safely, but automatic normalisation could not run. Map the columns by hand, or try again later.",
    };
  }
}

// ── FEAT-044 — mapping confirmation & preview ────────────────────────────

export type PreviewResult = {
  preview: { date: string; kWh: number; intervalCount: number }[];
  rowsParsed: number;
  rowsAttempted: number;
  parseRatePct: number;
  daysProduced: number;
  totalKwh: number;
  problems: string[];
  coverage: { coverageDays: number; daysInMonth: number; belowFloor: boolean };
};

/**
 * Applies a mapping and shows what it would produce — always, before anything
 * is committed (SCR-080: "Preview … shown before commit, always").
 *
 * `overridden` records that the operator changed what the model proposed.
 * FEAT-044-AC-5's rule is that confidence is not authority; keeping the
 * proposal beside the confirmed mapping is what makes a disagreement visible
 * afterwards rather than indistinguishable from agreement.
 */
export type ConfirmOutcome = { error: string } | { result: PreviewResult };

export async function confirmMapping(
  rawFileId: string,
  mapping: ReadingMapping,
  fileText: string,
  opts: { overridden?: boolean } = {},
): Promise<ConfirmOutcome> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") return { error: "This file has already been committed." };

  const parsed = applyMapping(fileText, mapping, file.period);
  const refusal = refuseMapping(parsed, file.period);
  if (refusal) {
    logger.warn("ingest.mapping_refused", { actorId: ops.session.user.id, rawFileId, reason: refusal });
    return { error: refusal };
  }

  await db.rawReadingFile.update({
    where: { id: rawFileId },
    data: {
      status: "ready",
      confirmedMapping: mapping as unknown as object,
      mappingOverridden: opts.overridden ?? false,
      rowsParsed: parsed.rowsParsed,
      daysProduced: parsed.days.length,
    },
  });

  const coverage = coverageOf(parsed.days, file.period);
  const result: PreviewResult = {
    preview: parsed.days.slice(0, 10).map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      kWh: d.kWh,
      intervalCount: d.intervalCount,
    })),
    rowsParsed: parsed.rowsParsed,
    rowsAttempted: parsed.rowsAttempted,
    parseRatePct: Math.round(parseRate(parsed) * 100),
    daysProduced: parsed.days.length,
    totalKwh: parsed.days.reduce((n, d) => n + d.kWh, 0),
    problems: parsed.problems,
    coverage: {
      coverageDays: coverage.coverageDays,
      daysInMonth: coverage.daysInMonth,
      belowFloor: coverage.belowFloor,
    },
  };

  logger.info("ingest.mapping_confirmed", {
    actorId: ops.session.user.id,
    rawFileId,
    overridden: opts.overridden ?? false,
    days: parsed.days.length,
  });
  revalidatePath(PATH);
  return { result };
}

/** FEAT-044-AC-3 — walk away without leaving partial readings behind. */
export type SimpleOutcome = { error: string } | { ok: true };

export async function abandonUpload(rawFileId: string, reason: string): Promise<SimpleOutcome> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };
  if (!reason.trim()) return { error: "Say why this file is being abandoned." };

  const file = await db.rawReadingFile.findUnique({
    where: { id: rawFileId },
    include: { _count: { select: { readings: true } } },
  });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") {
    return { error: "This file's readings are already committed — it can't be abandoned." };
  }
  // Nothing to clean up by construction: readings are only ever written by
  // commitUpload, in one transaction. This assertion is here so that stays
  // true if a future path ever writes them earlier.
  if (file._count.readings > 0) {
    return { error: "This file already has readings attached. Replace it with a corrected upload instead." };
  }

  await db.rawReadingFile.update({
    where: { id: rawFileId },
    data: { status: "abandoned", aiError: reason.trim().slice(0, 500) },
  });
  logger.info("ingest.abandoned", { actorId: ops.session.user.id, rawFileId, reason: reason.trim() });
  revalidatePath(PATH);
  return { ok: true };
}

// ── FEAT-043-AC-5 / FEAT-045 / FEAT-046 — commit ─────────────────────────

export type CommitOutcome =
  | { error: string }
  | {
      duplicate: {
        rawFileId: string;
        fileName: string;
        uploadedAt: string;
        daysProduced: number | null;
        readingsUsedInCalculation: number;
      };
    }
  | { committed: { days: number; anomalies: number; blocking: number; coverageDays: number; daysInMonth: number } };

/**
 * Writes the readings.
 *
 * Three rules meet here and all three are load-bearing:
 *   - FEAT-043-AC-5: the same period uploaded twice is detected, and the
 *     operator chooses replace or discard. Silent double-counting would
 *     corrupt the monthly total directly.
 *   - INV-03 / CON-43: a reading already consumed by a released calculation
 *     is never altered, with or without confirmation.
 *   - ADR-005: a replaced value is superseded, never overwritten — the prior
 *     value, when, and by whom are all retained.
 */
export async function commitUpload(
  rawFileId: string,
  fileText: string,
  opts: { replaceExisting?: boolean } = {},
): Promise<CommitOutcome> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") return { error: "This file has already been committed." };
  if (!file.confirmedMapping) return { error: "Confirm the column mapping before committing." };

  const mapping = file.confirmedMapping as unknown as ReadingMapping;
  const parsed = applyMapping(fileText, mapping, file.period);
  const refusal = refuseMapping(parsed, file.period);
  if (refusal) return { error: refusal };

  const existingFiles = await db.rawReadingFile.findMany({
    where: {
      circuitId: file.circuitId,
      period: file.period,
      status: "committed",
      id: { not: file.id },
    },
    include: { _count: { select: { readings: true } } },
    orderBy: { uploadedAt: "desc" },
  });

  if (existingFiles.length > 0 && !opts.replaceExisting) {
    const prior = existingFiles[0];
    const usedCount = await db.meterReading.count({
      where: { rawFileId: prior.id, usedInCalculationId: { not: null } },
    });
    logger.info("ingest.duplicate_detected", {
      actorId: ops.session.user.id,
      rawFileId,
      priorFileId: prior.id,
      circuitId: file.circuitId,
      period: file.period,
    });
    return {
      duplicate: {
        rawFileId: prior.id,
        fileName: prior.fileName,
        uploadedAt: prior.uploadedAt.toISOString(),
        daysProduced: prior.daysProduced,
        readingsUsedInCalculation: usedCount,
      },
    };
  }

  const dates = parsed.days.map((d) => utcDayOf(d.date));
  const stored = await db.meterReading.findMany({
    where: { circuitId: file.circuitId, date: { in: dates }, source: "csv" },
  });
  const storedByDay = new Map(stored.map((r) => [r.date.getTime(), r]));

  // INV-03 — a released calculation's evidence is immutable. This refuses the
  // whole commit rather than importing the days that happen to be free: a
  // month split between two files, one of which was silently skipped, is a
  // worse outcome than a refusal that names the problem.
  const locked = stored.filter((r) => r.usedInCalculationId !== null);
  if (locked.length > 0) {
    logger.warn("ingest.commit_refused_released", {
      actorId: ops.session.user.id,
      rawFileId,
      lockedDays: locked.length,
    });
    return {
      error: `${locked.length} day${locked.length === 1 ? " has" : "s have"} already been billed and can't be changed. Raise a correction against that invoice instead.`,
    };
  }

  const now = new Date();
  const anomalyRows = detectAnomalies(
    parsed.days.map((d) => ({ date: d.date, kWh: d.kWh })),
    file.period,
  );

  await db.$transaction(async (tx) => {
    for (const day of parsed.days) {
      const key = utcDayOf(day.date).getTime();
      const existing = storedByDay.get(key);
      if (existing) {
        if (existing.kWh === day.kWh) continue; // identical is a silent no-op (SCR-080)
        await tx.meterReading.update({
          where: { id: existing.id },
          data: {
            kWh: day.kWh,
            intervalCount: day.intervalCount,
            rawFileId: file.id,
            supersededValue: existing.kWh,
            supersededAt: now,
            supersededByUserId: ops.session.user.id,
            // An exclusion is a judgment about a specific number. Once that
            // number is superseded the judgment no longer has a subject, and
            // carrying it forward would silently drop a day the corrected file
            // supplies — the exact day the operator re-uploaded to fix. The
            // decision itself is not erased: the ReadingAnomaly row that
            // recorded it stays, pointing at the superseded file. If the new
            // value is still unusable, detection below flags it again and the
            // operator decides against the evidence actually in the system.
            excludedAt: null,
            excludedById: null,
            excludedReason: null,
          },
        });
      } else {
        await tx.meterReading.create({
          data: {
            circuitId: file.circuitId,
            date: utcDayOf(day.date),
            kWh: day.kWh,
            intervalCount: day.intervalCount,
            source: "csv",
            rawFileId: file.id,
          },
        });
      }
    }

    // The previous file's own anomalies belong to a superseded interpretation.
    // Leaving them open would block billing on findings about numbers that are
    // no longer in the system.
    if (opts.replaceExisting && existingFiles.length > 0) {
      await tx.readingAnomaly.deleteMany({
        where: { rawFileId: { in: existingFiles.map((f) => f.id) }, status: "open" },
      });
      await tx.rawReadingFile.updateMany({
        where: { id: { in: existingFiles.map((f) => f.id) } },
        data: { status: "superseded", supersededById: file.id, supersededAt: now },
      });
    }

    // Re-running detection over the new day set is the authoritative verdict
    // for every day this file supplies, so an old flag is cleared before the
    // new ones are set — otherwise a day the corrected file makes ordinary
    // would keep reading as flagged forever. Days the new file does not cover
    // keep their flag, because they also keep the value it was raised about.
    if (opts.replaceExisting) {
      await tx.meterReading.updateMany({
        where: { circuitId: file.circuitId, date: { in: dates }, source: "csv" },
        data: { anomalyFlag: false },
      });
    }

    for (const f of anomalyRows) {
      await tx.readingAnomaly.create({
        data: {
          circuitId: file.circuitId,
          period: file.period,
          date: f.date,
          kind: f.kind,
          detail: f.detail,
          observedValue: f.observedValue,
          expectedValue: f.expectedValue,
          deviationPct: Number.isFinite(f.deviationPct ?? NaN) ? f.deviationPct : null,
          blocksBilling: f.blocksBilling,
          rawFileId: file.id,
        },
      });
    }

    await tx.meterReading.updateMany({
      where: {
        circuitId: file.circuitId,
        date: { in: anomalyRows.filter((f) => f.date).map((f) => f.date as Date) },
        source: "csv",
      },
      data: { anomalyFlag: true },
    });

    await tx.rawReadingFile.update({
      where: { id: file.id },
      data: {
        status: "committed",
        rowsParsed: parsed.rowsParsed,
        daysProduced: parsed.days.length,
      },
    });
  });

  const coverage = coverageOf(parsed.days, file.period);
  const blocking = anomalyRows.filter((f) => f.blocksBilling).length;
  logger.info("ingest.committed", {
    actorId: ops.session.user.id,
    rawFileId,
    circuitId: file.circuitId,
    period: file.period,
    days: parsed.days.length,
    anomalies: anomalyRows.length,
    blocking,
    replaced: opts.replaceExisting ?? false,
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/anomalies`);

  return {
    committed: {
      days: parsed.days.length,
      anomalies: anomalyRows.length,
      blocking,
      coverageDays: coverage.coverageDays,
      daysInMonth: coverage.daysInMonth,
    },
  };
}

/** FEAT-043-AC-5's other branch — keep what is already there. */
export async function discardUpload(rawFileId: string): Promise<SimpleOutcome> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };
  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") return { error: "This file has already been committed." };

  await db.rawReadingFile.update({
    where: { id: rawFileId },
    data: { status: "abandoned", aiError: "Discarded — the existing readings for this period were kept." },
  });
  logger.info("ingest.discarded_duplicate", { actorId: ops.session.user.id, rawFileId });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Server-side re-read of a stored raw file.
 *
 * Returns null rather than throwing when the object cannot be fetched, which
 * today includes the ordinary case: the app's IAM user is PutObject-only, so
 * until it is granted s3:GetObject on the Ingest/ prefix this always returns
 * null and the UI asks for the file to be re-attached. It is written this way
 * so that granting the permission is the only change needed for a refreshed
 * queue to resume on its own.
 */
export async function fetchRawText(rawFileId: string): Promise<{ text: string } | { error: string }> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the queue." };

  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key }));
    const text = await res.Body?.transformToString();
    if (!text) return { error: "The stored file was empty." };
    return { text };
  } catch (e) {
    logger.warn("ingest.raw_reread_unavailable", {
      rawFileId,
      message: e instanceof Error ? e.name : String(e),
    });
    return { error: "The stored file can't be read back yet — re-attach it to continue." };
  }
}
