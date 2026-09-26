/**
 * Correcting a light count that was TYPED WRONG (2026-09-26, user-asked).
 *
 * Different in kind from a light-count change (benchmark-rescale.ts): a
 * rescale records that the lights on the circuit really changed on a date,
 * and the old baseline stands for the time before it. A correction says the
 * count was never right, so it is fixed where it was typed, everywhere the
 * same wrong figure was carried — the inventory line, the lights recorded as
 * replaced on that line, the circuit's metered count and each demo that
 * metered that total — with the old value kept in the change log.
 *
 * A figure that merely COINCIDES is left alone: only values equal to the
 * wrong one follow, so a demo that metered a different number of lights, or
 * a circuit whose count was set independently, is not rewritten.
 */
export type CountCorrectionInput = {
  lines: { id: string; count: number; replacementCount: number | null }[];
  lineId: string;
  newCount: number;
  circuitMeteredCount: number;
  demos: { id: string; meteredLightCount: number }[];
};

export type CountCorrectionPlan = {
  oldCount: number;
  newCount: number;
  totalOld: number;
  totalNew: number;
  /** The recorded replacement count follows when it repeated the wrong figure. */
  replacementCount: number | null | "unchanged";
  circuitMeteredCount: number | null;
  demoIds: string[];
};

export function planCountCorrection(i: CountCorrectionInput): { error: string } | CountCorrectionPlan {
  const line = i.lines.find((l) => l.id === i.lineId);
  if (!line) return { error: "That inventory line is no longer on record." };
  if (!Number.isInteger(i.newCount) || i.newCount < 1 || i.newCount > 5000) return { error: "The count must be a whole number between 1 and 5000." };
  if (i.newCount === line.count) return { error: "That is already the count on record." };
  const totalOld = i.lines.reduce((n, l) => n + l.count, 0);
  const totalNew = totalOld - line.count + i.newCount;
  // Where the wrong figure was carried: the line total when the inventory has
  // several lines, or the line itself when it is the only one.
  const carried = (n: number) => n === totalOld || (i.lines.length === 1 && n === line.count);
  return {
    oldCount: line.count,
    newCount: i.newCount,
    totalOld,
    totalNew,
    replacementCount: line.replacementCount === line.count ? i.newCount : "unchanged",
    circuitMeteredCount: carried(i.circuitMeteredCount) ? totalNew : null,
    demoIds: i.demos.filter((d) => carried(d.meteredLightCount)).map((d) => d.id),
  };
}
