import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  parseDemoMeterPayload,
  parseDemoReplacementPayload,
  parseEnvelope,
  parseInspectionPayload,
  parseMovePayload,
  parsePhotoPayload,
  type Envelope,
} from "@/lib/field-sync";
import { recordDemoMeterAs, recordDemoReplacementAs } from "@/lib/demo-step-core";
import { applyUnitMove } from "@/lib/inventory-move";
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
): Promise<Prisma.JsonObject | { error: string }> {
  if (env.kind === "inspection.file") {
    const input = parseInspectionPayload(env.payload);
    if ("error" in input) return input;
    return fileInspection(tx, actor, input);
  }

  // stock.move — a scanned pile of units, moved once. Each unit is judged on
  // its own by the back office's own lifecycle; the refused ones are named in
  // the result (which the phone shows) and the rest still move.
  if (env.kind === "stock.move") {
    const input = parseMovePayload(env.payload);
    if ("error" in input) return input;
    const r = await applyUnitMove(tx, actor.id, input);
    if ("error" in r) return r;
    return { done: r.done, failed: r.failed };
  }

  if (env.kind === "demo.meter" || env.kind === "demo.replacement") {
    return { error: "Handled before the transaction." }; // unreachable: see POST
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

  // The two on-site demo steps (demo-step-core.ts) run their own
  // transactions — the meter step plans and rewrites the meter's history — so
  // here the STEP comes first and the receipt after, not inside one
  // transaction. Both only SET values (a date, a load, per-line counts): a
  // replay that slips past the receipt, because a reply was lost after the
  // step committed, sets the same values again — no second history entry, one
  // extra change-log line. The rules are exactly the back office's.
  if (env.kind === "demo.meter" || env.kind === "demo.replacement") {
    const parsed = env.kind === "demo.meter" ? parseDemoMeterPayload(env.payload) : parseDemoReplacementPayload(env.payload);
    if ("error" in parsed) {
      logger.warn("field.sync_refused", { actorId: actor.id, itemId: env.id, kind: env.kind, reason: parsed.error });
      return NextResponse.json({ error: parsed.error }, { status: 422 });
    }
    const out =
      env.kind === "demo.meter"
        ? await recordDemoMeterAs(actor, parsed as Parameters<typeof recordDemoMeterAs>[1])
        : await recordDemoReplacementAs(actor, parsed as Parameters<typeof recordDemoReplacementAs>[1]);
    if (out.error) {
      logger.warn("field.sync_refused", { actorId: actor.id, itemId: env.id, kind: env.kind, reason: out.error });
      return NextResponse.json({ error: out.error }, { status: 422 });
    }
    const result: Prisma.JsonObject = { ok: true, ...(out.warning ? { warning: out.warning } : {}) };
    try {
      await db.fieldSyncReceipt.create({ data: { id: env.id, actorId: actor.id, kind: env.kind, result } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const again = await replay();
        if (again) return again;
      }
      throw err;
    }
    logger.info("field.sync_applied", { actorId: actor.id, itemId: env.id, kind: env.kind, result });
    return NextResponse.json({ ok: true, result });
  }

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
