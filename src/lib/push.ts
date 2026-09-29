import webpush from "web-push";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { PushMessage } from "@/lib/push-messages";

/**
 * Sending push notifications to the field app (19-field-app.md §18).
 *
 * Web Push through `web-push`, the library Next's own PWA guide uses
 * (node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md). The
 * push service is reached with this app's VAPID keys: VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY, generated once per environment (`npx web-push
 * generate-vapid-keys`) and kept out of git; VAPID_SUBJECT is the contact the
 * push service may write to.
 *
 * Best effort, always: a notification is a nudge, and the work it points at is
 * already on the person's own My work list. So a send never throws into the
 * act that caused it — an assignment is not undone because a phone was off.
 */

export function vapidPublicKey(): string | null {
  const k = process.env.VAPID_PUBLIC_KEY?.trim();
  return k ? k : null;
}

// A push service that never answers must not hold the act that sent it: the
// meter poll runs these inside the worker's hourly pass (found by the e2e — an
// endpoint that accepted the connection and said nothing hung the caller).
const SEND_TIMEOUT_MS = 10_000;

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = vapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:info@firsthing.earth", pub, priv);
    return (configured = true);
  } catch (err) {
    logger.error("push.vapid_invalid", { error: String(err) });
    return (configured = false);
  }
}

export function pushConfigured(): boolean {
  return configure();
}

/** Send one message to every phone each person has subscribed. Never throws. */
export async function sendPush(adminIds: string[], message: PushMessage): Promise<{ sent: number; removed: number }> {
  const ids = [...new Set(adminIds.filter(Boolean))];
  if (ids.length === 0 || !configure()) return { sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;
  try {
    const subs = await db.pushSubscription.findMany({ where: { adminId: { in: ids } } });
    const payload = JSON.stringify(message);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 60 * 60, urgency: "normal", timeout: SEND_TIMEOUT_MS });
          sent += 1;
          await db.pushSubscription.update({ where: { id: s.id }, data: { lastSentAt: new Date() } }).catch(() => {});
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: the browser dropped this subscription. Anything else may
          // pass (the push service was busy); keep it and try next time.
          if (status === 404 || status === 410) {
            await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
            removed += 1;
            logger.info("push.subscription_gone", { adminId: s.adminId, status });
          } else {
            logger.warn("push.send_failed", { adminId: s.adminId, status: status ?? null, error: String((err as Error).message ?? err) });
          }
        }
      }),
    );
    if (subs.length > 0) logger.info("push.sent", { tag: message.tag, people: ids.length, phones: subs.length, sent, removed });
  } catch (err) {
    logger.error("push.failed", { tag: message.tag, error: String(err) });
  }
  return { sent, removed };
}
