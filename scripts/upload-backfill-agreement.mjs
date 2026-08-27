/**
 * Put a society's signed agreement scan in the bucket, under the app's own
 * key convention, and print the key.
 *
 *   node scripts/upload-backfill-agreement.mjs "Ace City" 2025-10 2025-10-23 <file.pdf>
 *
 * One-time tooling for the backfill. Deliberately a separate step from the
 * SQL: this app's IAM user can PUT but not DELETE, so an object written here
 * cannot be taken back — better that it is an explicit act than a side effect
 * of generating some SQL.
 */
import { readFileSync } from "node:fs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const env = Object.fromEntries(
  [".env", ".env.local"].flatMap((f) => {
    try {
      return readFileSync(f, "utf8").split("\n")
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]);
    } catch { return []; }
  }),
);

const [society, month, dateLabel, file] = process.argv.slice(2);
if (!file) throw new Error("usage: <society> <YYYY-MM> <YYYY-MM-DD> <file.pdf>");

const slug = society.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const key = `Documents/${slug}/${month}/Agreements/${slug}_Agreement_${dateLabel}.pdf`;

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});
await s3.send(new PutObjectCommand({
  Bucket: env.AWS_S3_BUCKET,
  Key: key,
  Body: readFileSync(file),
  ContentType: "application/pdf",
}));
console.log(key);
