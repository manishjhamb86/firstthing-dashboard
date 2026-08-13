import { S3Client } from "@aws-sdk/client-s3";

// No explicit `credentials` — the SDK's default provider chain picks up
// AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY from env locally, and would use an
// EC2 instance role automatically if one's ever attached, with no code change.
export const s3 = new S3Client({ region: process.env.AWS_REGION });

export const S3_BUCKET = process.env.AWS_S3_BUCKET!;

export function publicS3Url(key: string) {
  return `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}
