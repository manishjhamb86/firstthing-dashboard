/**
 * Spreading a run of missing pump-room days (2026-11-18, user-specified).
 *
 * The vendor sends one report a day; when some never arrive, the register
 * still kept counting. What the meter added between the last report's
 * CLOSING value and the next report's OPENING value is the consumption of
 * the missing days, and it is divided equally between them — so the totals
 * stay exactly what the meter recorded and no day is blank. Each spread day
 * is stored marked (origin `distributed`), never presented as a reading.
 *
 * A register that went backwards across the gap (a meter swap or reset)
 * gives no honest figure to divide: that metric is left null and those days
 * stay missing. Pure — the ingest is a thin shell around it.
 */
const DAY = 86_400_000;

export type GapSpread = { dates: Date[]; kwhPerDay: number | null; klPerDay: number | null };

export function spreadGap(input: {
  prevDate: Date;
  prevClosingKwh: number | null;
  prevClosingFlow: number | null;
  nextDate: Date;
  nextOpeningKwh: number | null;
  nextOpeningFlow: number | null;
}): GapSpread | null {
  const n = Math.round((input.nextDate.getTime() - input.prevDate.getTime()) / DAY) - 1;
  if (n <= 0) return null;
  const per = (closing: number | null, opening: number | null) =>
    closing !== null && opening !== null && opening - closing >= 0 ? (opening - closing) / n : null;
  const kwhPerDay = per(input.prevClosingKwh, input.nextOpeningKwh);
  const klPerDay = per(input.prevClosingFlow, input.nextOpeningFlow);
  if (kwhPerDay === null && klPerDay === null) return null;
  const dates = Array.from({ length: n }, (_, i) => new Date(input.prevDate.getTime() + (i + 1) * DAY));
  return { dates, kwhPerDay, klPerDay };
}


export type GapDay = { date: Date; kwh: number | null; kl: number | null; fromOtherMeter: boolean };

/**
 * The same spread, when some days in the gap carry electricity from the
 * room's other meter (2026-11-19, user's call: RG's original, electricity-only
 * meter reported on days the water meter did not). Those days keep their own
 * kWh; the rest of the register rise is divided over the days neither meter
 * reported. Water is divided over every day in the gap, since only the water
 * meter measures it. Totals still equal what the water meter recorded.
 */
export function spreadGapAround(
  input: Parameters<typeof spreadGap>[0],
  otherMeterKwh: Map<string, number | null>,
): GapDay[] | null {
  const n = Math.round((input.nextDate.getTime() - input.prevDate.getTime()) / DAY) - 1;
  if (n <= 0) return null;
  const dates = Array.from({ length: n }, (_, i) => new Date(input.prevDate.getTime() + (i + 1) * DAY));
  const rise = (closing: number | null, opening: number | null) =>
    closing !== null && opening !== null && opening - closing >= 0 ? opening - closing : null;
  const kwhRise = rise(input.prevClosingKwh, input.nextOpeningKwh);
  const klRise = rise(input.prevClosingFlow, input.nextOpeningFlow);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const known = dates.filter((d) => otherMeterKwh.has(key(d)));
  const knownKwh = known.reduce((s, d) => s + (otherMeterKwh.get(key(d)) ?? 0), 0);
  const unknownCount = n - known.length;
  const left = kwhRise === null ? null : kwhRise - knownKwh;
  const kwhPerUnknown = left !== null && left >= 0 && unknownCount > 0 ? left / unknownCount : null;
  const klPerDay = klRise === null ? null : klRise / n;
  return dates.map((date) =>
    otherMeterKwh.has(key(date))
      ? { date, kwh: otherMeterKwh.get(key(date)) ?? null, kl: klPerDay, fromOtherMeter: true }
      : { date, kwh: kwhPerUnknown, kl: klPerDay, fromOtherMeter: false },
  );
}
