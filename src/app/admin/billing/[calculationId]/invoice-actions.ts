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
import { reconcileInvoiceAmount, refuseInvoiceAttach, refuseRelease } from "@/lib/invoice-reconciliation";
import { requireAccountant, requireBillingOps } from "../access";
import { logger } from "@/lib/logger";

async function unresolvedDeviationCount(calculationId: string): Promise<number> {
  const lines = await db.circuitFeeLine.findMany({
    where: { monthlyCalculationId: calculationId },
    select: { deviationReview: { select: { state: true } } },
  });
  return lines.filter(
    (l) => l.deviationReview && !["decided", "closed"].includes(l.deviationReview.state),
  ).length;
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

  const calc = await db.monthlyCalculation.findUnique({
    where: { id: input.calculationId },
    include: { invoice: { select: { id: true } } },
  });
  if (!calc) return { error: "That month no longer exists." };

  const refusal = refuseInvoiceAttach({
    calculation: { status: calc.status },
    alreadyAttached: calc.invoice !== null,
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

export async function acknowledgeMismatch(input: {
  calculationId: string;
  note: string;
}): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (input.note.trim() === "") {
    return { error: "Say why the amounts differ before acknowledging it — a blank reason is not a reason." };
  }

  const invoice = await db.billingInvoice.findUnique({ where: { monthlyCalculationId: input.calculationId } });
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

  const calc = await db.monthlyCalculation.findUnique({
    where: { id: calculationId },
    include: { invoice: { select: { reconciliationStatus: true } } },
  });
  if (!calc) return { error: "That month no longer exists." };

  const refusal = refuseRelease({
    calculation: { status: calc.status },
    invoice: calc.invoice ? { reconciliationStatus: calc.invoice.reconciliationStatus } : null,
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
    db.billingInvoice.update({
      where: { monthlyCalculationId: calculationId },
      data: { status: "released", releasedAt: now },
    }),
  ]);
  logger.info("billing.released", { actorId: acc.actor.id, calculationId });
  revalidatePath(`/admin/billing/${calculationId}`);
  revalidatePath("/admin/billing");
  return {};
}

export async function recordPayment(input: {
  calculationId: string;
  amount: number;
  confirmedAsOf: string; // YYYY-MM-DD
  reference?: string;
}): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Payment amount must be a positive number." };

  const confirmedAsOf = new Date(`${input.confirmedAsOf}T00:00:00Z`);
  if (Number.isNaN(confirmedAsOf.getTime())) return { error: "Confirmed-as-of must be a valid date." };

  const invoice = await db.billingInvoice.findUnique({ where: { monthlyCalculationId: input.calculationId } });
  if (!invoice) return { error: "No invoice is attached to this month yet." };

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: input.amount,
        confirmedAsOf,
        reference: input.reference?.trim() || null,
        recordedById: ops.actor.id,
      },
    });
    const paid = await tx.payment.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
    if ((paid._sum.amount ?? 0) >= invoice.amount) {
      await tx.billingInvoice.update({ where: { id: invoice.id }, data: { status: "paid" } });
    }
  });
  logger.info("billing.payment_recorded", { actorId: ops.actor.id, calculationId: input.calculationId, amount: input.amount });
  revalidatePath(`/admin/billing/${input.calculationId}`);
  return {};
}

/** Same HeadObject-before-presign discipline as the raw-reading download —
 *  presigning succeeds even for a deleted object, so a dead link would read
 *  as a working one until clicked. */
export async function getInvoiceDownloadUrl(calculationId: string): Promise<{ url: string } | { error: string }> {
  const reader = await requireBillingOps();
  if (!reader.ok) return { error: reader.error };

  const invoice = await db.billingInvoice.findUnique({ where: { monthlyCalculationId: calculationId } });
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
