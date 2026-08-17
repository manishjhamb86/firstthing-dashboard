"use server";

// CON-45 — the circuit-page reading flow: upload a vendor CSV under THIS
// circuit, review every produced day row by row, and commit only what the
// operator accepted. The system derives everything (phase, window, bands)
// from the circuit's own recorded dates; the operator decides everything
// that is a judgment (accept, reject, exclude from the average).
//
// Server-side re-derivation is the security model: the preview the client
// renders is presentation, and the commit recomputes every row from the raw
// file plus the stored mapping before writing a thing.

import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { resolveAdmin } from "@/lib/admin-permissions";
import { buildCircuitFlowReadingKey } from "@/lib/ingest-keys";
import { matchKnownFormat } from "@/lib/reading-formats";
import { applyMappingAllDays, MIN_PARSE_RATE, type ReadingMapping } from "@/lib/reading-normalize";
import {
  buildReviewRows,
  deriveUploadKind,
  extractionWindow,
  theoreticalDailyKwh,
  savingsPct,
  savingsBand,
  baselineAverage,
  classifyDay,
  addDays,
  periodSavingsSummary,
  type ReviewRow,
  type UploadKind,
  type SavingsBand,
  type VarianceBand,
} from "@/lib/circuit-load";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { BENCHMARK_MIN_PCT, BENCHMARK_MAX_PCT } from "@/lib/commissioning-anomaly";

type Outcome = { error: string } | { ok: true };

function circuitPath(societyId: string, circuitId: string) {
  return `/admin/societies/${societyId}/circuits/${circuitId}`;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Permissions ──────────────────────────────────────────────────────────
// Pre/post commissioning readings are PER-04's field data (manage_survey).
// Monitoring readings feed billing, and FEAT-043-AC-4 makes billing ingest
// an operations-lead action — both permissions, same as the global path.

type KindGate =
  | { error: string; admin?: never }
  | { error?: never; admin: NonNullable<Awaited<ReturnType<typeof resolveAdmin>>> };

async function requireForKind(kind: UploadKind): Promise<KindGate> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid." };
  const perms = admin.permissions as string[];
  if (!perms.includes("manage_survey")) {
    return { error: "Recording circuit readings is a field-survey action." };
  }
  if (kind === "monitoring" && !perms.includes("manage_pipeline")) {
    return {
      error: "Monthly monitoring readings feed billing — committing them is an operations-lead action.",
    };
  }
  return { admin };
}

// ── Shared derivation ────────────────────────────────────────────────────

async function loadCircuitForReadings(circuitId: string) {
  return db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      society: { select: { id: true, name: true } },
      devices: true,
      rescaleEvents: true,
      meterReadings: {
        where: { source: "csv" },
        orderBy: { date: "asc" },
      },
    },
  });
}

type Derived = {
  kind: UploadKind;
  rows: ReviewRow[];
  mapping: ReadingMapping;
  vendor: string;
  expectedIntervals: number;
  window: { from: Date; to: Date };
  theoretical: number | null;
  baselineNow: number | null;
  parse: { rowsAttempted: number; rowsUnparseable: number; daysInFile: number };
};

type Circuit = NonNullable<Awaited<ReturnType<typeof loadCircuitForReadings>>>;

function deriveReview(circuit: Circuit, fileText: string): Derived | { error: string } {
  if (!circuit.meterInstalledAt) {
    return { error: "Install and validate the meter first — readings only mean something against a recorded install date." };
  }

  const match = matchKnownFormat(fileText);
  if (!match) {
    return {
      error:
        "This file doesn't match a known meter format — only the SONOFF export is recognised here so far. Other manufacturers' formats will be added; meanwhile the Readings area's AI-assisted upload can map it by hand.",
    };
  }

  const parsed = applyMappingAllDays(fileText, match.mapping);
  if (parsed.rowsAttempted === 0) return { error: "This file has no data rows below the header." };
  const parseRate = (parsed.rowsAttempted - parsed.rowsUnparseable) / parsed.rowsAttempted;
  if (parseRate < MIN_PARSE_RATE) {
    return {
      error: `Only ${Math.round(parseRate * 100)}% of this file's rows could be read — that's not the format it matched as. Check the export.`,
    };
  }

  const kind = deriveUploadKind(circuit);
  const stored = circuit.meterReadings.map((r) => ({
    date: r.date,
    kWh: r.kWh,
    excluded: r.excludedAt !== null,
    released: r.usedInCalculationId !== null,
  }));
  const lastStoredDate = stored.length > 0 ? stored[stored.length - 1].date : null;
  const window = extractionWindow({
    kind,
    meterInstalledAt: circuit.meterInstalledAt,
    lastStoredDate,
    today: new Date(),
  });

  const theoretical = circuit.devices.length > 0 ? theoreticalDailyKwh(circuit.devices) : null;
  const baselineNow = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, new Date());

  const rows = buildReviewRows({
    kind,
    parsedDays: parsed.days,
    expectedIntervals: match.expectedIntervalsPerDay,
    window,
    meterInstalledAt: circuit.meterInstalledAt,
    lightReplacementDate: circuit.lightReplacementDate,
    stored,
    lastStoredDate,
    theoretical,
    baseline: baselineNow,
  });

  // INV-07 — a rescale mid-window changes the baseline a given day is judged
  // against. Replay the effective baseline per day rather than using one
  // number for the whole file.
  if (circuit.rescaleEvents.some((e) => !e.voidedAt)) {
    for (const row of rows) {
      if (row.phase !== "post_install") continue;
      const b = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, row.date);
      row.savingsPct = b === null ? null : savingsPct(b, row.kWh);
      row.savingsBand = row.savingsPct === null ? null : savingsBand(row.savingsPct);
    }
  }

  return {
    kind,
    rows,
    mapping: match.mapping,
    vendor: match.vendor,
    expectedIntervals: match.expectedIntervalsPerDay,
    window,
    theoretical,
    baselineNow,
    parse: {
      rowsAttempted: parsed.rowsAttempted,
      rowsUnparseable: parsed.rowsUnparseable,
      daysInFile: parsed.days.length,
    },
  };
}

// ── Upload: presign, record ──────────────────────────────────────────────

export async function getCircuitReadingUploadUrl(input: {
  circuitId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Recording circuit readings is a field-survey action." };
  }

  const circuit = await db.circuit.findUnique({
    where: { id: input.circuitId },
    include: { society: { select: { name: true } } },
  });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };
  if (!circuit.meterInstalledAt) {
    return { error: "Install and validate the meter first — readings only mean something against a recorded install date." };
  }

  const kind = deriveUploadKind(circuit);
  const key = buildCircuitFlowReadingKey({
    society: circuit.society.name,
    phase: kind,
    circuitId: circuit.id,
    fileName: input.fileName,
    uploadedAt: new Date(),
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );
  logger.info("circuit_ingest.presigned", { actorId: admin.id, circuitId: circuit.id, key, kind });
  return { uploadUrl, key };
}

/** Raw file first (CON-30): the bytes are in S3 before anything interprets them. */
export async function recordCircuitRawUpload(input: {
  circuitId: string;
  s3Key: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}): Promise<{ rawFileId: string } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Recording circuit readings is a field-survey action." };
  }

  const circuit = await db.circuit.findUnique({ where: { id: input.circuitId } });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };

  const kind = deriveUploadKind(circuit);
  const file = await db.rawReadingFile.create({
    data: {
      circuitId: circuit.id,
      period: null,
      ingestPhase: kind,
      s3Key: input.s3Key,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      status: "pending_normalization",
      uploadedById: admin.id,
    },
  });
  logger.info("circuit_ingest.raw_recorded", {
    actorId: admin.id,
    rawFileId: file.id,
    circuitId: circuit.id,
    kind,
    byteSize: input.byteSize,
  });
  return { rawFileId: file.id };
}

// ── Preview ──────────────────────────────────────────────────────────────

export type PreviewRowDTO = {
  date: string;
  kWh: number;
  intervalCount: number;
  partial: boolean;
  phase: string;
  disposition: string;
  storedKwh: number | null;
  variancePct: number | null;
  varianceBand: VarianceBand | null;
  savingsPct: number | null;
  savingsBand: SavingsBand | null;
};

export type CircuitPreviewDTO = {
  kind: UploadKind;
  vendor: string;
  expectedIntervals: number;
  windowFrom: string;
  windowTo: string;
  theoretical: number | null;
  baseline: number | null;
  rows: PreviewRowDTO[];
  actionable: number;
  changedStored: number;
  outOfWindow: number;
  released: number;
  parse: { rowsAttempted: number; rowsUnparseable: number; daysInFile: number };
  noInventoryWarning: boolean;
};

export async function previewCircuitReadings(
  rawFileId: string,
  fileText: string,
): Promise<{ preview: CircuitPreviewDTO } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Recording circuit readings is a field-survey action." };
  }

  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") return { error: "This file has already been committed." };
  if (file.status === "abandoned") return { error: "This upload was abandoned." };

  const circuit = await loadCircuitForReadings(file.circuitId);
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };

  const derived = deriveReview(circuit, fileText);
  if ("error" in derived) {
    await db.rawReadingFile.update({
      where: { id: file.id },
      data: { aiError: derived.error.slice(0, 500) },
    });
    return { error: derived.error };
  }

  await db.rawReadingFile.update({
    where: { id: file.id },
    data: {
      status: "ready",
      vendor: derived.vendor,
      confirmedMapping: derived.mapping as unknown as object,
      aiConfidence: "exact_signature",
      ingestPhase: derived.kind,
      rangeStart: derived.window.from,
      rangeEnd: derived.window.to,
      rowsParsed: derived.parse.rowsAttempted - derived.parse.rowsUnparseable,
      daysProduced: derived.parse.daysInFile,
    },
  });

  const rows = derived.rows.map<PreviewRowDTO>((r) => ({
    date: iso(r.date),
    kWh: r.kWh,
    intervalCount: r.intervalCount,
    partial: r.partial,
    phase: r.phase,
    disposition: r.disposition,
    storedKwh: r.storedKwh,
    variancePct: r.variancePct,
    varianceBand: r.varianceBand,
    savingsPct: r.savingsPct,
    savingsBand: r.savingsBand,
  }));

  logger.info("circuit_ingest.previewed", {
    actorId: admin.id,
    rawFileId,
    circuitId: circuit.id,
    kind: derived.kind,
    days: rows.length,
  });

  return {
    preview: {
      kind: derived.kind,
      vendor: derived.vendor,
      expectedIntervals: derived.expectedIntervals,
      windowFrom: iso(derived.window.from),
      windowTo: iso(derived.window.to),
      theoretical: derived.theoretical,
      baseline: derived.baselineNow,
      rows,
      actionable: derived.rows.filter((r) => r.disposition === "new" || r.disposition === "supersede").length,
      changedStored: derived.rows.filter((r) => r.disposition === "stored_changed").length,
      outOfWindow: derived.rows.filter((r) => r.disposition === "out_of_window").length,
      released: derived.rows.filter((r) => r.disposition === "released").length,
      parse: derived.parse,
      noInventoryWarning: derived.kind === "pre_install" && derived.theoretical === null,
    },
  };
}

// ── Commit ───────────────────────────────────────────────────────────────

export type RowDecision = {
  date: string; // YYYY-MM-DD
  save: boolean;
  /** pre-install rows only — false stores the day excluded from the average */
  countInAverage?: boolean;
  reason?: string;
};

export type CommitSummary = {
  saved: number;
  rejected: number;
  excluded: number;
  superseded: number;
  keptStored: number;
  baseline: number | null;
  benchmark: { pct: number; inBand: boolean } | null;
};

export async function commitCircuitReadings(
  rawFileId: string,
  fileText: string,
  decisions: RowDecision[],
): Promise<{ summary: CommitSummary } | { error: string }> {
  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") return { error: "This file has already been committed." };
  if (file.status === "abandoned") return { error: "This upload was abandoned." };

  const circuit = await loadCircuitForReadings(file.circuitId);
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };

  // Everything is re-derived from the file — the client's rows were never
  // authority. A decision for a day the derivation doesn't consider
  // actionable is ignored, whatever the client claimed about it.
  const derived = deriveReview(circuit, fileText);
  if ("error" in derived) return { error: derived.error };

  const gate = await requireForKind(derived.kind);
  if (gate.error !== undefined) {
    logger.warn("circuit_ingest.commit_refused", { rawFileId, circuitId: circuit.id, kind: derived.kind });
    return { error: gate.error };
  }
  const admin = gate.admin;

  const byDate = new Map(decisions.map((d) => [d.date, d]));
  const now = new Date();
  let saved = 0;
  let rejected = 0;
  let excluded = 0;
  let superseded = 0;

  const summaryAfter = await db.$transaction(async (tx) => {
    for (const row of derived.rows) {
      const decision = byDate.get(iso(row.date));

      if (row.disposition === "new") {
        if (decision && decision.save === false) {
          rejected++;
          continue;
        }
        // A partial day is stored but never counted — visible as a partial
        // day, not as a low reading (user's rule via ASSUM at review).
        const partialReason = row.partial
          ? `Partial day — ${row.intervalCount} of ${row.expectedIntervals} intervals in the export`
          : null;
        const deselected =
          row.phase === "pre_install" && decision?.countInAverage === false
            ? decision.reason?.trim() || "Deselected from the average at review"
            : null;
        const exclusionReason = partialReason ?? deselected;
        await tx.meterReading.create({
          data: {
            circuitId: circuit.id,
            date: row.date,
            kWh: row.kWh,
            intervalCount: row.intervalCount,
            expectedIntervals: row.expectedIntervals,
            source: "csv",
            rawFileId: file.id,
            ...(exclusionReason
              ? { excludedAt: now, excludedById: admin.id, excludedReason: exclusionReason }
              : {}),
          },
        });
        saved++;
        if (exclusionReason) excluded++;
      } else if (row.disposition === "supersede") {
        if (decision && decision.save === false) {
          rejected++;
          continue;
        }
        const existing = await tx.meterReading.findUnique({
          where: { circuitId_date_source: { circuitId: circuit.id, date: row.date, source: "csv" } },
        });
        if (!existing || existing.usedInCalculationId !== null) continue; // INV-03 re-checked inside the transaction
        await tx.meterReading.update({
          where: { id: existing.id },
          data: {
            kWh: row.kWh,
            intervalCount: row.intervalCount,
            expectedIntervals: row.expectedIntervals,
            rawFileId: file.id,
            supersededValue: existing.kWh,
            supersededAt: now,
            supersededByUserId: admin.id,
            // The judgment was about the value being replaced (MS-07's rule).
            excludedAt: null,
            excludedById: null,
            excludedReason: null,
          },
        });
        superseded++;
      }
      // stored_changed: warn-and-keep-stored — deliberately no write.
      // released / out_of_window / stored_match: nothing, by construction.
    }

    // INV-09's spirit for the monitoring path: a zero day is a meter fault
    // until shown otherwise, and it must be on record before the month bills.
    // Non-blocking colour bands cover everything else, per the user's rule
    // that the system warns and never stops.
    if (derived.kind === "monitoring") {
      const zeroDays = derived.rows.filter(
        (r) => r.disposition === "new" && r.kWh === 0 && !(byDate.get(iso(r.date))?.save === false),
      );
      for (const z of zeroDays) {
        await tx.readingAnomaly.create({
          data: {
            circuitId: circuit.id,
            period: iso(z.date).slice(0, 7),
            date: z.date,
            kind: "zero_reading",
            detail: `${iso(z.date)} recorded 0 kWh. A metered lighting circuit does not consume nothing for a day — this is a meter or export fault until shown otherwise.`,
            observedValue: 0,
            blocksBilling: true,
            rawFileId: file.id,
          },
        });
      }
    }

    await tx.rawReadingFile.update({
      where: { id: file.id },
      data: { status: "committed", rangeStart: derived.window.from, rangeEnd: derived.window.to },
    });

    return recomputeCircuitFigures(tx, circuit.id);
  });

  logger.info("circuit_ingest.committed", {
    actorId: admin.id,
    rawFileId,
    circuitId: circuit.id,
    kind: derived.kind,
    saved,
    rejected,
    excluded,
    superseded,
    keptStored: derived.rows.filter((r) => r.disposition === "stored_changed").length,
    baseline: summaryAfter.baseline,
    benchmark: summaryAfter.benchmark,
  });
  // Deliberately no revalidatePath here: refreshing the tree immediately can
  // advance the step accordion and unmount the panel before its "saved"
  // summary ever renders — the operator sees their form vanish instead of the
  // outcome. The panel shows the summary and refreshes the page when the
  // operator dismisses it.

  return {
    summary: {
      saved,
      rejected,
      excluded,
      superseded,
      keptStored: derived.rows.filter((r) => r.disposition === "stored_changed").length,
      baseline: summaryAfter.baseline,
      benchmark: summaryAfter.benchmark,
    },
  };
}

/** FEAT-044-AC-3's shape, kept: walk away and nothing partial stays behind. */
export async function abortCircuitUpload(rawFileId: string, reason: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Recording circuit readings is a field-survey action." };
  }
  if (!reason.trim()) return { error: "Say why this upload is being abandoned." };

  const file = await db.rawReadingFile.findUnique({
    where: { id: rawFileId },
    include: { _count: { select: { readings: true } } },
  });
  if (!file) return { error: "That upload is no longer in the queue." };
  if (file.status === "committed") return { error: "This file's readings are already committed." };
  if (file._count.readings > 0) {
    return { error: "This file already has readings attached — commit wrote them, so it can't be abandoned." };
  }

  await db.rawReadingFile.update({
    where: { id: rawFileId },
    data: { status: "abandoned", aiError: reason.trim().slice(0, 500) },
  });
  logger.info("circuit_ingest.aborted", { actorId: admin.id, rawFileId, reason: reason.trim() });
  return { ok: true };
}

// ── Post-hoc exclusion (the user's rule, 2026-08-17) ─────────────────────
// Before a report generates, specific dates can be excluded from every
// average and report from then on. The stamp is the same excludedAt the
// billing path honors, so there is exactly one mechanism.

export async function setReadingExclusion(
  readingId: string,
  exclude: boolean,
  reason: string,
): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid." };
  const perms = admin.permissions as string[];
  if (!perms.includes("manage_survey")) {
    return { error: "Excluding a reading is a field-survey action." };
  }

  const reading = await db.meterReading.findUnique({
    where: { id: readingId },
    include: {
      circuit: {
        select: {
          id: true,
          societyId: true,
          meterInstalledAt: true,
          lightReplacementDate: true,
          benchmarkSavingsPct: true,
          voidedAt: true,
        },
      },
    },
  });
  if (!reading || reading.circuit.voidedAt) return { error: "That reading no longer exists." };
  if (reading.usedInCalculationId !== null) {
    return { error: "This day has already been billed on a released calculation — it can't be changed (INV-03)." };
  }
  if (exclude && !reason.trim()) return { error: "Say why this day is being excluded — the report will show it." };

  const phase = reading.circuit.meterInstalledAt
    ? classifyDay(reading.date, reading.circuit.meterInstalledAt, reading.circuit.lightReplacementDate)
    : null;

  // The baseline freezes when the lights are replaced; the benchmark freezes
  // when it is confirmed. Changing an input after its output is in force
  // would silently restate a figure someone was already shown.
  if (phase === "pre_install" && reading.circuit.lightReplacementDate !== null) {
    return {
      error:
        "The lights have been replaced — the pre-install set and its average are frozen as the baseline the savings are measured against.",
    };
  }
  if (phase === "post_install" && reading.circuit.benchmarkSavingsPct !== null) {
    return {
      error: "The benchmark is confirmed — post-install days behind it are frozen. A billing-month day can still be excluded until it is billed.",
    };
  }
  if (phase === "post_install" && reading.circuit.benchmarkSavingsPct === null && !perms.includes("manage_pipeline")) {
    // Post rows drive the benchmark decision — ops-lead once it's about money.
    return { error: "Excluding a post-install day changes the benchmark computation — that's an operations-lead action." };
  }

  await db.$transaction(async (tx) => {
    await tx.meterReading.update({
      where: { id: reading.id },
      data: exclude
        ? { excludedAt: new Date(), excludedById: admin.id, excludedReason: reason.trim() }
        : { excludedAt: null, excludedById: null, excludedReason: null },
    });
    await recomputeCircuitFigures(tx, reading.circuit.id);
  });

  logger.info("circuit_ingest.exclusion_set", {
    actorId: admin.id,
    readingId,
    circuitId: reading.circuit.id,
    exclude,
    reason: reason.trim() || null,
  });
  revalidatePath(circuitPath(reading.circuit.societyId, reading.circuit.id));
  return { ok: true };
}

// ── The recompute — one function, called by every write path ─────────────
// preInstallBaseline is the average of non-excluded pre-install days, until
// the replacement freezes it. The benchmark decision (CON-20's band) runs
// whenever post days exist and no benchmark is confirmed yet.

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function recomputeCircuitFigures(
  tx: Tx,
  circuitId: string,
): Promise<{ baseline: number | null; benchmark: { pct: number; inBand: boolean } | null }> {
  const circuit = await tx.circuit.findUnique({
    where: { id: circuitId },
    include: {
      rescaleEvents: true,
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
  });
  if (!circuit || !circuit.meterInstalledAt) return { baseline: null, benchmark: null };

  const phases = circuit.meterReadings.map((r) => ({
    r,
    phase: classifyDay(r.date, circuit.meterInstalledAt!, circuit.lightReplacementDate),
  }));

  let baseline = circuit.preInstallBaseline;
  const updates: Record<string, unknown> = {};

  // Baseline: recomputed while unfrozen (no replacement yet).
  if (circuit.lightReplacementDate === null) {
    const preDays = phases
      .filter((p) => p.phase === "pre_install")
      .map((p) => ({ date: p.r.date, kWh: p.r.kWh, excluded: p.r.excludedAt !== null }));
    baseline = baselineAverage(preDays);
    updates.preInstallBaseline = baseline;
    if (circuit.preInstallWindowStartAt === null && preDays.length > 0) {
      updates.preInstallWindowStartAt = addDays(circuit.meterInstalledAt, 1);
    }
    if (baseline !== null && (circuit.state === "meter_installed" || circuit.state === "pre_install_monitoring")) {
      updates.state = "awaiting_installation";
    } else if (baseline === null && circuit.state === "meter_installed" && preDays.length > 0) {
      updates.state = "pre_install_monitoring";
    }
  }

  // Benchmark: decided while unconfirmed and post days exist.
  let benchmark: { pct: number; inBand: boolean } | null = null;
  if (circuit.lightReplacementDate !== null && circuit.benchmarkSavingsPct === null) {
    const postDays = phases
      .filter((p) => p.phase === "post_install")
      .map((p) => ({ kWh: p.r.kWh, excluded: p.r.excludedAt !== null, date: p.r.date }));
    const live = postDays.filter((d) => !d.excluded);
    if (live.length > 0) {
      const lastDate = live[live.length - 1].date;
      const effBaseline = effectiveBaselineAt(baseline, circuit.rescaleEvents, lastDate);
      const summary = periodSavingsSummary(effBaseline, live);
      if (summary.savingsPct !== null && summary.averageKwh !== null && effBaseline !== null) {
        const pct = summary.savingsPct;
        const inBand = pct >= BENCHMARK_MIN_PCT && pct <= BENCHMARK_MAX_PCT;
        benchmark = { pct, inBand };
        updates.postInstallBaseline = summary.averageKwh;
        if (circuit.postInstallWindowStartAt === null) {
          updates.postInstallWindowStartAt = addDays(circuit.lightReplacementDate, 1);
        }
        if (inBand) {
          // FEAT-014's semantics kept: the benchmark is a system computation.
          updates.benchmarkSavingsPct = pct;
          updates.state = "benchmark_confirmed";
        } else {
          // Outside CON-20's band no benchmark is written; the existing
          // FEAT-015 review queue takes over — same escalation the window
          // flow used, raised from the same computation.
          if (circuit.state !== "benchmark_review") {
            updates.state = "benchmark_review";
            const occurrence =
              (await tx.demoResultReview.count({ where: { circuitId: circuit.id } })) + 1;
            await tx.demoResultReview.create({
              data: {
                circuitId: circuit.id,
                occurrence,
                measuredSavingsPct: pct,
                preInstallBaseline: effBaseline,
                postInstallAverage: summary.averageKwh,
              },
            });
          }
        }
      }
    } else if (circuit.state === "post_install_pending") {
      updates.state = "post_install_monitoring";
    }
    if (live.length > 0 && circuit.state === "post_install_pending" && !updates.state) {
      updates.state = "post_install_monitoring";
    }
  }

  if (Object.keys(updates).length > 0) {
    await tx.circuit.update({ where: { id: circuit.id }, data: updates });
  }
  return { baseline, benchmark };
}

// ── The pre-install report's investigate hook ────────────────────────────
// Beyond ±10% average variance the report offers "investigate" alongside
// "proceed". Raising it files a ReadingAnomaly into the existing queue —
// non-blocking (nothing in this flow stops anyone), but on record with an
// owner the moment someone picks it up there.

export async function raisePreInstallInvestigation(
  circuitId: string,
  note: string,
  variancePct: number,
): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin || !(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Raising an investigation is a field-survey action." };
  }
  if (!note.trim()) return { error: "Say what the inspector should look for." };

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: { id: true, societyId: true, voidedAt: true },
  });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };

  const period = new Date().toISOString().slice(0, 7);
  await db.readingAnomaly.create({
    data: {
      circuitId: circuit.id,
      period,
      kind: "out_of_range",
      detail: `Pre-installation average varies ${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}% from the circuit's theoretical load — assigned for on-site investigation: ${note.trim()}`,
      deviationPct: variancePct,
      blocksBilling: false,
    },
  });
  logger.info("circuit_ingest.investigation_raised", {
    actorId: admin.id,
    circuitId: circuit.id,
    variancePct,
  });
  revalidatePath(circuitPath(circuit.societyId, circuit.id));
  return { ok: true };
}
