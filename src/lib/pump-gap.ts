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


export type GapDay = { date: Date; kwh: number | null; kl: number | null; known: boolean };

/**
 * The same spread, when some days in the gap already carry figures of their
 * own (2026-11-19): a day the room's other, electricity-only meter reported
 * (kWh known, water not), or a day typed in from a filed report (both known).
 * A known figure is kept; the rest of each register rise is divided over the
 * days that lack that figure. Totals still equal what the water meter recorded.
 */
export function spreadGapAround(
  input: Parameters<typeof spreadGap>[0],
  knownDays: Map<string, { kwh: number | null; kl: number | null }>,
): GapDay[] | null {
  const n = Math.round((input.nextDate.getTime() - input.prevDate.getTime()) / DAY) - 1;
  if (n <= 0) return null;
  const dates = Array.from({ length: n }, (_, i) => new Date(input.prevDate.getTime() + (i + 1) * DAY));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const rise = (closing: number | null, opening: number | null) =>
    closing !== null && opening !== null && opening - closing >= 0 ? opening - closing : null;
  const share = (total: number | null, pick: (k: { kwh: number | null; kl: number | null }) => number | null) => {
    if (total === null) return null;
    let used = 0;
    let open = 0;
    for (const d of dates) {
      const v = knownDays.has(key(d)) ? pick(knownDays.get(key(d))!) : null;
      if (v === null) open++;
      else used += v;
    }
    const left = total - used;
    return left >= 0 && open > 0 ? left / open : null;
  };
  const kwhShare = share(rise(input.prevClosingKwh, input.nextOpeningKwh), (k) => k.kwh);
  const klShare = share(rise(input.prevClosingFlow, input.nextOpeningFlow), (k) => k.kl);
  return dates.map((date) => {
    const k = knownDays.get(key(date));
    return { date, kwh: k?.kwh ?? kwhShare, kl: k?.kl ?? klShare, known: k !== undefined };
  });
}
