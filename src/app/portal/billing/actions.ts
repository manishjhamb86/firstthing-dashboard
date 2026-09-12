"use server";

import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { logger } from "@/lib/logger";

/**
 * A resident's own presigned read of an invoice — scoped to their OWN
 * society (INV-05) regardless of what invoice id is asked for, so this can
 * never be used to read another society's bill by guessing an id. Same
 * HeadObject-before-presign discipline as every other signed read in this
 * codebase — presigning "succeeds" for a deleted object, so a dead link
 * would otherwise look like a working one until clicked.
 */
export async function getPortalInvoiceUrl(invoiceId: string): Promise<{ url: string } | { error: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session is no longer valid. Sign in again." };
  if (!hasGrant(viewer, "billing")) return { error: "You don't have access to billing." };

  const invoice = await db.billingInvoice.findUnique({
    where: { id: invoiceId },
    include: { calculation: { select: { societyId: true } } },
  });
  if (!invoice || invoice.calculation.societyId !== viewer.societyId || invoice.voidedAt) {
    return { error: "That invoice isn't available to you." };
  }
  if (invoice.status === "attached") {
    // Not yet released — CON-33's whole point is that a figure only reaches
    // a society once something other than the process that produced it says
    // so. This should be unreachable from the portal's own listing, which
    // already filters to released invoices, but the check stays here too —
    // an invoice id is not, on its own, proof of the viewer's right to it.
    return { error: "This invoice is not yet released." };
  }

  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: invoice.s3Key }));
  } catch {
    return { error: "This invoice's file can no longer be found in storage." };
  }
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: invoice.s3Key }), {
    expiresIn: 300,
  });
  logger.info("portal.invoice_download", { viewerId: viewer.id, invoiceId });
  return { url };
}
