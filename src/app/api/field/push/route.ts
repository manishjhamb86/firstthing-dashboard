import { NextResponse } from "next/server";
import { resolveAdmin } from "@/lib/admin-permissions";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { pushConfigured } from "@/lib/push";

/**
 * This phone's push subscription (19-field-app.md §18). POST saves it for the
 * signed-in field account; DELETE removes it. The endpoint is the identity: a
 * phone re-subscribing, or handed to another person, moves the row to whoever
 * is signed in now — a shared phone never keeps notifying the last person.
 */

async function actorOr401() {
  const actor = await resolveAdmin();
  if (!actor) return { res: NextResponse.json({ error: "Your session has ended." }, { status: 401 }) };
  if (!actor.permissions.includes("manage_survey")) {
    logger.warn("push.subscribe_refused", { actorId: actor.id, reason: "not_field" });
    return { res: NextResponse.json({ error: "Not a field account." }, { status: 403 }) };
  }
  return { actor };
}

function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 1000) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const { actor, res } = await actorOr401();
  if (!actor) return res;
  if (!pushConfigured()) return NextResponse.json({ error: "Notifications are not set up on this server yet." }, { status: 409 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!isHttpsUrl(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "That subscription could not be read." }, { status: 400 });
  }
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { adminId: actor.id, endpoint, p256dh, auth, userAgent },
    update: { adminId: actor.id, p256dh, auth, userAgent },
  });
  logger.info("push.subscribed", { actorId: actor.id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { actor, res } = await actorOr401();
  if (!actor) return res;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isHttpsUrl(body?.endpoint)) return NextResponse.json({ error: "That subscription could not be read." }, { status: 400 });
  const { count } = await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, adminId: actor.id } });
  logger.info("push.unsubscribed", { actorId: actor.id, removed: count });
  return NextResponse.json({ ok: true });
}
