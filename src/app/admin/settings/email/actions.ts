"use server";

import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { sendEmail, sesConfigured } from "@/lib/ses";

export async function sendTestEmail(to: string): Promise<{ ok?: true; error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(admin.team)) {
    logger.warn("email.test_refused", { actorId: admin.id });
    return { error: "Sending a test email is an operations action." };
  }
  if (!sesConfigured()) return { error: "Email is not configured — set SES_FROM_EMAIL and AWS_REGION first." };
  const address = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { error: "That doesn't look like an email address." };

  const r = await sendEmail({
    to: [address],
    subject: "FirsThing — test email",
    text: "This is a test email from FirsThing's admin settings. If you received this, email is working.",
    html: "<p>This is a test email from FirsThing's admin settings. If you received this, email is working.</p>",
  });
  if (r.error) {
    logger.warn("email.test_failed", { actorId: admin.id, to: address, error: r.error });
    return { error: r.error };
  }
  logger.info("email.test_sent", { actorId: admin.id, to: address });
  return { ok: true };
}
