"use server";

// CON-47 / FEAT-109 — invoice intake: a Zoho PDF becomes a society-month of
// record. The shape of every action here is this codebase's standing one:
// requireBillingOps() (the PER-01 proxy), a typed { error } on refusal —
// never a throw, which surfaces as an opaque production digest — and every
// refusal logged so a verification can tell a server refusal from a form
// that never submitted.
//
// Nothing the AI proposes reaches a row until the operator has confirmed it
// on SCR-094: `extractIntake` stores the extraction and a PROPOSED review,
// `saveIntakeReview` stores what the operator actually chose, and
// `submitIntake` re-derives everything from that confirmed review inside
// the transaction — the client's preview is never trusted.

import { normaliseGstin, refuseRetailCustomer, retailNameKey } from "@/lib/retail-customer";
import { bulkActionsFor } from "@/lib/intake-bulk";
import { releaseCalculation } from "../[calculationId]/invoice-actions";
import { duplicateRefuses, findDuplicateInvoice, type InvoiceDuplicate } from "@/lib/invoice-duplicate";
import { revalidatePath } from "next/cache";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildInvoiceKey } from "@/lib/ingest-keys";
import { buildDocumentKey } from "@/lib/document-keys";
import { fileStoredDocumentForSociety } from "@/app/admin/documents/actions";
import { sniffKind } from "@/lib/file-signature";
import { INTAKE_SERVICE_LINE, runIntakeExtraction } from "@/lib/invoice-intake-extract";
import {
  allocateLine,
  arithmeticReport,
  lineAllocations,
  openItems,
  type CircuitOption,
  type Review,
} from "@/lib/invoice-intake";
import { deriveInvoiceMonth, type DerivedMonth } from "@/lib/invoice-month";
import { loadInvoiceMonthContext } from "@/lib/invoice-month-loader";
import { daysInPeriod } from "@/lib/reading-normalize";
import { requireAccountant, requireBillingOps } from "../access";

const INTAKE_PATH = "/admin/billing/intake";
const MAX_BYTES = 20 * 1024 * 1024;

/** Invoice-first months are lighting for now — every contract on record is. */
const SERVICE_LINE = INTAKE_SERVICE_LINE;

type Result<T = object> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

function slug(s: string): string {
  return s.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "invoice";
}

// ---------------------------------------------------------------------------
// 1. Upload — the bytes reach S3 before anything interprets them (CON-30).
// ---------------------------------------------------------------------------

/**
 * FEAT-109 (2026-09-15, user-caught duplicate rows): before anything is
 * uploaded, the browser sends each file's SHA-256 and learns which are
 * already here — so a file dropped twice becomes "reprocess or skip" on the
 * existing row, never a second row. A submitted one cannot be reprocessed
 * from here at all: that is a month of record, and the route is void-and-
 * reattach on the month.
 */
export type IntakeDuplicate = {
  hash: string;
  intakeId: string;
  fileName: string;
  status: string;
  society: string | null;
  period: string | null;
  uploadedAt: string;
  /** Whether "reprocess" is offered — never for a submitted month. */
  reprocessable: boolean;
};

export async function checkIntakeDuplicates(hashes: string[]): Promise<Result<{ duplicates: IntakeDuplicate[] }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const rows = await db.invoiceIntake.findMany({
    where: { fileHash: { in: hashes }, status: { not: "discarded" } },
    include: { society: { select: { name: true } } },
    orderBy: { uploadedAt: "desc" },
  });
  const seen = new Set<string>();
  const duplicates: IntakeDuplicate[] = [];
  for (const r of rows) {
    if (!r.fileHash || seen.has(r.fileHash)) continue; // the newest row per file
    seen.add(r.fileHash);
    duplicates.push({
      hash: r.fileHash,
      intakeId: r.id,
      fileName: r.fileName,
      status: r.status,
      society: r.society?.name ?? null,
      period: r.period,
      uploadedAt: r.uploadedAt.toISOString(),
      reprocessable: r.status !== "submitted",
    });
  }
  return { duplicates };
}

export async function createIntakeUpload(input: {
  fileName: string;
  fileSize: number;
  contentType: string;
  /** The file's first bytes, base64 — what the file IS, not what it is named. */
  headBase64: string;
  /** SHA-256 of the whole file, hex — computed in the browser. */
  fileHash: string;
}): Promise<Result<{ intakeId: string; uploadUrl: string; key: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };

  // Belt and braces behind the client's own check: the same bytes never
  // become a second live row.
  const existing = await db.invoiceIntake.findFirst({
    where: { fileHash: input.fileHash, status: { not: "discarded" } },
    select: { id: true, status: true },
  });
  if (existing) {
    logger.warn("intake.upload_refused", { actorId: ops.actor.id, fileName: input.fileName, reason: "duplicate", existing: existing.id });
    return { error: `${input.fileName} is already here (${existing.status.replace("_", " ")}) — reprocess it from its row instead of uploading it again.` };
  }

  const kind = sniffKind(new Uint8Array(Buffer.from(input.headBase64, "base64")));
  if (kind !== "pdf") {
    logger.warn("intake.upload_refused", { actorId: ops.actor.id, fileName: input.fileName, kind });
    return { error: `${input.fileName} is not a PDF (its contents look like ${kind}). Zoho exports invoices as PDF.` };
  }
  if (input.fileSize > MAX_BYTES) {
    return { error: `${input.fileName} is ${(input.fileSize / 1024 / 1024).toFixed(1)} MB — the cap is 20 MB.` };
  }

  const intake = await db.invoiceIntake.create({
    data: {
      fileName: input.fileName,
      fileSize: input.fileSize,
      fileHash: input.fileHash,
      s3Key: "pending",
      uploadedById: ops.actor.id,
      // Stored first; read when the operator asks (a single file is read
      // straight away by its own upload path, a batch one row at a time).
      status: "uploaded",
    },
  });
  // The society and month are not known yet, so the object lands under a
  // holding key; submit copies it to the canonical key (ADR-011).
  const key = `Invoices/_intake/${intake.id}_${slug(input.fileName)}.pdf`;
  await db.invoiceIntake.update({ where: { id: intake.id }, data: { s3Key: key } });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: "application/pdf" }),
    { expiresIn: 300 },
  );
  logger.info("intake.upload_presigned", { actorId: ops.actor.id, intakeId: intake.id, key });
  return { intakeId: intake.id, uploadUrl, key };
}

// ---------------------------------------------------------------------------
// 2. Extract — and turn the extraction into a PROPOSED review.
// ---------------------------------------------------------------------------

/**
 * Retry a failed read on the SAME row (user-asked 2026-09-15: "give retry
 * option for already failed but uploaded invoices") — the bytes are already
 * in storage; nothing is uploaded again.
 */
export async function retryIntake(intakeId: string): Promise<Result<{ status: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId }, select: { status: true } });
  if (!intake) return { error: "That upload no longer exists." };
  if (intake.status === "submitted") return { error: "This invoice has already been submitted — void the month to change it." };
  await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "reading", extractionError: null } });
  logger.info("intake.retry", { actorId: ops.actor.id, intakeId, from: intake.status });
  revalidatePath(INTAKE_PATH);
  return extractIntake(intakeId);
}

/**
 * The permission-checked, revalidating shell around `runIntakeExtraction`
 * (src/lib/invoice-intake-extract.ts) — the same function the background
 * sweep (scripts/job-worker.ts) calls directly, so a person's own click and
 * an automatic pass read an invoice through the identical pipeline.
 */
export async function extractIntake(intakeId: string): Promise<Result<{ status: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const result = await runIntakeExtraction(intakeId, ops.actor.id);
  revalidatePath(INTAKE_PATH);
  return result;
}

// ---------------------------------------------------------------------------
// 3. Review — what the operator confirmed, and the live preview of its effect.
// ---------------------------------------------------------------------------

async function duplicateFor(review: Review) {
  return findDuplicateInvoice({ societyId: review.retailSale ? null : review.societyId, period: review.period, invoiceNumber: review.invoiceNumber, serviceLine: SERVICE_LINE });
}

export type IntakePreview = {
  openItems: string[];
  arithmetic: ReturnType<typeof arithmeticReport>;
  derived: DerivedMonth | null;
  circuitOptions: CircuitOption[];
  contextNotes: string[];
  duplicateOf: InvoiceDuplicate | null;
};

async function buildPreview(review: Review): Promise<IntakePreview> {
  const duplicateOf = await duplicateFor(review);
  const items = openItems(review, { duplicateOf });
  const arithmetic = arithmeticReport(review);
  let derived: DerivedMonth | null = null;
  let circuitOptions: CircuitOption[] = [];
  let contextNotes: string[] = [];
  if (review.societyId && !review.retailSale) {
    const period = /^\d{4}-\d{2}$/.test(review.period) ? review.period : "2000-01";
    const ctx = await loadInvoiceMonthContext({ societyId: review.societyId, serviceLine: SERVICE_LINE, period });
    circuitOptions = ctx.circuitOptions;
    contextNotes = ctx.notes;
    if (/^\d{4}-\d{2}$/.test(review.period)) {
      // One derive line per circuit a review line bills (a split line
      // yields several, its amount shared in proportion to the lights).
      const serviceLines = review.lines.filter((l) => l.kind === "service").flatMap((l) => allocateLine(l));
      derived = deriveInvoiceMonth({ period: review.period, parts: ctx.parts, lines: serviceLines, readingsByCircuit: ctx.readingsByCircuit });
    }
  }
  return { openItems: items, arithmetic, derived, circuitOptions, contextNotes, duplicateOf };
}

export async function previewIntake(intakeId: string, review: Review): Promise<Result<IntakePreview>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId }, select: { id: true } });
  if (!intake) return { error: "That upload no longer exists." };
  return buildPreview(review);
}

export async function saveIntakeReview(intakeId: string, review: Review): Promise<Result<{ status: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId } });
  if (!intake) return { error: "That upload no longer exists." };
  if (intake.status === "submitted") return { error: "This invoice has already been submitted." };
  const duplicateOf = await duplicateFor(review);
  const items = openItems(review, { duplicateOf });
  const status = duplicateRefuses(duplicateOf, review.nonServiceInvoice) ? "refused_duplicate" : items.length === 0 ? "ready" : "needs_review";
  await db.invoiceIntake.update({
    where: { id: intakeId },
    data: {
      review: review as unknown as Prisma.InputJsonValue,
      societyId: review.societyId,
      period: /^\d{4}-\d{2}$/.test(review.period) ? review.period : null,
      status,
    },
  });
  revalidatePath(INTAKE_PATH);
  return { status };
}

// ---------------------------------------------------------------------------
// 3b. A real, separate non-service bill — filed, never derived from.
// ---------------------------------------------------------------------------

/**
 * The bytes are copied from the intake's holding key to the society's own
 * `Documents/` tree (the same GET-then-PUT `submitIntake` already does for
 * the calculation path — this app's IAM user cannot copy or delete an S3
 * object) and filed through the exact function the Documents tab and the
 * executed-agreement upload both already use, so a duplicate re-file is
 * caught the same way theirs is (`fileStoredDocumentForSociety`'s own
 * content-hash check). No `MonthlyCalculation` is created — there is
 * nothing to derive from an invoice with no service line, and creating one
 * anyway would be the fabricated figure INV-02 exists to prevent.
 */
async function fileNonServiceInvoice(
  intake: { id: string; s3Key: string; fileName: string },
  review: Review,
  actorId: string,
  docType: "nonServiceInvoice" | "invoiceCopy" = "nonServiceInvoice",
): Promise<Result<{ calculationId: string | null }>> {
  const societyId = review.societyId!;
  const period = review.period;
  const society = await db.society.findUnique({ where: { id: societyId }, select: { name: true } });
  if (!society) return { error: "That society no longer exists." };

  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: intake.s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    return { error: "The uploaded file could not be read back from storage. Upload it again." };
  }

  const key = buildDocumentKey({
    society: society.name,
    month: period,
    docType,
    dateLabel: review.invoiceDate || period,
    identifier: review.invoiceNumber.trim() || intake.id,
    extension: "pdf",
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: "application/pdf" }));

  const filed = await fileStoredDocumentForSociety({
    societyId,
    docType,
    s3Key: key,
    fileName: intake.fileName,
    contentType: "application/pdf",
    byteSize: bytes.length,
    period,
    actorId,
  });
  if (filed.error) return { error: filed.error };

  await db.invoiceIntake.update({
    where: { id: intake.id },
    data: {
      status: "submitted",
      review: review as unknown as Prisma.InputJsonValue,
      societyId,
      period,
      submittedAt: new Date(),
      filedAsDocumentId: filed.documentId,
    },
  });
  logger.info(docType === "invoiceCopy" ? "intake.filed_as_document" : "intake.filed_as_non_service_document", {
    actorId,
    intakeId: intake.id,
    documentId: filed.documentId,
    societyId,
    period,
    invoiceNumber: review.invoiceNumber.trim(),
  });
  revalidatePath(INTAKE_PATH);
  return { calculationId: null };
}

// ---------------------------------------------------------------------------
// 4. Submit — the month of record, from the confirmed review, in one transaction.
// ---------------------------------------------------------------------------

export async function submitIntake(intakeId: string, review: Review): Promise<Result<{ calculationId: string | null }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId } });
  if (!intake) return { error: "That upload no longer exists." };
  if (intake.status === "submitted") return { error: "This invoice has already been submitted." };

  const preview = await buildPreview(review);
  if (preview.openItems.length > 0) {
    logger.warn("intake.submit_refused", { actorId: ops.actor.id, intakeId, openItems: preview.openItems });
    return { error: `Not ready to submit: ${preview.openItems.join(" · ")}` };
  }

  // A real, separate non-service bill (devices, installation, a one-off
  // charge) is not competing for this month's savings figure — file it as a
  // document instead of forcing it through a pipeline that has nothing to
  // derive from an all-"other" invoice (user-caught 2026-09-24).
  if (review.nonServiceInvoice && !review.retailSale) return fileNonServiceInvoice(intake, review, ops.actor.id);
  // A retail sale is billed to a retail customer, not a society's month.
  if (review.retailSale) return fileRetailInvoice(intake, review, ops.actor.id);

  const derived = preview.derived!;
  const societyId = review.societyId!;
  const period = review.period;

  const society = await db.society.findUnique({ where: { id: societyId }, select: { name: true } });
  if (!society) return { error: "That society no longer exists." };

  // GATE-02 — a released month is never restated here; the duplicate check
  // above already refused a live invoice. An unreleased readings-sourced
  // version for the same month is superseded by this one.
  const existing = await db.monthlyCalculation.findMany({
    where: { societyId, serviceLine: SERVICE_LINE, period },
    select: { id: true, version: true, status: true },
    orderBy: { version: "desc" },
  });
  if (existing.some((e) => e.status === "released")) {
    return { error: "This month is already released — it cannot be replaced from intake (GATE-02)." };
  }
  const version = (existing[0]?.version ?? 0) + 1;
  const daysInMonth = daysInPeriod(period);
  const singlePart = derived.lines.length > 0 && new Set(derived.lines.map((l) => l.contractId)).size === 1;
  const proration = singlePart ? derived.lines[0].proration : null;
  const termVersionId = singlePart
    ? (await loadInvoiceMonthContext({ societyId, serviceLine: SERVICE_LINE, period })).parts.find((p) => p.contractId === derived.lines[0].contractId)?.termVersionId ?? null
    : null;
  const measuredCoverage = derived.lines.filter((l) => l.basis === "measured").map((l) => l.coverageDays);
  const now = new Date();

  // Copy the bytes to the canonical key. This app's IAM user cannot copy or
  // delete an object, so it is a GET and a PUT; the holding-key object stays.
  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: intake.s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    return { error: "The uploaded file could not be read back from storage. Upload it again." };
  }

  const snapshot = {
    source: "invoice",
    period,
    invoice: { number: review.invoiceNumber, invoiceDate: review.invoiceDate, dueDate: review.dueDate, subtotal: review.subtotal, taxAmount: review.taxAmount, total: review.total },
    lines: derived.lines.map((l) => ({
      lineNo: l.lineNo,
      circuitId: l.circuitId,
      contractId: l.contractId,
      basis: l.basis,
      lightsBilled: l.lightsBilled,
      countDisagreement: l.countDisagreement,
      billedDays: l.billedDays,
      baselineKwhPerDay: l.baselineKwhPerDay,
      benchmarkSavingsPct: l.benchmarkSavingsPct,
      savingsPct: l.savingsPct,
      savedValue: l.savedValue,
      amount: l.amount,
      firsthingSharePct: l.firsthingSharePct,
      societyNet: l.societyNet,
      coverageDays: l.coverageDays,
      dayTally: l.dayTally,
      readingsNote: l.readingsNote,
      provenance: l.provenance,
    })),
    notDerivable: derived.notDerivable,
    arithmeticAcknowledgement: review.arithmeticAcknowledgement || null,
    contextNotes: preview.contextNotes,
  } satisfies Prisma.JsonObject;

  const calculationId = await db.$transaction(async (tx) => {
    for (const e of existing) {
      if (e.status !== "superseded") {
        await tx.monthlyCalculation.update({ where: { id: e.id }, data: { status: "superseded", supersededAt: now } });
      }
    }
    const calc = await tx.monthlyCalculation.create({
      data: {
        societyId,
        serviceLine: SERVICE_LINE,
        period,
        version,
        source: "invoice",
        status: "submitted",
        totalExtrapolatedKwh: derived.totals.extrapolatedConsumptionKwh,
        totalSavedKwh: derived.totals.savedKwh,
        totalSavedValue: derived.totals.savedValue,
        subtotal: derived.totals.amount,
        total: derived.totals.amount,
        proratedDays: proration?.proratedDays ?? null,
        daysInMonth: proration ? proration.daysInMonth : null,
        coverageDays: measuredCoverage.length > 0 ? Math.max(...measuredCoverage) : 0,
        coverageOfDays: daysInMonth,
        inputVersionSnapshot: snapshot,
        contractTermVersionId: termVersionId,
      },
    });
    if (existing[0]) {
      await tx.monthlyCalculation.update({ where: { id: existing[0].id }, data: { supersededById: calc.id } });
    }
    for (const l of derived.lines) {
      const readings = preview.derived ? undefined : undefined;
      void readings;
      await tx.circuitFeeLine.create({
        data: {
          monthlyCalculationId: calc.id,
          circuitId: l.circuitId,
          meteredKwh: l.basis === "measured" ? l.extrapolatedConsumptionKwh : 0,
          meteredLightCount: Math.round((l.baselineKwhPerDay > 0 ? l.lightsBilled : l.lightsBilled)),
          representedLightCount: l.lightsBilled,
          extrapolatedConsumption: l.extrapolatedConsumptionKwh,
          baselineKwhPerDay: l.baselineKwhPerDay,
          benchmarkSavingsPct: l.benchmarkSavingsPct,
          measuredSavingsPct: l.savingsPct,
          deviationPct: l.savingsPct - l.benchmarkSavingsPct,
          complianceResult: l.belowBand ? "out_of_band" : "in_band",
          approaching: false,
          pricingBasis: "fixed",
          consecutiveBreachCount: 0,
          savedKwh: l.savedKwh,
          savedValue: l.savedValue,
          amount: l.amount,
          coverageDays: l.coverageDays,
          basis: l.basis,
          invoiceLightCount: l.lightsBilled,
        },
      });
    }

    const key = buildInvoiceKey({ society: society.name, period, calculationId: calc.id, fileName: intake.fileName, uploadedAt: intake.uploadedAt });
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: "application/pdf" }));

    const paid = review.paid === "paid";
    const invoice = await tx.billingInvoice.create({
      data: {
        monthlyCalculationId: calc.id,
        number: review.invoiceNumber.trim(),
        issueDate: new Date(`${review.invoiceDate}T00:00:00Z`),
        dueDate: new Date(`${review.dueDate}T00:00:00Z`),
        amount: review.total!,
        subtotal: review.subtotal,
        taxAmount: review.taxAmount,
        // The printed words, verbatim ("July-2026") — `period` is the operator's own selection (INV-04).
        invoiceForMonth: (() => {
          const f = (intake.extraction as { invoiceForMonth?: { value?: string; sourceText?: string } } | null)?.invoiceForMonth;
          return f?.sourceText || f?.value || null;
        })(),
        extractionRaw: (intake.extraction ?? undefined) as Prisma.InputJsonValue | undefined,
        s3Key: key,
        fileName: intake.fileName,
        uploadedById: ops.actor.id,
        computedAmount: derived.totals.amount,
        reconciliationStatus: "not_applicable",
        status: paid ? "paid" : "attached",
        ...(paid ? { paymentStatusConfirmedAt: now, paymentStatusConfirmedById: ops.actor.id } : {}),
        lines: {
          create: review.lines.map((l) => ({
            lineNo: l.lineNo,
            description: l.description,
            hsn: l.hsn || null,
            qty: l.qty ?? 0,
            rate: l.rate ?? 0,
            discount: l.discount,
            taxPct: l.taxPct,
            taxAmount: l.taxAmount,
            amount: l.amount ?? 0,
            kind: l.kind,
            // A split line bills several circuits; the fee lines carry each
            // circuit's own share, so the invoice line points at none.
            circuitId: l.kind === "service" && lineAllocations(l).length === 1 ? lineAllocations(l)[0].circuitId : null,
            arithmeticOk: preview.arithmetic.lines.find((a) => a.lineNo === l.lineNo)?.check.ok ?? true,
            // A rounded-off line is reconciled and says so; the note stays on the record either way.
            arithmeticNote: (() => {
              const c = preview.arithmetic.lines.find((a) => a.lineNo === l.lineNo)?.check;
              return c && (!c.ok || c.rounded) ? c.note : null;
            })(),
            countDisagreement:
              lineAllocations(l).length === 1 ? (derived.lines.find((d) => d.lineNo === l.lineNo)?.countDisagreement ?? null) : null,
          })),
        },
      },
    });

    if (paid) {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: review.total!,
          confirmedAsOf: new Date(`${review.paidOn}T00:00:00Z`),
          reference: "Recorded as paid at invoice intake",
          recordedById: ops.actor.id,
        },
      });
    }

    // FEAT-109-AC-6 — a forward-only population correction, its own audit row.
    for (const l of review.lines) {
      if (l.kind !== "service") continue;
      for (const a of lineAllocations(l)) {
        const d = derived.lines.find((x) => x.lineNo === l.lineNo && x.circuitId === a.circuitId);
        if (!a.applyCountForward || !d || d.countDisagreement === null) continue;
        await tx.representedCountChange.create({
          data: {
            circuitId: a.circuitId,
            previousCount: d.countDisagreement,
            nextCount: d.lightsBilled,
            effectiveFrom: period,
            reason: `Applied from invoice ${review.invoiceNumber.trim()} (${period}), which billed ${d.lightsBilled} lights against a recorded ${d.countDisagreement}.`,
            billingInvoiceId: invoice.id,
            recordedById: ops.actor.id,
          },
        });
        await tx.circuit.update({ where: { id: a.circuitId }, data: { representedLightCount: d.lightsBilled } });
      }
    }

    await tx.invoiceIntake.update({
      where: { id: intakeId },
      data: {
        status: "submitted",
        review: review as unknown as Prisma.InputJsonValue,
        societyId,
        period,
        monthlyCalculationId: calc.id,
        billingInvoiceId: invoice.id,
        submittedAt: now,
      },
    });
    return calc.id;
  }, { timeout: 30_000 });

  logger.info("billing.invoice_month_submitted", {
    actorId: ops.actor.id,
    intakeId,
    calculationId,
    societyId,
    period,
    version,
    lines: derived.lines.length,
    notDerivable: derived.notDerivable.length,
    paid: review.paid,
    bases: derived.lines.map((l) => l.basis),
  });
  revalidatePath(INTAKE_PATH);
  revalidatePath("/admin/billing");
  return { calculationId };
}

// ---------------------------------------------------------------------------
// 4b. SCR-093's bulk bar — "Submit N ready". Each row still submits through
// the one function above; this only loops it, re-checking `ready` fresh per
// row rather than trusting the selection the client rendered a moment ago
// (a row can stop being ready between the list loading and the click — a
// duplicate landing, or the permission being pulled).
// ---------------------------------------------------------------------------

export type BatchSubmitResult = {
  submitted: string[];
  failed: { intakeId: string; fileName: string; error: string }[];
};

export async function submitReadyBatch(intakeIds: string[]): Promise<BatchSubmitResult> {
  const ops = await requireBillingOps();
  if (!ops.ok) {
    return { submitted: [], failed: intakeIds.map((id) => ({ intakeId: id, fileName: "", error: ops.error })) };
  }
  const ids = [...new Set(intakeIds)];
  const submitted: string[] = [];
  const failed: BatchSubmitResult["failed"] = [];

  for (const id of ids) {
    const intake = await db.invoiceIntake.findUnique({ where: { id }, select: { status: true, fileName: true, review: true } });
    if (!intake) {
      failed.push({ intakeId: id, fileName: "", error: "This upload no longer exists." });
      continue;
    }
    if (intake.status !== "ready") {
      failed.push({ intakeId: id, fileName: intake.fileName, error: "No longer ready to submit — open it to see why." });
      continue;
    }
    const result = await submitIntake(id, intake.review as unknown as Review);
    if (result.error) failed.push({ intakeId: id, fileName: intake.fileName, error: result.error });
    else submitted.push(id);
  }

  logger.info("intake.batch_submit_completed", { actorId: ops.actor.id, requested: ids.length, submitted: submitted.length, failed: failed.length });
  revalidatePath(INTAKE_PATH);
  return { submitted, failed };
}

// ---------------------------------------------------------------------------
// 5. Discard — the draft row; the PDF stays in S3 (undeletable by this app).
// ---------------------------------------------------------------------------

export async function discardIntake(intakeId: string, reason: string): Promise<Result> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId } });
  if (!intake) return { error: "That upload no longer exists." };
  if (intake.status === "submitted") return { error: "A submitted invoice cannot be discarded — void it from the month instead." };
  if (!reason.trim()) return { error: "Say why this upload is being discarded." };
  await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "discarded", discardedAt: new Date(), discardReason: reason.trim() } });
  logger.info("intake.discarded", { actorId: ops.actor.id, intakeId, reason: reason.trim() });
  revalidatePath(INTAKE_PATH);
  return {};
}

// ---------------------------------------------------------------------------
// 6. Bulk — file as document, release to society (2026-09-25, user-asked).
// Each row re-checks its own eligibility here with the same rule the list
// uses (src/lib/intake-bulk.ts); a row that fails is named, never rolled
// back silently, and the rows that succeeded stay done.
// ---------------------------------------------------------------------------

export type BulkResult = { done: number; failed: { fileName: string; error: string }[] };

/** File each row's PDF against its society and month instead of submitting it as a month of record. */
export async function fileIntakesAsDocuments(intakeIds: string[]): Promise<BulkResult> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { done: 0, failed: [{ fileName: "", error: ops.error }] };
  let done = 0;
  const failed: BulkResult["failed"] = [];
  for (const id of [...new Set(intakeIds)]) {
    const intake = await db.invoiceIntake.findUnique({ where: { id } });
    if (!intake) {
      failed.push({ fileName: "", error: "This upload no longer exists." });
      continue;
    }
    const review = intake.review as unknown as Review | null;
    const eligible = bulkActionsFor({
      status: intake.status,
      hasSociety: !!review?.societyId,
      hasPeriod: !!review && /^\d{4}-\d{2}$/.test(review.period),
    }).includes("file");
    if (!review || !eligible) {
      failed.push({ fileName: intake.fileName, error: "Needs a confirmed society and month, and must not be submitted already — open it to check." });
      continue;
    }
    const dup = await duplicateFor(review);
    if (dup?.sameNumber) {
      failed.push({ fileName: intake.fileName, error: `Invoice ${dup.number} is already on record — this is a second copy.` });
      continue;
    }
    try {
      const r = await fileNonServiceInvoice(intake, review, ops.actor.id, review.nonServiceInvoice ? "nonServiceInvoice" : "invoiceCopy");
      if (r.error) failed.push({ fileName: intake.fileName, error: r.error });
      else done += 1;
    } catch (err) {
      logger.error("intake.bulk_file_failed", { intakeId: id, error: err instanceof Error ? err.message : String(err) });
      failed.push({ fileName: intake.fileName, error: "Could not be filed — try this one on its own." });
    }
  }
  logger.info("intake.bulk_file_completed", { actorId: ops.actor.id, requested: intakeIds.length, done, failed: failed.length });
  revalidatePath(INTAKE_PATH);
  return { done, failed };
}

/**
 * Put rows in front of the society: a filed invoice goes onto its portal
 * Documents page; a submitted month is released through the accountant's
 * own release (CON-33). Both are the accountant's act.
 */
export async function releaseIntakesToSociety(intakeIds: string[]): Promise<BulkResult> {
  const acc = await requireAccountant();
  if (!acc.ok) return { done: 0, failed: [{ fileName: "", error: acc.error }] };
  let done = 0;
  const failed: BulkResult["failed"] = [];
  for (const id of [...new Set(intakeIds)]) {
    const intake = await db.invoiceIntake.findUnique({ where: { id } });
    if (!intake || intake.status !== "submitted") {
      failed.push({ fileName: intake?.fileName ?? "", error: "Not filed or submitted — nothing to release." });
      continue;
    }
    if (intake.filedAsDocumentId) {
      const updated = await db.storedDocument.updateMany({
        where: { id: intake.filedAsDocumentId, voidedAt: null, releasedToSocietyAt: null },
        data: { releasedToSocietyAt: new Date(), releasedToSocietyById: acc.actor.id },
      });
      if (updated.count === 1) {
        done += 1;
        logger.info("intake.filed_document_released", { actorId: acc.actor.id, intakeId: id, documentId: intake.filedAsDocumentId });
      } else failed.push({ fileName: intake.fileName, error: "Already released, or the filed document was withdrawn." });
      continue;
    }
    if (!intake.monthlyCalculationId) {
      failed.push({ fileName: intake.fileName, error: "No month is linked to this row." });
      continue;
    }
    const r = await releaseCalculation(intake.monthlyCalculationId);
    if (r.error) failed.push({ fileName: intake.fileName, error: r.error });
    else done += 1;
  }
  logger.info("intake.bulk_release_completed", { actorId: acc.actor.id, requested: intakeIds.length, done, failed: failed.length });
  revalidatePath(INTAKE_PATH);
  return { done, failed };
}

// ---------------------------------------------------------------------------
// 7. Retail sales (2026-09-25, user-asked) — an invoice billed to a retail
// customer (a society or not) is filed as a RetailInvoice: kept, listed on
// the customer, never a month of record or a savings figure (INV-02).
// ---------------------------------------------------------------------------

async function fileRetailInvoice(
  intake: { id: string; s3Key: string; fileName: string },
  review: Review,
  actorId: string,
): Promise<Result<{ calculationId: string | null }>> {
  const customer = await db.retailCustomer.findUnique({ where: { id: review.retailCustomerId! }, select: { id: true, name: true } });
  if (!customer) return { error: "That retail customer no longer exists." };

  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: intake.s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    return { error: "The uploaded file could not be read back from storage. Upload it again." };
  }
  const slug = customer.name.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Customer";
  const ident = (review.invoiceNumber.trim() || intake.id).replace(/[^a-zA-Z0-9-]+/g, "_");
  const key = `Documents/Retail/${slug}/${review.period}/${slug}_RetailInvoice_${ident}.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: "application/pdf" }));

  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
  const retail = await db.$transaction(async (tx) => {
    const inv = await tx.retailInvoice.create({
      data: {
        customerId: customer.id,
        invoiceNumber: review.invoiceNumber.trim(),
        invoiceDate: day(review.invoiceDate),
        dueDate: day(review.dueDate),
        period: review.period,
        subtotal: review.subtotal,
        taxAmount: review.taxAmount,
        total: review.total ?? 0,
        paid: review.paid === "paid",
        paidOn: review.paid === "paid" ? day(review.paidOn) : null,
        advanceAmount: review.paid === "unpaid" && review.advanceAmount ? review.advanceAmount : null,
        advanceOn: review.paid === "unpaid" && review.advanceAmount ? day(review.advanceOn ?? "") : null,
        s3Key: key,
        fileName: intake.fileName,
        createdById: actorId,
      },
    });
    await tx.invoiceIntake.update({
      where: { id: intake.id },
      data: {
        status: "submitted",
        review: review as unknown as Prisma.InputJsonValue,
        societyId: null,
        period: review.period,
        submittedAt: new Date(),
        retailInvoiceId: inv.id,
      },
    });
    return inv;
  });
  logger.info("intake.filed_as_retail_sale", { actorId, intakeId: intake.id, retailInvoiceId: retail.id, customerId: customer.id, invoiceNumber: retail.invoiceNumber });
  revalidatePath(INTAKE_PATH);
  revalidatePath(`/admin/retail-customers/${customer.id}`);
  return { calculationId: null };
}

/** Create a retail customer — from an invoice's own bill-to, or by hand. Duplicates are refused. */
export async function createRetailCustomer(input: {
  name: string;
  gstin: string;
  address: string;
  phone: string;
  email: string;
  societyId: string | null;
}): Promise<Result<{ id: string; name: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const refusal = refuseRetailCustomer(input);
  if (refusal) return { error: refusal };
  const nameKey = retailNameKey(input.name);
  const gstin = normaliseGstin(input.gstin);
  const existing = await db.retailCustomer.findFirst({
    where: { OR: [{ nameKey }, ...(gstin ? [{ gstin }] : [])] },
    select: { name: true, gstin: true },
  });
  if (existing) {
    return {
      error:
        gstin && existing.gstin === gstin
          ? `A retail customer with GSTIN ${gstin} already exists (${existing.name}) — choose them instead.`
          : `A retail customer named "${existing.name}" already exists — choose them instead.`,
    };
  }
  const created = await db.retailCustomer.create({
    data: {
      name: input.name.trim(),
      nameKey,
      gstin,
      address: input.address.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      societyId: input.societyId || null,
      createdById: ops.actor.id,
    },
    select: { id: true, name: true },
  });
  logger.info("retail_customer.created", { actorId: ops.actor.id, customerId: created.id, name: created.name });
  revalidatePath("/admin/retail-customers");
  return created;
}
