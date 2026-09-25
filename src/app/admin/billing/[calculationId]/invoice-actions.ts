"use server";

// FEAT-053/CON-33 — attach the Zoho-generated tax invoice, reconcile it
// against this month's computed total, and release the month once it is
// either matched or an acknowledged mismatch. The BillingInvoice model and
// the requireBillingOps/requireAccountant gates already existed for this
// exact flow (their own comments named it); only the verbs were missing.

import { revalidatePath } from "next/cache";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildInvoiceKey } from "@/lib/ingest-keys";
import { reconcileInvoiceAmount, refuseInvoiceAttach, refuseRelease, refuseVoidInvoice } from "@/lib/invoice-reconciliation";
import { requireAccountant, requireBillingOps } from "../access";
import { logger } from "@/lib/logger";
import { isSettled, refusePayment, settledTotal, type PaymentMethod } from "@/lib/payment";

async function unresolvedDeviationCount(calculationId: string): Promise<number> {
  const lines = await db.circuitFeeLine.findMany({
    where: { monthlyCalculationId: calculationId },
    select: { deviationReview: { select: { state: true } } },
  });
  return lines.filter(
    (l) => l.deviationReview && !["decided", "closed"].includes(l.deviationReview.state),
  ).length;
}

/** The one LIVE (non-voided) invoice for a month, if any — the only row any
 *  of these actions should ever act on. A voided one is history, kept for
 *  the record, never a target. */
function liveInvoice(calculationId: string) {
  return db.billingInvoice.findFirst({ where: { monthlyCalculationId: calculationId, voidedAt: null } });
}

/** A presigned PUT under the private `Invoices/` prefix — never the public
 *  `Documents/` tree these carry real bank details and GST numbers. */
export async function getInvoiceUploadUrl(input: {
  calculationId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };

  const calc = await db.monthlyCalculation.findUnique({
    where: { id: input.calculationId },
    include: { society: { select: { name: true } } },
  });
  if (!calc) return { error: "That month no longer exists." };

  const key = buildInvoiceKey({
    society: calc.society.name,
    period: calc.period,
    calculationId: calc.id,
    fileName: input.fileName,
    uploadedAt: new Date(),
  });
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );
  logger.info("billing.invoice_presigned", { actorId: ops.actor.id, calculationId: calc.id, key });
  return { uploadUrl, key };
}

export async function attachInvoice(input: {
  calculationId: string;
  number: string;
  issueDate: string; // YYYY-MM-DD, the operator's own reading of the invoice
  dueDate: string;
  amount: number;
  s3Key: string;
  fileName: string;
}): Promise<{ error?: string; reconciliation?: "matched" | "mismatched" }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };

  const calc = await db.monthlyCalculation.findUnique({ where: { id: input.calculationId } });
  if (!calc) return { error: "That month no longer exists." };
  const existing = await liveInvoice(calc.id);

  const refusal = refuseInvoiceAttach({
    calculation: { status: calc.status },
    alreadyAttached: existing !== null,
    amount: input.amount,
  });
  if (refusal) {
    logger.warn("billing.invoice_attach_refused", { actorId: ops.actor.id, calculationId: calc.id, refusal });
    return { error: refusal };
  }

  const issueDate = new Date(`${input.issueDate}T00:00:00Z`);
  const dueDate = new Date(`${input.dueDate}T00:00:00Z`);
  if (Number.isNaN(issueDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    return { error: "Both dates must be valid — read them straight off the invoice." };
  }

  const { status } = reconcileInvoiceAmount(calc.total, input.amount);

  await db.billingInvoice.create({
    data: {
      monthlyCalculationId: calc.id,
      number: input.number,
      issueDate,
      dueDate,
      amount: input.amount,
      computedAmount: calc.total,
      reconciliationStatus: status,
      s3Key: input.s3Key,
      fileName: input.fileName,
      uploadedById: ops.actor.id,
      status: "attached",
    },
  });
  logger.info("billing.invoice_attached", {
    actorId: ops.actor.id,
    calculationId: calc.id,
    amount: input.amount,
    reconciliationStatus: status,
  });
  revalidatePath(`/admin/billing/${calc.id}`);
  return { reconciliation: status };
}

/**
 * The correction path (2026-09-12): a wrongly attached invoice is voided,
 * not edited or replaced in place. The row stays, struck through, and the
 * (society, period) slot is free for a genuine re-attach — the same shape
 * as a rescale correction. Refused once the month is RELEASED (GATE-02):
 * past that point the invoice is what the society was actually billed on.
 */
export async function voidInvoiceAttachment(input: {
  calculationId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };

  const calc = await db.monthlyCalculation.findUnique({ where: { id: input.calculationId }, select: { status: true } });
  if (!calc) return { error: "That month no longer exists." };
  const invoice = await liveInvoice(input.calculationId);
  if (!invoice) return { error: "No invoice is attached to this month." };

  const refusal = refuseVoidInvoice({
    calculation: { status: calc.status },
    alreadyVoided: false,
    reason: input.reason,
  });
  if (refusal) {
    logger.warn("billing.invoice_void_refused", { actorId: ops.actor.id, calculationId: input.calculationId, refusal });
    return { error: refusal };
  }

  await db.billingInvoice.update({
    where: { id: invoice.id },
    data: { voidedAt: new Date(), voidedById: ops.actor.id, voidReason: input.reason.trim() },
  });
  logger.info("billing.invoice_voided", { actorId: ops.actor.id, calculationId: input.calculationId, invoiceId: invoice.id });
  revalidatePath(`/admin/billing/${input.calculationId}`);
  return {};
}

export async function acknowledgeMismatch(input: {
  calculationId: string;
  note: string;
}): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (input.note.trim() === "") {
    return { error: "Say why the amounts differ before acknowledging it — a blank reason is not a reason." };
  }

  const invoice = await liveInvoice(input.calculationId);
  if (!invoice) return { error: "No invoice is attached to this month." };
  if (invoice.reconciliationStatus !== "mismatched") {
    return { error: "This invoice is not flagged as mismatched — there is nothing to acknowledge." };
  }

  await db.billingInvoice.update({
    where: { id: invoice.id },
    data: {
      reconciliationStatus: "acknowledged",
      mismatchAcknowledgedById: ops.actor.id,
      mismatchAcknowledgedNote: input.note.trim(),
    },
  });
  logger.info("billing.mismatch_acknowledged", { actorId: ops.actor.id, calculationId: input.calculationId });
  revalidatePath(`/admin/billing/${input.calculationId}`);
  return {};
}

export async function releaseCalculation(calculationId: string): Promise<{ error?: string }> {
  const acc = await requireAccountant();
  if (!acc.ok) return { error: acc.error };

  const calc = await db.monthlyCalculation.findUnique({ where: { id: calculationId } });
  if (!calc) return { error: "That month no longer exists." };
  const invoice = await liveInvoice(calculationId);

  const refusal = refuseRelease({
    calculation: { status: calc.status },
    invoice: invoice ? { reconciliationStatus: invoice.reconciliationStatus } : null,
    unresolvedDeviationCount: await unresolvedDeviationCount(calculationId),
  });
  if (refusal) {
    logger.warn("billing.release_refused", { actorId: acc.actor.id, calculationId, refusal });
    return { error: refusal };
  }

  const now = new Date();
  await db.$transaction([
    // The calculation's OWN releasedAt is what the rest of the app actually
    // reads (portal-energy.ts's rupeesSaved, every ₹ figure downstream) —
    // found and fixed before this was ever tested: an earlier draft set
    // only the invoice's releasedAt, which is a different field CON-13's
    // clock reads, and would have left every "appears once billed" tile
    // waiting forever on a release that, from the rest of the app's point
    // of view, never happened.
    db.monthlyCalculation.update({
      where: { id: calculationId },
      data: { status: "released", releasedAt: now, releasedById: acc.actor.id },
    }),
    // invoice is guaranteed non-null here — refuseRelease refuses when it's
    // null, so this update targets the one live row the refusal check itself
    // already confirmed exists.
    // An invoice paid at intake (CON-47 e) is released as PAID — moving it
    // to `released` would start CON-13's clock on a bill settled long ago.
    // Only an unpaid `attached` invoice becomes `released`.
    db.billingInvoice.update({
      where: { id: invoice!.id },
      data: { releasedAt: now, ...(invoice!.status === "attached" ? { status: "released" as const } : {}) },
    }),
  ]);
  logger.info("billing.released", { actorId: acc.actor.id, calculationId, invoiceStatus: invoice!.status });
  revalidatePath(`/admin/billing/${calculationId}`);
  revalidatePath("/admin/billing");
  return {};
}

export type PaymentAttachment = { key: string; name: string; kind: "cheque" | "tds_certificate" | "other" };

export async function recordPayment(input: {
  calculationId: string;
  amount: number;
  confirmedAsOf: string; // YYYY-MM-DD
  reference?: string;
  method?: PaymentMethod;
  utrNumber?: string;
  chequeNumber?: string;
  chequeDate?: string;
  chequeBank?: string;
  tdsAmount?: number;
  tdsRatePct?: number | null;
  attachments?: PaymentAttachment[];
}): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };

  const confirmedAsOf = new Date(`${input.confirmedAsOf}T00:00:00Z`);
  if (Number.isNaN(confirmedAsOf.getTime())) return { error: "Enter the date it was received." };

  const invoice = await liveInvoice(input.calculationId);
  if (!invoice) return { error: "No invoice is attached to this month yet." };
  const prior = await db.payment.findMany({ where: { invoiceId: invoice.id }, select: { amount: true, tdsAmount: true } });
  const outstanding = Math.max(0, Math.round((invoice.amount - settledTotal(prior)) * 100) / 100);

  const p = {
    amount: input.amount,
    tdsAmount: input.tdsAmount ?? 0,
    method: input.method ?? "bank_transfer",
    utrNumber: input.utrNumber ?? "",
    chequeNumber: input.chequeNumber ?? "",
    chequeDate: input.chequeDate ?? "",
    chequeBank: input.chequeBank ?? "",
  };
  const refusal = refusePayment(p, outstanding);
  if (refusal) {
    logger.warn("billing.payment_refused", { actorId: ops.actor.id, calculationId: input.calculationId, reason: refusal });
    return { error: refusal };
  }
  // Only keys this invoice's own upload path could have produced are kept.
  const attachments = (input.attachments ?? []).filter((a) => a.key.startsWith(`Payments/${invoice.id}/`));

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: p.amount,
        confirmedAsOf,
        reference: input.reference?.trim() || null,
        method: p.method,
        utrNumber: p.method === "bank_transfer" || p.method === "upi" ? p.utrNumber.trim().toUpperCase() || null : null,
        chequeNumber: p.method === "cheque" ? p.chequeNumber.trim() : null,
        chequeDate: p.method === "cheque" ? new Date(`${p.chequeDate}T00:00:00Z`) : null,
        chequeBank: p.method === "cheque" ? p.chequeBank.trim() : null,
        tdsAmount: p.tdsAmount,
        tdsRatePct: p.tdsAmount > 0 ? (input.tdsRatePct ?? null) : null,
        attachments: attachments.length ? attachments : undefined,
        recordedById: ops.actor.id,
      },
    });
    const all = await tx.payment.findMany({ where: { invoiceId: invoice.id }, select: { amount: true, tdsAmount: true } });
    // Recording a payment IS checking Zoho and confirming what is true
    // today (2026-09-12) — stamped in the same transaction so the
    // arrears_sweep job's same-day-confirmed safety rule (CON-13) never
    // has to be freshened by a separate click for the common case where
    // ops already just looked. TDS settles as surely as money (2026-09-25).
    await tx.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        paymentStatusConfirmedAt: now,
        paymentStatusConfirmedById: ops.actor.id,
        ...(isSettled(invoice.amount, all) ? { status: "paid" as const } : {}),
      },
    });
  });
  logger.info("billing.payment_recorded", {
    actorId: ops.actor.id,
    calculationId: input.calculationId,
    amount: p.amount,
    tds: p.tdsAmount,
    method: p.method,
    attachments: attachments.length,
  });
  revalidatePath(`/admin/billing/${input.calculationId}`);
  return {};
}

/** A private upload slot for a cheque copy or TDS certificate — bank details never go in the public tree. */
export async function getPaymentAttachmentUploadUrl(input: {
  calculationId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (!/^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(input.contentType)) return { error: "Upload a photo or a PDF." };
  const invoice = await liveInvoice(input.calculationId);
  if (!invoice) return { error: "No invoice is attached to this month yet." };
  const safe = input.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const key = `Payments/${invoice.id}/${Date.now()}-${safe}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }), { expiresIn: 300 });
  logger.info("billing.payment_attachment_presigned", { actorId: ops.actor.id, invoiceId: invoice.id, key });
  return { uploadUrl, key };
}

/** A short-lived link to one of a payment's attachments. */
export async function getPaymentAttachmentUrl(paymentId: string, key: string): Promise<{ url: string } | { error: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const pay = await db.payment.findUnique({ where: { id: paymentId }, select: { attachments: true } });
  const list = (pay?.attachments as PaymentAttachment[] | null) ?? [];
  if (!list.some((a) => a.key === key)) return { error: "That file is not on this payment." };
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn: 300 });
  return { url };
}

/**
 * CON-13's other human touchpoint (2026-09-12): confirming against Zoho that
 * an invoice is STILL unpaid is what lets the arrears_sweep job's same-day
 * safety rule ever admit a suspension for a society that has never made a
 * payment at all — `recordPayment` only stamps the confirmation when there
 * IS a payment to record, so without this, an invoice nobody has ever paid
 * would never accumulate a fresh confirmation and could never be suspended.
 */
export async function confirmPaymentStatus(calculationId: string): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };

  const invoice = await liveInvoice(calculationId);
  if (!invoice) return { error: "No invoice is attached to this month." };
  if (invoice.status === "paid") {
    return { error: "This invoice is already paid — there is nothing to confirm." };
  }

  await db.billingInvoice.update({
    where: { id: invoice.id },
    data: { paymentStatusConfirmedAt: new Date(), paymentStatusConfirmedById: ops.actor.id },
  });
  logger.info("billing.payment_status_confirmed", { actorId: ops.actor.id, calculationId, invoiceId: invoice.id });
  revalidatePath(`/admin/billing/${calculationId}`);
  return {};
}

/** Same HeadObject-before-presign discipline as the raw-reading download —
 *  presigning succeeds even for a deleted object, so a dead link would read
 *  as a working one until clicked. */
export async function getInvoiceDownloadUrl(calculationId: string): Promise<{ url: string } | { error: string }> {
  const reader = await requireBillingOps();
  if (!reader.ok) return { error: reader.error };

  const invoice = await liveInvoice(calculationId);
  if (!invoice) return { error: "No invoice is attached to this month." };

  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: invoice.s3Key }));
  } catch {
    return { error: "This invoice's file can no longer be found in storage." };
  }
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: invoice.s3Key }), {
    expiresIn: 300,
  });
  return { url };
}
