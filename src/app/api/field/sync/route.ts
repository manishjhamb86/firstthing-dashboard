import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  parseBlockerPayload,
  parseCertificatePayload,
  parseInstallationDayPayload,
  parseDemoMeterPayload,
  parseDemoReplacementPayload,
  parseAreaPayload,
  parseCircuitPayload,
  parseEnvelope,
  parseSurveyMemberPayload,
  parseSurveyProfilePayload,
  parseSurveySectionPayload,
  type OutboxKind,
  parseInspectionPayload,
  parseMovePayload,
  parsePhotoPayload,
  type Envelope,
} from "@/lib/field-sync";
import { recordDemoMeterAs, recordDemoReplacementAs } from "@/lib/demo-step-core";
import { applyUnitMove } from "@/lib/inventory-move";
import { fileInspection } from "@/lib/inspection-file";
import {
  addInventoryRowAs,
  addLogbookPagesAs,
  recordPumpUnitAs,
  savePumpStructureAs,
  setLogbookNotMaintainedAs,
  markTypeUnresolvableAs,
  recordFieldCandidateAs,
  removeInventoryRowAs,
  settleContestAs,
  updateInventoryRowAs,
} from "@/lib/survey-core";
import { addCommitteeMemberAs, saveProfileAs, setPrimaryContactAs, setSectionAs, submitSurveyAs } from "@/lib/survey-core";
import { batchPhotoKey, MAX_DAY_PHOTOS, raiseBlockerAs, recordDayAs, signCertificateAs } from "@/lib/installation-core";

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

  // installation.blocker — one insert, so it commits with its receipt.
  if (env.kind === "installation.blocker") {
    const input = parseBlockerPayload(env.payload);
    if ("error" in input) return input;
    const r = await raiseBlockerAs(actor, input.pipelineId, { ...input, batchId: null, photoKeys: [] }, tx);
    if ("error" in r) return r;
    return { blockerId: r.blockerId };
  }

  if (env.kind !== "inspection.photo") {
    return { error: "Handled before the transaction." }; // unreachable: see OUTSIDE
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

  // Kinds whose act runs its own transactions (the demo steps, the
  // installation day and certificate, the survey shell): the act comes first
  // and the receipt after, not inside one transaction. Each handler makes a
  // lost-reply retry harmless — it either only SETS values, or recognises the
  // account's own earlier success and answers it as applied. The rules are
  // exactly the back office's.
  const outside = OUTSIDE[env.kind];
  if (outside) {
    let applied: Applied;
    try {
      applied = await outside(actor, env.payload);
    } catch (err) {
      logger.error("field.sync_failed", { actorId: actor.id, itemId: env.id, kind: env.kind, message: String(err) });
      return NextResponse.json({ error: "Something went wrong on our side. It will be sent again." }, { status: 500 });
    }
    if ("error" in applied) {
      logger.warn("field.sync_refused", { actorId: actor.id, itemId: env.id, kind: env.kind, reason: applied.error });
      return NextResponse.json({ error: applied.error }, { status: applied.status ?? 422 });
    }
    const result = applied.result;
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

type Applied = { result: Prisma.JsonObject } | { error: string; status?: number };

async function applyDay(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseInstallationDayPayload(payload);
  if ("error" in input) return input;
  const day = await db.installationPlannedDay.findUnique({
    where: { id: input.plannedDayId },
    select: {
      plannedDate: true,
      project: { select: { pipelineId: true, society: { select: { name: true } } } },
      batches: { select: { id: true, state: true, submittedById: true, installedCount: true, skippedCount: true, removedFittingsCount: true, photoKeys: true } },
    },
  });
  if (!day || day.project.pipelineId !== input.pipelineId) return { error: "That planned day is not part of this installation." };

  // Only photos this route's own upload URL could have produced for this day.
  if (input.photoKeys.length > MAX_DAY_PHOTOS) return { error: `A day carries at most ${MAX_DAY_PHOTOS} photos.` };
  const issued = new Set(
    Array.from({ length: MAX_DAY_PHOTOS }, (_, index) =>
      batchPhotoKey({ societyName: day.project.society.name, plannedDate: day.plannedDate, plannedDayId: input.plannedDayId, index }),
    ),
  );
  if (input.photoKeys.some((k) => !issued.has(k))) return { error: "A photo was not uploaded for this day." };

  const already = day.batches.find((b) => b.state !== "draft");
  if (
    already &&
    already.submittedById === actor.id &&
    already.installedCount === input.installedCount &&
    already.skippedCount === input.skippedCount &&
    already.removedFittingsCount === input.removedFittingsCount &&
    JSON.stringify(already.photoKeys ?? []) === JSON.stringify(input.photoKeys)
  ) {
    return { result: { batchId: already.id, alreadyRecorded: true } };
  }

  const r = await recordDayAs(actor, input.pipelineId, input.plannedDayId, {
    installedCount: input.installedCount,
    removedFittingsCount: input.removedFittingsCount,
    skippedCount: input.skippedCount,
    skippedReason: input.skippedReason,
    locationDetail: input.locationDetail,
    photoKeys: input.photoKeys,
    photosWaivedReason: input.photosWaivedReason || undefined,
    workedOn: input.workedOn,
  });
  if ("error" in r) return { error: r.error };
  return { result: { batchId: r.batchId } };
}

async function applyCertificate(actor: Actor, payload: unknown): Promise<Applied> {
  // The certificate is the operations lead's act (FEAT-037-AC-4), as at the desk.
  if (!actor.permissions.includes("manage_pipeline")) {
    return { error: "Signing the completion certificate is an operations lead action.", status: 403 };
  }
  const input = parseCertificatePayload(payload);
  if ("error" in input) return input;
  const existing = await db.completionCertificate.findFirst({
    where: { project: { pipelineId: input.pipelineId } },
    select: { id: true, recordedById: true, signatoryName: true, signedAt: true },
  });
  if (
    existing &&
    existing.recordedById === actor.id &&
    existing.signatoryName === input.signatoryName.trim() &&
    existing.signedAt.toISOString().slice(0, 10) === input.signedAt
  ) {
    return { result: { certificateId: existing.id, alreadyRecorded: true } };
  }
  const r = await signCertificateAs(actor, input.pipelineId, { ...input, signatureKey: null });
  if ("error" in r) return { error: r.error };
  return { result: { pipelineId: input.pipelineId } };
}

async function applyDemoMeter(actor: Actor, payload: unknown): Promise<Applied> {
  const parsed = parseDemoMeterPayload(payload);
  if ("error" in parsed) return parsed;
  const out = await recordDemoMeterAs(actor, parsed);
  if (out.error) return { error: out.error };
  return { result: { ok: true, ...(out.warning ? { warning: out.warning } : {}) } };
}

async function applyDemoReplacement(actor: Actor, payload: unknown): Promise<Applied> {
  const parsed = parseDemoReplacementPayload(payload);
  if ("error" in parsed) return parsed;
  const out = await recordDemoReplacementAs(actor, parsed);
  if (out.error) return { error: out.error };
  return { result: { ok: true } };
}

// ── the survey shell (survey-core.ts) ──

async function applySurveyProfile(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseSurveyProfilePayload(payload);
  if ("error" in input) return input;
  const r = await saveProfileAs(actor, input);
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applySurveyMember(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseSurveyMemberPayload(payload);
  if ("error" in input) return input;
  const r = await addCommitteeMemberAs(actor, input);
  return "error" in r ? { error: r.error } : { result: { memberId: r.memberId } };
}

async function applySurveyPrimary(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (typeof o.surveyId !== "string" || typeof o.memberId !== "string") return { error: "Which member is the primary contact?" };
  const r = await setPrimaryContactAs(actor, { surveyId: o.surveyId, memberId: o.memberId });
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applySurveySection(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseSurveySectionPayload(payload);
  if ("error" in input) return input;
  const r = await setSectionAs(actor, input);
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applySurveySubmit(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (typeof o.surveyId !== "string") return { error: "Which survey?" };
  // A lost reply: the survey this account submitted is answered as applied.
  const s = await db.siteSurvey.findUnique({ where: { id: o.surveyId }, select: { status: true, submittedById: true } });
  if (s?.status === "submitted" && s.submittedById === actor.id) return { result: { alreadySubmitted: true } };
  const r = await submitSurveyAs(actor, o.surveyId);
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applyArea(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseAreaPayload(payload);
  if ("error" in input) return input;
  const r = await addInventoryRowAs(actor, input);
  return "error" in r ? { error: r.error } : { result: { rowId: r.rowId, contested: r.contested } };
}

async function applyAreaUpdate(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseAreaPayload(payload);
  if ("error" in input) return input;
  const r = await updateInventoryRowAs(actor, input);
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applyAreaRemove(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (typeof o.surveyId !== "string" || typeof o.rowId !== "string") return { error: "Which area?" };
  const r = await removeInventoryRowAs(actor, { surveyId: o.surveyId, rowId: o.rowId });
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applySettle(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (typeof o.surveyId !== "string" || typeof o.areaKey !== "string" || typeof o.keepCountedBy !== "string") return { error: "Which count is kept?" };
  const r = await settleContestAs(actor, { surveyId: o.surveyId, areaKey: o.areaKey, keepCountedBy: o.keepCountedBy, reason: typeof o.reason === "string" ? o.reason : "" });
  return "error" in r ? { error: r.error } : { result: { voided: r.voided } };
}

async function applyCircuit(actor: Actor, payload: unknown): Promise<Applied> {
  const input = parseCircuitPayload(payload);
  if ("error" in input) return input;
  const r = await recordFieldCandidateAs(actor, input);
  return "error" in r ? { error: r.error } : { result: { circuitId: r.circuitId, state: r.state } };
}

async function applyUnresolvable(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (typeof o.surveyId !== "string" || typeof o.lightType !== "string") return { error: "Which light type?" };
  const r = await markTypeUnresolvableAs(actor, { surveyId: o.surveyId, lightType: o.lightType, reason: typeof o.reason === "string" ? o.reason : "" });
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

// ── the pump room (SCR-013) ──

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const keysOf = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);

async function applyPumpStructure(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  const st = (o.structure ?? {}) as Record<string, unknown>;
  const towers = (Array.isArray(st.towers) ? st.towers : []).map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    return {
      name: txt(t.name),
      tanks: (Array.isArray(t.tanks) ? t.tanks : []).map((k) => ({ type: txt((k as Record<string, unknown>)?.type), capacityL: numOrNull((k as Record<string, unknown>)?.capacityL) })),
    };
  });
  const vfd = txt(st.vfdArrangement);
  const r = await savePumpStructureAs(actor, {
    surveyId: txt(o.surveyId),
    structure: {
      pumpType: txt(st.pumpType),
      pumpHp: numOrNull(st.pumpHp),
      pumpCount: numOrNull(st.pumpCount),
      feedPipe: txt(st.feedPipe),
      outflowPipe: txt(st.outflowPipe),
      vfdArrangement: vfd === "per_pump" || vfd === "shared" ? vfd : "",
      towers,
    },
  });
  return "error" in r ? { error: r.error } : { result: { units: r.units } };
}

const CONDITION_VALUES = ["working", "working_with_faults", "not_working", "unknown"] as const;

async function applyPumpUnit(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  const cond = txt(o.condition);
  const r = await recordPumpUnitAs(actor, {
    surveyId: txt(o.surveyId),
    unitKey: txt(o.unitKey),
    installed: o.installed === true,
    brand: txt(o.brand),
    model: txt(o.model),
    condition: (CONDITION_VALUES as readonly string[]).includes(cond) ? (cond as (typeof CONDITION_VALUES)[number]) : null,
    photoKeys: keysOf(o.photoKeys),
    photoBatch: txt(o.photoBatch),
  });
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applyLogbook(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  const r = await setLogbookNotMaintainedAs(actor, { surveyId: txt(o.surveyId), notMaintained: o.notMaintained === true });
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

async function applyLogbookPage(actor: Actor, payload: unknown): Promise<Applied> {
  const o = (payload ?? {}) as Record<string, unknown>;
  const r = await addLogbookPagesAs(actor, { surveyId: txt(o.surveyId), month: txt(o.month), photoKeys: keysOf(o.photoKeys), photoBatch: txt(o.photoBatch) });
  return "error" in r ? { error: r.error } : { result: { ok: true } };
}

const OUTSIDE: Partial<Record<OutboxKind, (actor: Actor, payload: unknown) => Promise<Applied>>> = {
  "demo.meter": applyDemoMeter,
  "demo.replacement": applyDemoReplacement,
  "installation.day": applyDay,
  "installation.certificate": applyCertificate,
  "survey.profile": applySurveyProfile,
  "survey.member": applySurveyMember,
  "survey.primary": applySurveyPrimary,
  "survey.section": applySurveySection,
  "survey.submit": applySurveySubmit,
  "survey.area": applyArea,
  "survey.area_update": applyAreaUpdate,
  "survey.area_remove": applyAreaRemove,
  "survey.settle": applySettle,
  "survey.circuit": applyCircuit,
  "survey.unresolvable": applyUnresolvable,
  "survey.pump_structure": applyPumpStructure,
  "survey.pump_unit": applyPumpUnit,
  "survey.logbook": applyLogbook,
  "survey.logbook_page": applyLogbookPage,
};
