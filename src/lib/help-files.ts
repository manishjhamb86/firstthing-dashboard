import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, S3_BUCKET } from "@/lib/s3";

/**
 * A short-lived link to a Help attachment (private Help/ prefix). Rendered only
 * to the reporter and to back-office staff; never stored.
 */
export async function signedHelpUrl(key: string | null): Promise<string | null> {
  if (!key || !key.startsWith("Help/")) return null;
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn: 600 });
  } catch {
    return null;
  }
}
