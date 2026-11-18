import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";

/**
 * Which inspection a phone's queued filing became (2026-11-18): the success
 * step after saving asks this so it can offer the report PDF once the office
 * has the inspection. Only the account that sent the item can ask about it.
 */
export async function GET(req: Request) {
  const actor = await resolveAdmin();
  if (!actor) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const item = new URL(req.url).searchParams.get("item") ?? "";
  const receipt = item ? await db.fieldSyncReceipt.findUnique({ where: { id: item } }) : null;
  if (!receipt || receipt.actorId !== actor.id || receipt.kind !== "inspection.file") {
    return NextResponse.json({ inspectionId: null });
  }
  const inspectionId = (receipt.result as { inspectionId?: string } | null)?.inspectionId ?? null;
  return NextResponse.json({ inspectionId }, { headers: { "Cache-Control": "no-store" } });
}
