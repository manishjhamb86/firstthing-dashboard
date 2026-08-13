"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "./auth";
import { s3, S3_BUCKET, publicS3Url } from "./s3";
import { buildDocumentKey, type DocType } from "./document-keys";

export async function getUploadUrl(input: {
  society: string;
  month: string; // YYYY-MM, an explicit user selection
  docType: DocType;
  dateLabel: string;
  identifier?: string;
  extension: string;
  contentType: string;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  if (!input.society || !input.month) {
    throw new Error("Society and month are required before uploading.");
  }

  const key = buildDocumentKey(input);

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 }
  );

  return { uploadUrl, publicUrl: publicS3Url(key) };
}
