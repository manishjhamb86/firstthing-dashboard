import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";

/**
 * DEMO_MODE — bypasses TIME-BASED gates only, so a circuit can be walked
 * end to end in one sitting instead of over a real calendar week.
 *
 * Scope is deliberately narrow (the user's call, 2026-08-19): dates and
 * windows, nothing else. Money rules (CON-17's load tolerance, CON-20's
 * benchmark band) and authority rules (the PER-01 ops proxy, the
 * accountant's release_billing separation, GATE-04 binding acts) are NOT
 * bypassable. Those separations are what the product's figures rest on; a
 * demo that skips them is demoing a different product.
 *
 * Two switches, and BOTH must be on (2026-08-20):
 *
 *  - the `DEMO_MODE` env var is the master gate. Without it there is no
 *    demo mode and no toggle is rendered at all, so production cannot be put
 *    into bypass mode by anyone holding an admin session — it takes shell
 *    access and a restart, exactly as before.
 *  - each admin's own `demoMode` column then turns it on for them. It
 *    defaults to false, so anything missing or unreadable reads as normal
 *    mode.
 *
 * Fail-closed in both directions: absence is never demo.
 */

/** The master gate. Sync, and safe to call without a request context. */
export function demoModeAvailable(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * The effective mode for the current request: the env var AND the signed-in
 * admin's own switch. resolveAdmin() is already cache()d per request, so
 * this costs nothing beyond the lookup every gate on the page already makes.
 */
export async function isDemoMode(): Promise<boolean> {
  if (!demoModeAvailable()) return false;
  const admin = await resolveAdmin();
  return admin?.demoMode === true;
}

/**
 * Records that a specific gate was skipped. Every bypass goes through here,
 * so `pm2 logs | grep demo.bypass` answers "was this figure produced under
 * demo rules?" — which matters precisely because the banner is not in the
 * database and a screenshot outlives the session.
 */
export async function demoBypass(
  gate: string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  if (!(await isDemoMode())) return false;
  logger.warn("demo.bypass", { gate, ...context });
  return true;
}
