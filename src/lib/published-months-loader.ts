import { cache } from "react";
import { db } from "@/lib/db";
import { summarisePublished, weightedSavingsPct, type PublishedMonthRow, type PublishedSummary } from "@/lib/published-months";

/**
 * INV-05: the society id is the ONLY scope, taken from the viewer's own row
 * by every caller. Live versions only — a superseded version is history the
 * back office keeps, not a month the society is shown twice.
 */
export const publishedMonthsFor = cache(async (societyId: string): Promise<PublishedSummary> => {
  const calcs = await db.monthlyCalculation.findMany({
    where: { societyId, releasedAt: { not: null }, supersededById: null, status: { not: "superseded" } },
    select: {
      period: true,
      version: true,
      releasedAt: true,
      rederivedAt: true,
      totalSavedKwh: true,
      totalSavedValue: true,
      subtotal: true,
      inputVersionSnapshot: true,
      feeLines: { select: { basis: true, savedKwh: true, measuredSavingsPct: true } },
    },
    orderBy: [{ period: "desc" }, { version: "desc" }],
  });
  const byPeriod = new Map<string, PublishedMonthRow>();
  for (const c of calcs) {
    if (byPeriod.has(c.period)) continue;
    const snap = c.inputVersionSnapshot as { lines?: { readingsNote?: string | null }[] } | null;
    byPeriod.set(c.period, {
      period: c.period,
      version: c.version,
      releasedAt: c.releasedAt!,
      rederivedAt: c.rederivedAt,
      totalSavedKwh: c.totalSavedKwh,
      totalSavedValue: c.totalSavedValue,
      fee: c.subtotal,
      lineBases: c.feeLines.map((l) => l.basis),
      savingsPct: weightedSavingsPct(c.feeLines.map((l) => ({ savedKwh: l.savedKwh, pct: l.measuredSavingsPct }))),
      readingsNotes: (snap?.lines ?? []).map((l) => l.readingsNote).filter((n): n is string => !!n),
    });
  }
  return summarisePublished([...byPeriod.values()]);
});
