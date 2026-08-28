/**
 * What a meter's raw parameters actually mean.
 *
 * eWeLink's UIID 190 power meters (POWR316 / POWR316D / POWR320D — every
 * meter on this account) report each electrical datapoint in HUNDREDTHS of
 * its unit. The device says `voltage: 22945`; the wire carries 229.45 V.
 *
 * Getting this wrong is not a display bug. `power` was being stored raw, so
 * a 1,153 W lighting circuit sat in the database as 115,335 W, and a day's
 * consumption would have been a hundred times the truth in anything that
 * read it. It is the same class as the water tank's `levelMax` (a raw 45
 * that meant 75%): a plausible-looking wrong number survives every
 * freshness check ever written, because nothing about it looks stale.
 *
 * The scale is not inferred from the model name — it is proved by physics
 * the device reports alongside the figure. Indian mains sits near 230 V, and
 * only the hundredths reading puts it there (22945 → 229.45 V, 24224 →
 * 242.24 V); V x I then reconciles with the reported power at a sane power
 * factor on every device checked. `assertPlausibleMains` keeps that same
 * check available at runtime, so a firmware change that moved the scale
 * would be caught rather than silently believed.
 */

/** Device types whose electrical datapoints are reported in hundredths. */
const CENTI_UNIT_UIIDS = new Set([190]);

/** The unit divisor for a device type, or null when it has never been established. */
export function scaleDivisorFor(uiid: number): number | null {
  return CENTI_UNIT_UIIDS.has(uiid) ? 100 : null;
}

/**
 * The parameters worth asking for on a live read. `getHoursKwh` is
 * deliberately absent: the device does keep an hourly buffer (its descriptor
 * spans 744 slots, a month of hours), but no public REST endpoint returns
 * its contents — which is why hourly history comes from the exported CSV
 * instead of from this call.
 */
export const LIVE_PARAM_KEYS = ["power", "voltage", "current", "dayKwh", "monthKwh", "online"];

export type LiveElectrical = {
  powerW: number | null;
  voltageV: number | null;
  currentA: number | null;
  /** The device's own counter for the calendar day so far. */
  dayKwh: number | null;
  /** The device's own counter for the calendar month so far. */
  monthKwh: number | null;
  /**
   * False when this device type's scale has never been established. Every
   * figure above is then null rather than raw — a number printed at an
   * unknown scale is worse than no number, because it reads as fact.
   */
  scaleKnown: boolean;
};

function raw(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function scaled(v: unknown, divisor: number): number | null {
  const n = raw(v);
  if (n === null) return null;
  // Hundredths in, so two decimals out exactly — floating point would
  // otherwise turn 22945/100 into a figure that renders with a tail.
  return Math.round((n / divisor) * 100) / 100;
}

/** Read a device's live electrical parameters at their true scale. */
export function readElectrical(uiid: number, params: Record<string, unknown>): LiveElectrical {
  const divisor = scaleDivisorFor(uiid);
  if (divisor === null) {
    return {
      powerW: null,
      voltageV: null,
      currentA: null,
      dayKwh: null,
      monthKwh: null,
      scaleKnown: false,
    };
  }
  return {
    powerW: scaled(params.power, divisor),
    voltageV: scaled(params.voltage, divisor),
    currentA: scaled(params.current, divisor),
    dayKwh: scaled(params.dayKwh, divisor),
    monthKwh: scaled(params.monthKwh, divisor),
    scaleKnown: true,
  };
}

/** The band a live mains reading has to land in for the scale to be believable. */
export const MAINS_MIN_V = 90;
export const MAINS_MAX_V = 300;

/**
 * Whether a scaled voltage is a believable mains reading. Null when the
 * device reported no voltage, or reported a dead circuit (0 V), neither of
 * which is evidence either way about the scale.
 */
export function mainsPlausible(voltageV: number | null): boolean | null {
  if (voltageV === null || voltageV === 0) return null;
  return voltageV >= MAINS_MIN_V && voltageV <= MAINS_MAX_V;
}
