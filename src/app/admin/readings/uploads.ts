"use server";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { requireOps } from "./ops";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildRawReadingKey } from "@/lib/ingest-keys";
import { logger } from "@/lib/logger";

// Raw vendor files are presigned separately from src/app/admin/uploads.ts,
// for the same reason the portal has its own: one action, one purpose, one
// prefix. This one can only ever mint a key under `Ingest/`, so an admin
// session cannot use it to write into the public `Documents/` tree, and the
// document action cannot be used to write a raw file into the private one.
//
// It refuses by returning, never by throwing: a Server Action that throws
// reaches the browser as a bare 500 with its message replaced by an opaque
// digest in a production build, so the operator would be told nothing at all.
// Found by revoking the permission mid-session and watching the refusal
// arrive as a 500 — the gate was right, the way it reported was not.
export async function getReadingUploadUrl(input: {
  circuitId: string;
  period: string; // YYYY-MM — the operator's explicit selection (INV-04)
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    return { error: "Reading period must be a YYYY-MM selection." };
  }

  const circuit = await db.circuit.findUnique({
    where: { id: input.circuitId },
    include: { society: { select: { name: true } } },
  });
  if (!circuit) return { error: "That circuit no longer exists." };

  const key = buildRawReadingKey({
    society: circuit.society.name,
    period: input.period,
    circuitId: circuit.id,
    fileName: input.fileName,
    uploadedAt: new Date(),
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );

  logger.info("ingest.presigned", { actorId: ops.session.user.id, circuitId: circuit.id, key });
  return { uploadUrl, key };
}

/**
 * FEAT-047 — the raw file, reachable only through here.
 *
 * AC-4 says raw vendor files are not exposed to a non-internal actor, and the
 * `Ingest/` prefix is outside the bucket's public-read statement, so this
 * short-lived signed GET is the only way to read one. Nothing ever stores or
 * renders a bare S3 URL for these.
 *
 * AC-3's degraded case is why this returns a shape rather than throwing: if
 * the object is gone, the readings still display and the traceability gap is
 * stated, instead of the history page failing to render.
 *
 * The HeadObject is not ceremony. Presigning is a local signature computation
 * that contacts S3 for nothing, so signing always "succeeds" — including for
 * an object that was deleted, and for a bucket this app has no read grant on.
 * Without the head request the degraded case is unreachable in practice and
 * the operator gets a link that opens an XML access-denied page instead of a
 * sentence saying the file can no longer be traced.
 */
export async function getRawFileDownloadUrl(
  rawFileId: string,
): Promise<{ url: string } | { error: string }> {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  const file = await db.rawReadingFile.findUnique({ where: { id: rawFileId } });
  if (!file) return { error: "That upload is no longer in the history." };

  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key }));
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key }), {
      expiresIn: 300,
    });
    logger.info("ingest.raw_file_access", {
      actorId: ops.session.user.id,
      rawFileId,
      key: file.s3Key,
    });
    return { url };
  } catch (e) {
    logger.error("ingest.raw_file_unavailable", {
      rawFileId,
      key: file.s3Key,
      message: e instanceof Error ? e.message : String(e),
    });
    return { error: "The original file could not be retrieved from storage." };
  }
}
