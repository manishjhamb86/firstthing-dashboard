/**
 * The inspections page's own summary header (2026-10-06, user-asked): a
 * current-month filing status and a portfolio-wide fault-rate judgment, so
 * ops can see at a glance who's behind and which societies are genuinely
 * having a bad run rather than one unlucky visit.
 *
 * Both halves are pure, deterministic and documented, the same call this
 * codebase already made for `day-validity.ts` and `hourly-anomaly.ts`: a
 * figure an operator acts on has to read the same way twice on the same
 * data. The DB-facing page issues the queries and hands this module plain
 * rows; nothing here touches `db` directly.
 *
 * ---- Current-month status ----
 *
 * Reuses the SAME "owes an inspection" definition the bell/notification
 * centre already established (`societiesMissingInspection`,
 * `inspectionReminderPeriod`) rather than inventing a second rule: a
 * society is only "delayed" once it has missed the LAST period too, not
 * merely because the current, still-open month hasn't been visited yet —
 * that is ordinary mid-month "pending", not overdue.
 *
 * ---- Chronic vs. sporadic faults ----
 *
 * Grounded in the standard quality-management distinction between a
 * sporadic spike (one bad reading, no action needed beyond that one fix)
 * and a chronic problem (a sustained, recurring rate that needs root-cause
 * attention) — Juran's "sporadic vs. chronic" framing, long-established in
 * reliability/quality engineering and the same shape as this codebase's own
 * day-level vs. hour-level anomaly checks elsewhere. A single bad visit
 * should never flag a society; a RUN of them should.
 *
 * A society is flagged "chronic" only when BOTH hold over its trailing
 * window of recent visits:
 *  - its average fault rate clears a bar set relative to the portfolio's
 *    own typical rate (never a number invented in isolation — a society
 *    reads as unusual only against what every other society is doing this
 *    season), with a small absolute floor so a near-zero portfolio median
 *    can't make ordinary noise look alarming;
 *  - that rate is not one visit dragging the average up — a MAJORITY of
 *    the window's own visits must individually clear the bar too.
 *
 * Needs a minimum of visits before judging at all — a society audited
 * once, however bad that one visit, is evidence of nothing yet.
 */

export type SocietyFaultHistory = {
  societyId: string;
  name: string;
  /** findings ÷ totalLightsChecked for each finalised inspection, chronological (oldest first). */
  faultRates: number[];
};

export const MIN_INSPECTIONS_FOR_JUDGMENT = 3;
export const TRAILING_WINDOW = 6;
export const CHRONIC_MULTIPLE = 2;
export const CHRONIC_FLOOR_PCT = 3;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type ChronicFlag = {
  societyId: string;
  name: string;
  inspectionsConsidered: number;
  /** The society's own trailing-window average fault rate, as a percentage. */
  recentFaultRatePct: number;
};

export type PortfolioFaultSummary = {
  /** Societies with enough history to judge, reading as ordinary. */
  normalCount: number;
  /** Societies flagged as a sustained, recurring problem — not one bad visit. */
  chronicCount: number;
  /** Societies with too little inspection history to judge either way yet. */
  notEnoughHistoryCount: number;
  /** What "typical" looks like this portfolio-wide — the bar every flag is judged against, never an isolated number. */
  portfolioMedianFaultRatePct: number;
  /** Worst-first. */
  chronic: ChronicFlag[];
};

export function classifyPortfolioFaultRates(histories: SocietyFaultHistory[]): PortfolioFaultSummary {
  const judged = histories.filter((h) => h.faultRates.length >= MIN_INSPECTIONS_FOR_JUDGMENT);
  const notEnoughHistoryCount = histories.length - judged.length;

  const withAverage = judged.map((h) => ({
    h,
    recent: h.faultRates.slice(-TRAILING_WINDOW),
  }));
  const portfolioMedian = median(withAverage.map(({ recent }) => mean(recent)));
  const threshold = Math.max(portfolioMedian * CHRONIC_MULTIPLE, CHRONIC_FLOOR_PCT / 100);

  const chronic: ChronicFlag[] = [];
  for (const { h, recent } of withAverage) {
    const avg = mean(recent);
    const breaches = recent.filter((r) => r >= threshold).length;
    const consistentlyHigh = breaches >= Math.ceil(recent.length / 2);
    if (avg >= threshold && consistentlyHigh) {
      chronic.push({
        societyId: h.societyId,
        name: h.name,
        inspectionsConsidered: recent.length,
        recentFaultRatePct: avg * 100,
      });
    }
  }
  chronic.sort((a, b) => b.recentFaultRatePct - a.recentFaultRatePct);

  return {
    normalCount: judged.length - chronic.length,
    chronicCount: chronic.length,
    notEnoughHistoryCount,
    portfolioMedianFaultRatePct: portfolioMedian * 100,
    chronic,
  };
}

export type MonthSummary = {
  totalActive: number;
  doneCount: number;
  pendingCount: number;
  delayedCount: number;
};

/**
 * Current-month filing status over every society with an active contract.
 * `missingLastMonthIds` is exactly `societiesMissingInspection`'s own result
 * for the PRIOR period — reused, not re-derived, so this summary and the
 * bell's own reminder can never disagree about who counts as overdue.
 */
export function currentMonthSummary(input: {
  activeSocietyIds: string[];
  doneThisMonthIds: Set<string>;
  missingLastMonthIds: Set<string>;
}): MonthSummary {
  let doneCount = 0;
  let pendingCount = 0;
  let delayedCount = 0;
  for (const id of input.activeSocietyIds) {
    if (input.doneThisMonthIds.has(id)) {
      doneCount++;
      continue;
    }
    if (input.missingLastMonthIds.has(id)) delayedCount++;
    else pendingCount++;
  }
  return { totalActive: input.activeSocietyIds.length, doneCount, pendingCount, delayedCount };
}
