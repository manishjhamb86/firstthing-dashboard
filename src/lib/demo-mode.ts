import { logger } from "@/lib/logger";

/**
 * DEMO_MODE — bypasses TIME-BASED gates only, so a circuit can be walked
 * end to end in one sitting instead of over a real calendar week.
 *
 * Scope is deliberately narrow (the user's call, 2026-08-19): dates and
 * windows, nothing else. Money rules (CON-17's load tolerance, CON-20's
 * benchmark band) and authority rules (the PER-01 ops proxy, the accountant's
 * release_billing separation, GATE-04 binding acts) are NOT bypassable. Those
 * separations are what the product's figures rest on; a demo that skips them
 * is demoing a different product.
 *
 * Env-only on purpose. There is no UI toggle, so production cannot be put
 * into bypass mode by anyone holding an admin session — it takes shell access
 * and a restart.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Records that a specific gate was skipped. Every bypass goes through here,
 * so `pm2 logs | grep demo.bypass` answers "was this figure produced under
 * demo rules?" — which matters precisely because the banner is not in the
 * database and a screenshot outlives the session.
 */
export function demoBypass(gate: string, context: Record<string, unknown> = {}): boolean {
  if (!isDemoMode()) return false;
  logger.warn("demo.bypass", { gate, ...context });
  return true;
}
