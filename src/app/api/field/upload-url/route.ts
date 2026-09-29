import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { presignInspectionEvidence } from "@/lib/inspection-file";

/**
 * An upload URL for a photo the phone has been holding (05-field.md §0.3).
 * The photo is tied to the OUTBOX ITEM that filed its inspection, because on
 * the phone the inspection had no server id yet; the receipt of that item says
 * which inspection it became. Same presign, same key, as the back office.
 */
export async function POST(req: Request) {
  const actor = await resolveAdmin();
  if (!actor) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!actor.permissions.includes("manage_survey")) {
    return NextResponse.json({ error: "This account may no longer file field work." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { inspectionItemId?: unknown; fileName?: unknown; contentType?: unknown } | null;
  const itemId = typeof body?.inspectionItemId === "string" ? body.inspectionItemId : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "photo.jpg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only a photo can be uploaded here." }, { status: 422 });
  }

  const filed = itemId ? await db.fieldSyncReceipt.findUnique({ where: { id: itemId } }) : null;
  if (!filed || filed.actorId !== actor.id || filed.kind !== "inspection.file") {
    return NextResponse.json({ error: "The inspection this photo belongs to has not been sent yet." }, { status: 422 });
  }
  const inspectionId = (filed.result as { inspectionId?: string }).inspectionId ?? "";
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: { period: true, voidedAt: true, society: { select: { name: true } } },
  });
  if (!inspection) return NextResponse.json({ error: "That inspection no longer exists." }, { status: 422 });
  if (inspection.voidedAt) return NextResponse.json({ error: "This inspection has been voided." }, { status: 422 });

  const { uploadUrl, key } = await presignInspectionEvidence({
    inspectionId,
    societyName: inspection.society.name,
    period: inspection.period,
    fileName,
    contentType,
  });
  logger.info("field.photo_presigned", { actorId: actor.id, inspectionId, key });
  return NextResponse.json({ uploadUrl, key });
}
