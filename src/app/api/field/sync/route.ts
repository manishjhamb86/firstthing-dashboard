import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { parseEnvelope, parseInspectionPayload, parsePhotoPayload, type Envelope } from "@/lib/field-sync";
import { fileInspection } from "@/lib/inspection-file";

/**
 * The field app's sync endpoint (docs/engineering/19-field-app.md §4.1;
 * ADR-002: a Route Handler, not a Server Action, because a queued item may be
 * sent an hour or a day after the tap that made it).
 *
 * proxy.ts does not cover /api, so this checks access itself, from the row.
 *
 * Replies, and what the phone does with each (field-sync.ts classifyReply):
 *   200 — applied, or already applied (a replay returns the stored result)
 *   401 — the session is gone: sign in again, the item waits
 *   403 — this account may not file field work
 *   400 / 422 — the item was read and refused; the reason is in `error`
 *   409 — the id belongs to another account's item
 *   5xx — trouble here; the phone tries again later
 */
type Actor = NonNullable<Awaited<ReturnType<typeof resolveAdmin>>>;

async function apply(
  tx: Prisma.TransactionClient,
  actor: Actor,
  env: Envelope,
): Promise<Record<string, string> | { error: string }> {
  if (env.kind === "inspection.file") {
    const input = parseInspectionPayload(env.payload);
    if ("error" in input) return input;
    return fileInspection(tx, actor, input);
  }

  // inspection.photo — the photo of the signed paper form, uploaded after the
  // inspection itself (05-field.md §0.3: data first, photos after), attached
  // to the inspection the earlier item filed.
  const input = parsePhotoPayload(env.payload);
  if ("error" in input) return input;
  const filed = await tx.fieldSyncReceipt.findUnique({ where: { id: input.inspectionItemId } });
  if (!filed || filed.actorId !== actor.id || filed.kind !== "inspection.file") {
    return { error: "The inspection this photo belongs to has not been sent yet." };
  }
  const inspectionId = (filed.result as { inspectionId?: string }).inspectionId ?? "";
  const inspection = await tx.inspection.findUnique({ where: { id: inspectionId }, select: { voidedAt: true } });
  if (!inspection) return { error: "That inspection no longer exists." };
  if (inspection.voidedAt) return { error: "This inspection has been voided." };
  // Only a key this inspection's own presign could have produced.
  if (!input.key.includes(inspectionId)) return { error: "That photo was not uploaded for this inspection." };
  await tx.inspection.update({ where: { id: inspectionId }, data: { evidencePhotoKey: input.key } });
  return { inspectionId, key: input.key };
}

export async function POST(req: Request) {
  const actor = await resolveAdmin();
  if (!actor) return NextResponse.json({ error: "Your session has ended. Sign in again — your work is kept on the phone." }, { status: 401 });
  if (!actor.permissions.includes("manage_survey")) {
    logger.warn("field.sync_refused", { actorId: actor.id, reason: "permission" });
    return NextResponse.json({ error: "This account may no longer file field work." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Not a sync request." }, { status: 400 });
  }
  const env = parseEnvelope(body);
  if ("error" in env) {
    logger.warn("field.sync_refused", { actorId: actor.id, reason: env.error });
    return NextResponse.json({ error: env.error }, { status: 400 });
  }

  const replay = async () => {
    const prior = await db.fieldSyncReceipt.findUnique({ where: { id: env.id } });
    if (!prior) return null;
    if (prior.actorId !== actor.id) {
      logger.warn("field.sync_refused", { actorId: actor.id, itemId: env.id, reason: "id_belongs_to_another_account" });
      return NextResponse.json({ error: "That item belongs to another account." }, { status: 409 });
    }
    logger.info("field.sync_replayed", { actorId: actor.id, itemId: env.id, kind: prior.kind });
    return NextResponse.json({ ok: true, replayed: true, result: prior.result });
  };

  const seen = await replay();
  if (seen) return seen;

  try {
    const out = await db.$transaction(async (tx) => {
      const result = await apply(tx, actor, env);
      if ("error" in result) return result;
      // The receipt commits with the work, or neither does.
      await tx.fieldSyncReceipt.create({ data: { id: env.id, actorId: actor.id, kind: env.kind, result } });
      return result;
    });
    if ("error" in out) {
      logger.warn("field.sync_refused", { actorId: actor.id, itemId: env.id, kind: env.kind, reason: out.error });
      return NextResponse.json({ error: out.error }, { status: 422 });
    }
    logger.info("field.sync_applied", { actorId: actor.id, itemId: env.id, kind: env.kind, result: out });
    return NextResponse.json({ ok: true, result: out });
  } catch (err) {
    // Two sends of one item raced: the loser's receipt insert hits the
    // primary key. The winner applied it — answer with its result.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await replay();
      if (again) return again;
    }
    logger.error("field.sync_failed", { actorId: actor.id, itemId: env.id, kind: env.kind, message: String(err) });
    return NextResponse.json({ error: "Something went wrong on our side. It will be sent again." }, { status: 500 });
  }
}
