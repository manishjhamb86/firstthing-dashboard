// Which anomaly rule applies to a commissioning day, and why it differs by
// window.
//
// The two windows are asking genuinely different questions, so applying one
// rule to both produces false flags in one of them — which is exactly what
// happened before this module existed.
//
//   PRE-INSTALL   No baseline exists yet; the window's whole job is to
//                 produce one. So the only thing that can be asked of a day
//                 is whether it is *self-consistent* with the other days —
//                 MS-07's ±5%-against-the-median detector. A day that is
//                 wildly off its neighbours is a meter fault or a typo, and
//                 averaging it into the baseline would poison every figure
//                 the contract later rests on.
//
//   POST-INSTALL  A baseline DOES exist, and CON-20 states what a plausible
//                 post-retrofit day looks like against it: 60-80% savings.
//                 That is the question worth asking, and it is strictly more
//                 informative than self-consistency. Applying ±5% here flags
//                 ordinary daily jitter — a day 5.2% off its neighbours can
//                 sit comfortably at 69% savings — and because an anomaly
//                 restarts CON-19's 5-day count, those false flags meant a
//                 healthy circuit could never finish its window.
//
// The band also subsumes the data-quality check it replaces: a dead meter
// (0 kWh) reads as 100% savings and a 10x transcription error as negative
// savings, both far outside 60-80%. So nothing is lost by not running the
// ±5% detector here.

/** CON-20's plausible-savings band for a completed LED retrofit. */
export const BENCHMARK_MIN_PCT = 60;
export const BENCHMARK_MAX_PCT = 80;

/**
 * CON-10's savings percentage for a single day against the baseline in force.
 *
 * Not rounded: this feeds a benchmark that prices a contract, and rounding
 * here pushes error into the figure a society is billed on (INV-02).
 */
export function daySavingsPct(consumptionKwh: number, baselineKwhPerDay: number): number {
  return ((baselineKwhPerDay - consumptionKwh) / baselineKwhPerDay) * 100;
}

export type PostInstallDayVerdict =
  | { anomaly: false; savingsPct: number }
  | { anomaly: true; savingsPct: number; detail: string };

/**
 * Judge one post-install day against CON-20's band.
 *
 * Deliberately evaluated per day rather than only at window completion. The
 * completion check still exists and still decides the benchmark — but finding
 * out on day 5 that day 1 was implausible wastes four days of a field team's
 * time, and CON-19's restart rule already exists to handle exactly this.
 */
export function judgePostInstallDay(
  consumptionKwh: number,
  baselineKwhPerDay: number,
): PostInstallDayVerdict {
  // A zero or missing baseline is not a judgment this function can make; the
  // caller refuses the window instead. Returning "fine" would be worse than
  // saying nothing, so it is surfaced as an anomaly with its real cause.
  if (!Number.isFinite(baselineKwhPerDay) || baselineKwhPerDay <= 0) {
    return {
      anomaly: true,
      savingsPct: 0,
      detail: "no usable pre-install baseline to compare against",
    };
  }

  const savingsPct = daySavingsPct(consumptionKwh, baselineKwhPerDay);
  if (savingsPct >= BENCHMARK_MIN_PCT && savingsPct <= BENCHMARK_MAX_PCT) {
    return { anomaly: false, savingsPct };
  }

  const direction = savingsPct < BENCHMARK_MIN_PCT ? "below" : "above";
  return {
    anomaly: true,
    savingsPct,
    detail:
      `${consumptionKwh} kWh against a ${round2(baselineKwhPerDay)} kWh/day baseline is ` +
      `${round1(savingsPct)}% savings — ${direction} CON-20's ${BENCHMARK_MIN_PCT}-${BENCHMARK_MAX_PCT}% band`,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * CON-19's restart, corrected.
 *
 * "Restart the count at the next midnight" means the days already recorded
 * stop counting. Taking that literally as *tomorrow* is only right when the
 * recorded days are in the past — with a day dated ahead of today (a
 * back-office correction, a batch entered in advance, or simply test data)
 * the anomaly stays inside the restarted window and the restart silently
 * achieves nothing. So the new start is the later of tomorrow and the day
 * after the last recorded day: whichever it is, every existing reading is
 * genuinely excluded.
 */
export function restartFromDate(now: Date, latestReadingDate: Date | null): Date {
  const tomorrow = nextUtcMidnight(now);
  if (!latestReadingDate) return tomorrow;
  const afterLast = nextUtcMidnight(latestReadingDate);
  return afterLast.getTime() > tomorrow.getTime() ? afterLast : tomorrow;
}

function nextUtcMidnight(d: Date): Date {
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  s.setUTCDate(s.getUTCDate() + 1);
  return s;
}
