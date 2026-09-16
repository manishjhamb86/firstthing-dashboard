/**
 * FEAT-111 — the months a society may see: RELEASED calculations only
 * (CON-33 / CON-47 c). A submitted month is the back office's business until
 * the accountant publishes it, and nothing here reads one.
 *
 * Every figure a society reads traces to a released `MonthlyCalculation`
 * and its fee lines (INV-02) — the platform repeats a billed figure, never
 * derives one for the portal. The basis is always stated in the words
 * ASSUM-30 settled: "Based on your agreement." / "From meter readings."
 *
 * Pure — the loader is published-months-loader.ts, so this tests without db.
 */

export type PublishedBasis = "agreed" | "measured" | "mixed";

export const BASIS_WORDS: Record<PublishedBasis, string> = {
  agreed: "Based on your agreement.",
  measured: "From meter readings.",
  mixed: "Partly from meter readings, partly on your agreement.",
};

export type PublishedMonthRow = {
  period: string;
  version: number;
  releasedAt: Date;
  rederivedAt: Date | null;
  totalSavedKwh: number;
  totalSavedValue: number;
  /** What FirsThing billed (pre-tax) — its share of the saving. */
  fee: number;
  lineBases: ("agreed" | "measured")[];
  /** The % the lines rest on, weighted by each line's saved kWh. */
  savingsPct: number | null;
  readingsNotes: string[];
};

export type PublishedMonth = {
  period: string;
  version: number;
  releasedAt: Date;
  /** Set when this version re-derived an earlier one from readings (FEAT-111-AC-7). */
  updatedAt: Date | null;
  savedKwh: number;
  savedValue: number;
  paidToFirsthing: number;
  societyKeeps: number;
  savingsPct: number | null;
  basis: PublishedBasis;
  basisWords: string;
  notes: string[];
};

export type PublishedSummary = {
  months: PublishedMonth[];
  latest: PublishedMonth | null;
  sinceStart: { months: number; savedValue: number; savedKwh: number; paidToFirsthing: number; societyKeeps: number } | null;
};

export function publishedMonthOf(r: PublishedMonthRow): PublishedMonth {
  const bases = new Set(r.lineBases);
  const basis: PublishedBasis = bases.size === 0 ? "agreed" : bases.size > 1 ? "mixed" : (r.lineBases[0] as PublishedBasis);
  return {
    period: r.period,
    version: r.version,
    releasedAt: r.releasedAt,
    updatedAt: r.rederivedAt,
    savedKwh: r.totalSavedKwh,
    savedValue: r.totalSavedValue,
    paidToFirsthing: r.fee,
    societyKeeps: r.totalSavedValue - r.fee,
    savingsPct: r.savingsPct,
    basis,
    basisWords: BASIS_WORDS[basis],
    notes: r.readingsNotes,
  };
}

/** Newest month first; one entry per period — the caller passes only live versions. */
export function summarisePublished(rows: PublishedMonthRow[]): PublishedSummary {
  const months = rows.map(publishedMonthOf).sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
  const latest = months[0] ?? null;
  const sinceStart =
    months.length === 0
      ? null
      : months.reduce(
          (s, m) => ({
            months: s.months + 1,
            savedValue: s.savedValue + m.savedValue,
            savedKwh: s.savedKwh + m.savedKwh,
            paidToFirsthing: s.paidToFirsthing + m.paidToFirsthing,
            societyKeeps: s.societyKeeps + m.societyKeeps,
          }),
          { months: 0, savedValue: 0, savedKwh: 0, paidToFirsthing: 0, societyKeeps: 0 },
        );
  return { months, latest, sinceStart };
}

/** The savings % the lines rest on, weighted by the consumption behind each. */
export function weightedSavingsPct(lines: { savedKwh: number; pct: number }[]): number | null {
  let saved = 0;
  let base = 0;
  for (const l of lines) {
    if (!(l.pct > 0)) continue;
    saved += l.savedKwh;
    base += l.savedKwh / (l.pct / 100);
  }
  return base > 0 ? (saved / base) * 100 : null;
}
