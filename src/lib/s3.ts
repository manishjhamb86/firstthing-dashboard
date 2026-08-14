import { S3Client } from "@aws-sdk/client-s3";

// Ported unchanged from archive/src/lib/s3.ts — the pattern was proven
// against the real bucket (see PROJECT_CONTEXT.md's Architecture Decisions)
// and there is no reason to rediscover it. No explicit `credentials`: the
// SDK's default provider chain reads AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
// from env locally, and would pick up an instance role automatically if one
// is ever attached to a deploy box, with no code change either way.
export const s3 = new S3Client({ region: process.env.AWS_REGION });

export const S3_BUCKET = process.env.AWS_S3_BUCKET!;

// The bucket is public-read (user's explicit choice, 2026-08-05 for invoices
// and reaffirmed 2026-08-14 for MS-05's KYC and agreement documents after
// the alternative was put to them). We store the *key* in Postgres, not this
// URL, so switching the bucket to private + presigned GET later is a change
// to this one function plus a read path — not a data migration.
export function publicS3Url(key: string) {
  return `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}
