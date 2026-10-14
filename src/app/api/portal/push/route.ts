import { NextResponse } from "next/server";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { pushConfigured } from "@/lib/push";

/**
 * This phone's push subscription for the customer portal (2026-10-14,
 * water-tank alerts — user-asked). Same shape as /api/field/push/route.ts,
 * for a Profile rather than an AdminUser: POST saves it for the signed-in
 * portal account, DELETE removes it. The endpoint is the identity — a
 * shared family phone re-subscribing moves the row to whoever is signed in
 * now, never keeps notifying the last person.
 */

async function viewerOr401() {
  const viewer = await resolvePortalViewer();
  if (!viewer) return { res: NextResponse.json({ error: "Your session has ended." }, { status: 401 }) };
  if (!viewer.role || !hasGrant({ role: viewer.role, grants: viewer.grants }, "water_tanks")) {
    logger.warn("push.portal_subscribe_refused", { viewerId: viewer.id, reason: "no_water_grant" });
    return { res: NextResponse.json({ error: "You do not have Water access." }, { status: 403 }) };
  }
  return { viewer };
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
  const { viewer, res } = await viewerOr401();
  if (!viewer) return res;
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
    create: { profileId: viewer.id, endpoint, p256dh, auth, userAgent },
    update: { profileId: viewer.id, adminId: null, p256dh, auth, userAgent },
  });
  logger.info("push.portal_subscribed", { viewerId: viewer.id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { viewer, res } = await viewerOr401();
  if (!viewer) return res;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isHttpsUrl(body?.endpoint)) return NextResponse.json({ error: "That subscription could not be read." }, { status: 400 });
  const { count } = await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, profileId: viewer.id } });
  logger.info("push.portal_unsubscribed", { viewerId: viewer.id, removed: count });
  return NextResponse.json({ ok: true });
}
