"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildDocumentKey, type DocType } from "@/lib/document-keys";
import { logger } from "@/lib/logger";

// Presigned PUT, not a proxy through this server — AWS's own recommended
// pattern, keeps file bytes off the Next.js process and credentials off the
// client. Ported from archive/src/lib/uploads.ts, with one change: the
// required permission is derived from the document type *here*, server-side,
// rather than the action trusting whoever called it. A client choosing a
// docType it has no permission for is simply refused.
const DOC_TYPE_PERMISSION: Record<DocType, "manage_pipeline"> = {
  kycGstCertificate: "manage_pipeline",
  kycElectricityBill: "manage_pipeline",
  agreement: "manage_pipeline",
};

export async function getUploadUrl(input: {
  society: string;
  month: string; // YYYY-MM — INV-04, an explicit selection made in the form
  docType: DocType;
  dateLabel: string;
  identifier?: string;
  extension: string;
  contentType: string;
}) {
  const session = await requireAdminPermission(DOC_TYPE_PERMISSION[input.docType]);

  if (!input.society || !input.month) {
    throw new Error("Society and document period are required before uploading.");
  }
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new Error("Document period must be a YYYY-MM selection.");
  }

  const key = buildDocumentKey(input);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );

  logger.info("upload.presigned", { actorId: session.user.id, docType: input.docType, key });
  return { uploadUrl, key };
}
