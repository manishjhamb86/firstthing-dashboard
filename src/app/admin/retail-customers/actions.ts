"use server";

// Retail customers (2026-09-30) — closing the gap the 2026-09-25 build left
// open: a customer could only be created from an invoice's own bill-to
// during intake, and its invoices could only arrive that same way. This adds
// the standalone edit, a hand-entered invoice (a sale recorded before a Zoho
// PDF exists, or one that will never have one), voiding a wrong one, and a
// payment ledger — the same "void, never edit in place" and "a pure decision
// module behind a thin action" conventions this codebase uses everywhere
// else money changes hands.

import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { logger } from "@/lib/logger";
import { requireBillingOps } from "../billing/access";
import {
  normaliseGstin,
  refuseRetailCustomer,
  refuseRetailInvoice,
  refuseRetailPayment,
  retailInvoiceKey,
  retailInvoicePaidTotal,
  retailNameKey,
  type RetailCustomerInput,
  type RetailInvoiceInput,
  type RetailPaymentInput,
} from "@/lib/retail-customer";
import type { PaymentMethod } from "@/lib/payment";

type Result<T = Record<string, never>> = T | { error: string };

function refresh(customerId: string) {
  revalidatePath("/admin/retail-customers");
  revalidatePath(`/admin/retail-customers/${customerId}`);
}

/** Edit a customer's own record. Duplicates are refused, the same rule create uses. */
export async function updateRetailCustomer(id: string, input: RetailCustomerInput & { societyId: string | null; notes: string }): Promise<Result> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const existing = await db.retailCustomer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { error: "That customer no longer exists." };
  const refusal = refuseRetailCustomer(input);
  if (refusal) return { error: refusal };
  const nameKey = retailNameKey(input.name);
  const gstin = normaliseGstin(input.gstin);
  const clash = await db.retailCustomer.findFirst({
    where: { id: { not: id }, OR: [{ nameKey }, ...(gstin ? [{ gstin }] : [])] },
    select: { name: true, gstin: true },
  });
  if (clash) {
    return {
      error:
        gstin && clash.gstin === gstin
          ? `A retail customer with GSTIN ${gstin} already exists (${clash.name}).`
          : `A retail customer named "${clash.name}" already exists.`,
    };
  }
  await db.retailCustomer.update({
    where: { id },
    data: {
      name: input.name.trim(),
      nameKey,
      gstin,
      address: input.address.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      societyId: input.societyId || null,
      notes: input.notes.trim() || null,
    },
  });
  logger.info("retail_customer.updated", { actorId: ops.actor.id, customerId: id });
  refresh(id);
  return {};
}

/** A presigned PUT for a hand-entered invoice's own file, once its number and period are known. */
export async function getRetailInvoiceUploadUrl(input: {
  customerId: string;
  invoiceNumber: string;
  period: string;
  fileName: string;
  contentType: string;
}): Promise<Result<{ uploadUrl: string; key: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const customer = await db.retailCustomer.findUnique({ where: { id: input.customerId }, select: { name: true } });
  if (!customer) return { error: "That customer no longer exists." };
  const extension = input.fileName.split(".").pop()?.toLowerCase() || "pdf";
  const key = retailInvoiceKey({ customerName: customer.name, period: input.period, invoiceNumber: input.invoiceNumber, extension });
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }), { expiresIn: 300 });
  return { uploadUrl, key };
}

/** Record a sale directly against a customer — with or without a filed PDF yet. */
export async function createRetailInvoiceManual(
  customerId: string,
  input: RetailInvoiceInput & { invoiceDate: string; dueDate: string; fileKey: string | null; fileName: string | null },
): Promise<Result<{ id: string }>> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const customer = await db.retailCustomer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { error: "That customer no longer exists." };
  const refusal = refuseRetailInvoice(input);
  if (refusal) return { error: refusal };
  const dup = await db.retailInvoice.findFirst({ where: { customerId, invoiceNumber: input.invoiceNumber.trim(), voidedAt: null } });
  if (dup) return { error: `Invoice ${input.invoiceNumber.trim()} is already on record for this customer.` };

  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
  const created = await db.retailInvoice.create({
    data: {
      customerId,
      invoiceNumber: input.invoiceNumber.trim(),
      invoiceDate: day(input.invoiceDate),
      dueDate: day(input.dueDate),
      period: input.period,
      subtotal: input.subtotal.trim() ? Number(input.subtotal) : null,
      taxAmount: input.taxAmount.trim() ? Number(input.taxAmount) : null,
      total: Number(input.total),
      s3Key: input.fileKey,
      fileName: input.fileName,
      createdById: ops.actor.id,
    },
    select: { id: true },
  });
  logger.info("retail_invoice.recorded", { actorId: ops.actor.id, customerId, invoiceId: created.id, invoiceNumber: input.invoiceNumber.trim() });
  refresh(customerId);
  return { id: created.id };
}

/** A wrong invoice, struck through with a reason — never edited in place. */
export async function voidRetailInvoice(id: string, reason: string): Promise<Result> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (!reason.trim()) return { error: "Say why this invoice is being voided." };
  const invoice = await db.retailInvoice.findUnique({ where: { id }, select: { id: true, customerId: true, voidedAt: true } });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.voidedAt) return { error: "Already voided." };
  await db.retailInvoice.update({
    where: { id },
    data: { voidedAt: new Date(), voidedById: ops.actor.id, voidReason: reason.trim() },
  });
  logger.info("retail_invoice.voided", { actorId: ops.actor.id, invoiceId: id });
  refresh(invoice.customerId);
  return {};
}

/** Money received against an invoice. Several may land (an advance, then a balance); each is its own row. */
export async function recordRetailPayment(invoiceId: string, method: PaymentMethod, reference: string, input: RetailPaymentInput): Promise<Result> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const invoice = await db.retailInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.voidedAt) return { error: "This invoice was voided — record the payment against the corrected one." };
  const outstanding = invoice.total - retailInvoicePaidTotal(invoice, invoice.payments);
  const refusal = refuseRetailPayment(input, outstanding);
  if (refusal) return { error: refusal };

  await db.$transaction(async (tx) => {
    // A pre-ledger advance is carried into the ledger the first time a real
    // payment is recorded, so `payments` becomes the one, complete record —
    // never a figure that has to be reassembled from two sources at read time.
    if (invoice.payments.length === 0 && invoice.advanceAmount) {
      await tx.retailPayment.create({
        data: {
          invoiceId,
          amount: invoice.advanceAmount,
          method: "other",
          paidOn: invoice.advanceOn ?? invoice.createdAt,
          reference: "Advance recorded before payment tracking",
          createdById: ops.actor.id,
        },
      });
    }
    await tx.retailPayment.create({
      data: {
        invoiceId,
        amount: Number(input.amount),
        method,
        paidOn: new Date(`${input.paidOn}T00:00:00Z`),
        reference: reference.trim() || null,
        createdById: ops.actor.id,
      },
    });
    // Kept in sync for any reader still on the two flat columns (the intake
    // review's own summary card among them) — the ledger is authoritative.
    const paidSoFar = retailInvoicePaidTotal(invoice, invoice.payments) + Number(input.amount);
    if (paidSoFar >= invoice.total - 0.5) {
      await tx.retailInvoice.update({ where: { id: invoiceId }, data: { paid: true, paidOn: new Date(`${input.paidOn}T00:00:00Z`) } });
    }
  });
  logger.info("retail_payment.recorded", { actorId: ops.actor.id, invoiceId, amount: Number(input.amount) });
  refresh(invoice.customerId);
  return {};
}
