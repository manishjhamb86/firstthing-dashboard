/**
 * When a live read is worth making, and how a figure should be described
 * once it is on screen.
 *
 * The vendor API is used for exactly one thing: the current picture of a
 * meter — power now, the day so far, the month so far — while somebody is
 * looking at it. It is never the source of the hourly series (that comes
 * from the device's own exported CSV), and it is never the source of a
 * billed figure (that is CON-45's reviewed store).
 *
 * Two rules, both about not lying to the reader:
 *
 *   1. A read is only made when the stored one is stale. Ten people opening
 *      the same meter inside a minute is one read, not ten — CoolKit's free
 *      tier is a finite allowance, and a society portal is the surface most
 *      likely to burn it.
 *   2. A figure is ALWAYS shown with its age. A meter that has been
 *      unreachable for three hours still has a last known reading worth
 *      seeing; presenting it as the current one is how a stale number
 *      becomes a decision. That is the water-tank lesson, and it applies to
 *      every figure this module hands to a screen.
 */

/** Inside this, the stored reading is simply the current one. */
export const LIVE_FRESH_MS = 60 * 1000;

/**
 * The floor between reads for a portal viewer. A society opening its own
 * meter should see a live figure; a society leaving the page open should not
 * spend the account's allowance on it.
 */
export const PORTAL_MIN_INTERVAL_MS = 5 * 60 * 1000;

export type Surface = "admin" | "portal";

export function minIntervalFor(surface: Surface): number {
  return surface === "portal" ? PORTAL_MIN_INTERVAL_MS : LIVE_FRESH_MS;
}

/** Should this view spend a vendor call, or use what is already stored? */
export function shouldReadLive(input: {
  lastReadAt: Date | null;
  surface: Surface;
  now: Date;
}): boolean {
  if (!input.lastReadAt) return true;
  return input.now.getTime() - input.lastReadAt.getTime() >= minIntervalFor(input.surface);
}

/**
 * How to caption a stored figure. Never "now" unless it genuinely is —
 * a reader has to be able to tell a live reading from a remembered one.
 */
export function freshnessLabel(lastReadAt: Date | null, now: Date): string {
  if (!lastReadAt) return "never read";
  const ms = now.getTime() - lastReadAt.getTime();
  if (ms < LIVE_FRESH_MS) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * How old a reading may be before it is no longer the current picture.
 *
 * Tied to the POLL CADENCE, not to a feeling about freshness. The hourly job
 * reads every assigned meter once an hour, so a 20-minute-old figure is
 * exactly what a healthy meter looks like — the first version of this used
 * 15 minutes and consequently told the reader "these are not current
 * figures" for 45 minutes out of every 60, directly under a chip saying the
 * meter was answering and sending fresh readings. A warning that fires on
 * the normal case is a warning people learn to ignore, and then the real one
 * goes with it.
 *
 * 90 minutes means a scheduled read was actually missed.
 */
export const STALE_AFTER_MS = 90 * 60 * 1000;

/** True when a figure is old enough that calling it current would mislead. */
export function isStale(lastReadAt: Date | null, now: Date): boolean {
  if (!lastReadAt) return true;
  return now.getTime() - lastReadAt.getTime() > STALE_AFTER_MS;
}
