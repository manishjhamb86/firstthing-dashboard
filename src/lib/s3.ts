import { S3Client } from "@aws-sdk/client-s3";

// Ported unchanged from archive/src/lib/s3.ts — the pattern was proven
// against the real bucket (see PROJECT_CONTEXT.md's Architecture Decisions)
// and there is no reason to rediscover it. No explicit `credentials`: the
// SDK's default provider chain reads AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
// from env locally, and would pick up an instance role automatically if one
// is ever attached to a deploy box, with no code change either way.

// Stage and production share the same bucket (2026-10-08, user-asked) — so
// an environment-scoped key prefix is the one thing that has to separate
// them, everywhere a key is built. Rather than touch the ~20 files across
// this codebase that each construct their own Put/Get/HeadObjectCommand
// (documents, invoices, inventory, help, payments, field uploads, Zoho
// syncs...), this is enforced at the ONE place every one of them already
// shares: this module's own S3Client instance. Middleware rewrites every
// command's Key before it leaves the process, so nowhere else needs to
// know a prefix exists at all. Empty (unset S3_KEY_PREFIX) means exactly
// today's behaviour — production's own keys, untouched.
const RAW_PREFIX = process.env.S3_KEY_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
const KEY_PREFIX = RAW_PREFIX ? `${RAW_PREFIX}/` : "";

export const s3 = new S3Client({ region: process.env.AWS_REGION });

if (KEY_PREFIX) {
  s3.middlewareStack.add(
    (next) => async (args) => {
      const input = args.input as { Key?: string };
      if (typeof input.Key === "string" && !input.Key.startsWith(KEY_PREFIX)) {
        input.Key = `${KEY_PREFIX}${input.Key}`;
      }
      return next(args);
    },
    { step: "initialize", name: "environmentKeyPrefix" },
  );
}

export const S3_BUCKET = process.env.AWS_S3_BUCKET!;

// The bucket is public-read (user's explicit choice, 2026-08-05 for invoices
// and reaffirmed 2026-08-14 for MS-05's KYC and agreement documents after
// the alternative was put to them). We store the *key* in Postgres, not this
// URL, so switching the bucket to private + presigned GET later is a change
// to this one function plus a read path — not a data migration.
//
// This has to apply the SAME environment prefix the middleware above adds
// to every PUT/GET — a public URL is plain string concatenation, never
// touched by that middleware, so without this the uploaded object and the
// link rendered for it would point at two different keys.
export function publicS3Url(key: string) {
  const prefixed = KEY_PREFIX && !key.startsWith(KEY_PREFIX) ? `${KEY_PREFIX}${key}` : key;
  return `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${prefixed}`;
}
