import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, S3_BUCKET } from "@/lib/s3";
import { PHOTO_MAX_BYTES, PHOTO_PREFIX, PHOTO_TYPES } from "@/lib/homepage-content";

/** The folder a society's testimonial photos go in — its name, slugged; "General" when none. */
export function testimonialPhotoScope(societyName: string | null | undefined): string {
  const s = (societyName ?? "").trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s || "General";
}

/**
 * A short-lived URL to PUT one testimonial photo straight to S3 (the app's
 * presigned-PUT pattern), under the public Documents/Testimonials/ prefix —
 * these are for the public homepage. Images only, at most 5 MB.
 */
export async function presignTestimonialPhoto(input: { scope: string; role: "author" | "building"; contentType: string; size: number }): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  if (!(PHOTO_TYPES as readonly string[]).includes(input.contentType)) return { error: "Choose a JPG, PNG or WebP photo." };
  if (!(input.size > 0) || input.size > PHOTO_MAX_BYTES) return { error: "Choose a photo under 5 MB." };
  const ext = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
  const key = `${PHOTO_PREFIX}${input.scope}/${input.role}-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.${ext}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }), { expiresIn: 300 });
  return { uploadUrl, key };
}
