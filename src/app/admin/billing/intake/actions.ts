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

import { revalidatePath } from "next/cache";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildInvoiceKey } from "@/lib/ingest-keys";
import { sniffKind } from "@/lib/file-signature";
import { extractInvoice, type ExtractedInvoice } from "@/lib/invoice-extract";
import { quotaKind } from "@/lib/gemini-models";
import {
  arithmeticReport,
  classifyLine,
  openItems,
  parseInvoiceMonth,
  proposeCircuit,
  proposeSociety,
  type CircuitOption,
  type Review,
  type ReviewLine,
} from "@/lib/invoice-intake";
import { deriveInvoiceMonth, type DerivedMonth } from "@/lib/invoice-month";
import { loadInvoiceMonthContext } from "@/lib/invoice-month-loader";
import { daysInPeriod } from "@/lib/reading-normalize";
import { requireBillingOps } from "../access";

const INTAKE_PATH = "/admin/billing/intake";
const MAX_BYTES = 20 * 1024 * 1024;

/** Invoice-first months are lighting for now — every contract on record is. */
const SERVICE_LINE = "lighting" as const;

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

async function societyOptions() {
  return db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

async function circuitOptionsFor(societyId: string): Promise<CircuitOption[]> {
  const ctx = await loadInvoiceMonthContext({ societyId, serviceLine: SERVICE_LINE, period: "2000-01" });
  return ctx.circuitOptions;
}

function proposeReview(x: ExtractedInvoice, societyId: string | null, circuits: CircuitOption[]): Review {
  const lines: ReviewLine[] = x.lines.map((l) => {
    const kind = classifyLine({ hsn: l.hsn, description: l.description, proposal: l.kindProposal, qty: l.qty.value });
    const proposal = kind === "service" ? proposeCircuit({ qty: l.qty.value, description: l.description }, circuits) : null;
    return {
      lineNo: l.lineNo,
      description: l.description,
      hsn: l.hsn,
      qty: l.qty.value,
      rate: l.rate.value,
      discount: l.discount.value ?? 0,
      taxPct: l.taxPct.value,
      taxAmount: l.taxAmount.value,
      amount: l.amount.value,
      kind,
      circuitId: proposal?.circuitId ?? null,
      applyCountForward: false,
    };
  });
  return {
    societyId,
    period: parseInvoiceMonth(x.invoiceForMonth.value),
    invoiceNumber: x.invoiceNumber.value,
    invoiceDate: x.invoiceDate.value,
    dueDate: x.dueDate.value,
    lines,
    subtotal: x.subtotal.value,
    taxAmount: x.taxAmount.value,
    taxPct: x.taxPct.value,
    total: x.total.value,
    paid: null,
    paidOn: "",
    arithmeticAcknowledgement: "",
  };
}


/** Google's rate-limit reply is a paragraph with a URL in it; the row needs a sentence. */
function friendlyExtractionError(raw: string): string {
  if (quotaKind(raw) === "quota") {
    // Every model in the list refused (withModelFallback tried each). The
    // endpoint does not say whether that is the minute's window or the day's
    // 20-read cap on a free key, so the message covers both honestly.
    return "The document reader refused on every model it can use. Wait a minute and Retry; if it refuses again, today's free allowance (20 reads a day per model on a free key) is used up — enter the lines by hand, read it tomorrow, or move the key to a billed plan to lift the cap.";
  }
  if (/GEMINI_API_KEY/.test(raw)) return "The document reader is not configured on this server.";
  return "The invoice could not be read automatically — retry, or enter its lines by hand.";
}

/**
 * One automatic retry on a rate limit, after the delay the service asks for.
 * The free tier's window is a minute, and the reader says exactly how long to
 * wait ("retry in 49s"); the first cut capped the wait at 20 s, so a Retry
 * clicked straight after the refusal waited too little and failed the same
 * way (user-caught 2026-09-16). Honoured up to a minute now — the operator
 * sees "Reading…" for that long, which beats a second identical refusal.
 */
async function readWithOneRetry(bytes: Uint8Array): Promise<ExtractedInvoice> {
  const base64 = Buffer.from(bytes).toString("base64");
  try {
    return await extractInvoice({ base64, mimeType: "application/pdf" });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const m = raw.match(/retry in ([\d.]+)(ms|s)/i);
    if (quotaKind(raw) !== "quota" || !m) throw err;
    const waitMs = Math.min(m[2].toLowerCase() === "ms" ? Number(m[1]) : Number(m[1]) * 1000, 65_000);
    await new Promise((r) => setTimeout(r, waitMs + 1_000));
    return await extractInvoice({ base64, mimeType: "application/pdf" });
  }
}

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

export async function extractIntake(intakeId: string): Promise<Result<{ status: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId } });
  if (!intake) return { error: "That upload no longer exists." };
  if (intake.status === "submitted") return { error: "This invoice has already been submitted." };
  await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "reading", extractionError: null } });

  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: intake.s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "could_not_read", extractionError: "The uploaded file could not be read back from storage." } });
    return { error: "The uploaded file could not be read back from storage. Upload it again." };
  }

  let extraction: ExtractedInvoice;
  try {
    extraction = await readWithOneRetry(bytes);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = friendlyExtractionError(raw);
    logger.warn("intake.extraction_failed", { actorId: ops.actor.id, intakeId, message: raw.slice(0, 300) });
    await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "could_not_read", extractionError: friendly } });
    revalidatePath(INTAKE_PATH);
    return { error: friendly };
  }

  const society = proposeSociety(extraction.billToName.value, await societyOptions());
  const circuits = society ? await circuitOptionsFor(society.id) : [];
  const review = proposeReview(extraction, society?.id ?? null, circuits);
  const readable = extraction.lines.length > 0;

  await db.invoiceIntake.update({
    where: { id: intakeId },
    data: {
      extraction: extraction as unknown as Prisma.InputJsonValue,
      review: review as unknown as Prisma.InputJsonValue,
      status: readable ? "needs_review" : "could_not_read",
      extractionError: readable ? null : "No line items were found on the invoice.",
      societyId: society?.id ?? null,
      period: review.period || null,
    },
  });
  logger.info("intake.extracted", {
    actorId: ops.actor.id,
    intakeId,
    lines: extraction.lines.length,
    societyProposed: society?.id ?? null,
    periodProposed: review.period || null,
    clarifications: extraction.clarifications.length,
  });
  revalidatePath(INTAKE_PATH);
  return { status: readable ? "needs_review" : "could_not_read" };
}

// ---------------------------------------------------------------------------
// 3. Review — what the operator confirmed, and the live preview of its effect.
// ---------------------------------------------------------------------------

async function duplicateFor(societyId: string | null, period: string) {
  if (!societyId || !/^\d{4}-\d{2}$/.test(period)) return null;
  const calc = await db.monthlyCalculation.findFirst({
    where: { societyId, serviceLine: SERVICE_LINE, period, status: { notIn: ["superseded"] } },
    include: { invoices: { where: { voidedAt: null }, select: { number: true }, take: 1 } },
    orderBy: { version: "desc" },
  });
  const inv = calc?.invoices[0];
  return inv ? { number: inv.number, released: calc!.status === "released" } : null;
}

export type IntakePreview = {
  openItems: string[];
  arithmetic: ReturnType<typeof arithmeticReport>;
  derived: DerivedMonth | null;
  circuitOptions: CircuitOption[];
  contextNotes: string[];
  duplicateOf: { number: string; released: boolean } | null;
};

async function buildPreview(review: Review): Promise<IntakePreview> {
  const duplicateOf = await duplicateFor(review.societyId, review.period);
  const items = openItems(review, { duplicateOf });
  const arithmetic = arithmeticReport(review);
  let derived: DerivedMonth | null = null;
  let circuitOptions: CircuitOption[] = [];
  let contextNotes: string[] = [];
  if (review.societyId) {
    const period = /^\d{4}-\d{2}$/.test(review.period) ? review.period : "2000-01";
    const ctx = await loadInvoiceMonthContext({ societyId: review.societyId, serviceLine: SERVICE_LINE, period });
    circuitOptions = ctx.circuitOptions;
    contextNotes = ctx.notes;
    if (/^\d{4}-\d{2}$/.test(review.period)) {
      const serviceLines = review.lines
        .filter((l) => l.kind === "service" && l.circuitId && l.qty !== null && l.amount !== null)
        .map((l) => ({ lineNo: l.lineNo, circuitId: l.circuitId!, lightsBilled: l.qty!, amount: l.amount! }));
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
  const duplicateOf = await duplicateFor(review.societyId, review.period);
  const items = openItems(review, { duplicateOf });
  const status = duplicateOf ? "refused_duplicate" : items.length === 0 ? "ready" : "needs_review";
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
// 4. Submit — the month of record, from the confirmed review, in one transaction.
// ---------------------------------------------------------------------------

export async function submitIntake(intakeId: string, review: Review): Promise<Result<{ calculationId: string }>> {
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
            circuitId: l.kind === "service" ? l.circuitId : null,
            arithmeticOk: preview.arithmetic.lines.find((a) => a.lineNo === l.lineNo)?.check.ok ?? true,
            arithmeticNote: (() => {
              const c = preview.arithmetic.lines.find((a) => a.lineNo === l.lineNo)?.check;
              return c && !c.ok ? c.note : null;
            })(),
            countDisagreement: derived.lines.find((d) => d.lineNo === l.lineNo)?.countDisagreement ?? null,
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
      const d = derived.lines.find((x) => x.lineNo === l.lineNo);
      if (l.kind === "service" && l.applyCountForward && d && d.countDisagreement !== null && l.circuitId) {
        await tx.representedCountChange.create({
          data: {
            circuitId: l.circuitId,
            previousCount: d.countDisagreement,
            nextCount: d.lightsBilled,
            effectiveFrom: period,
            reason: `Applied from invoice ${review.invoiceNumber.trim()} (${period}), which billed ${d.lightsBilled} lights against a recorded ${d.countDisagreement}.`,
            billingInvoiceId: invoice.id,
            recordedById: ops.actor.id,
          },
        });
        await tx.circuit.update({ where: { id: l.circuitId }, data: { representedLightCount: d.lightsBilled } });
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
