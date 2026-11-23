// How often water tank levels are sampled (2026-11-23, user-asked: every 10
// minutes, configurable). Pure, shared by the worker and the settings action.

export const TANK_INTERVAL_MIN = 5;
export const TANK_INTERVAL_MAX = 1440;

/** A stored or typed interval, held inside the allowed range. */
export function clampTankInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return 10;
  return Math.min(TANK_INTERVAL_MAX, Math.max(TANK_INTERVAL_MIN, Math.round(minutes)));
}

/** Why an interval cannot be saved, or null. */
export function refuseTankInterval(minutes: number): string | null {
  if (!Number.isInteger(minutes)) return "Enter a whole number of minutes.";
  if (minutes < TANK_INTERVAL_MIN || minutes > TANK_INTERVAL_MAX) return `Choose between ${TANK_INTERVAL_MIN} minutes and 24 hours (${TANK_INTERVAL_MAX} minutes).`;
  return null;
}

/** "every 10 minutes" / "every hour" / "every 2 hours 30 minutes". */
export function describeTankInterval(minutes: number): string {
  if (minutes < 60) return `every ${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "hour" : `${h} hours`;
  return m ? `every ${hours} ${m} minutes` : `every ${hours}`;
}

/**
 * Thin a tank's history for sending to a page: everything after `cutoffMs`
 * is kept; before it, one reading per `slotMs` slot — but a reading whose
 * level differs from the last kept one is always kept, so no change of level
 * is ever dropped (these sensors report in steps, so nothing between two
 * kept readings is lost). Points are [time, level], oldest first.
 */
export function thinHistory(points: Array<[number, number]>, cutoffMs: number, slotMs = 30 * 60 * 1000): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let lastSlot = -1;
  for (const p of points) {
    const prev = out[out.length - 1];
    if (p[0] >= cutoffMs) {
      out.push(p);
      continue;
    }
    const slot = Math.floor(p[0] / slotMs);
    if (slot !== lastSlot || !prev || prev[1] !== p[1]) {
      out.push(p);
      lastSlot = slot;
    }
  }
  return out;
}
