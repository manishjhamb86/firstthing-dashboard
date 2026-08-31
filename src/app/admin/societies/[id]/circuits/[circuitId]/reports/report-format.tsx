import type { CSSProperties } from "react";
import {
  PRE_FLAG_PCT,
  PRE_WARN_PCT,
  SAVINGS_BAND_META,
  SAVINGS_CYAN_MIN,
  SAVINGS_GREEN_MIN,
  SAVINGS_ORANGE_MIN,
  SAVINGS_SUSPECT_ABOVE,
  SAVINGS_YELLOW_MIN,
  VARIANCE_BAND_META,
  type SavingsBand,
  type VarianceBand,
} from "@/lib/circuit-load";
import type { ChipTone } from "@/components/ui";
import type { ReportDay } from "./report-data";

/**
 * The one formatting system all three consumption reports share (2026-08-31).
 *
 * The monthly report settled these rules one user round at a time — the
 * sheet, days reading DOWN columns, the assessment as a LEGEND whose entries
 * state the numeric range, strike-through on the figures never the date —
 * and the pre/post reports then still carried every defect the monthly one
 * had fixed. Three copies of one system is how that happens; this module is
 * the single copy.
 */

// ── Bands, stated as words a chip can carry and ranges a reader can decode ──

/**
 * Band → chip tone. The band's own accent inks fail contrast at chip sizes,
 * so wording goes through the app's contrast-tuned StatusChip tones.
 */
export const BAND_TONE: Record<SavingsBand, ChipTone> = {
  green: "ok",
  cyan: "info",
  yellow: "warn",
  orange: "warn",
  red: "bad",
  suspect: "warn",
};

/**
 * What each band MEANS, as the range that produces it — built from the
 * thresholds themselves so a retuned band cannot leave a legend lying.
 * The range is what lets the per-row assessment column go away without
 * colour becoming the only carrier: every row decodes from its own printed
 * figure, on a mono printer, in greyscale, for any reader.
 */
export const BAND_RANGE: Record<SavingsBand, string> = {
  suspect: `over ${SAVINGS_SUSPECT_ABOVE}%`,
  green: `${SAVINGS_GREEN_MIN}–${SAVINGS_SUSPECT_ABOVE}%`,
  cyan: `${SAVINGS_CYAN_MIN}–${SAVINGS_GREEN_MIN}%`,
  yellow: `${SAVINGS_YELLOW_MIN}–${SAVINGS_CYAN_MIN}%`,
  orange: `${SAVINGS_ORANGE_MIN}–${SAVINGS_YELLOW_MIN}%`,
  red: `under ${SAVINGS_ORANGE_MIN}%`,
};

/** Legend wording: the range says the number, the label names the action. */
export const BAND_KEY: Record<SavingsBand, string> = {
  suspect: "Check the meter",
  green: "On target",
  cyan: "Within band",
  yellow: "Slightly under",
  orange: "Under target",
  red: "Well under",
};

/** Best to worst, so a legend reads as a scale rather than a set. */
export const BAND_ORDER: SavingsBand[] = ["suspect", "green", "cyan", "yellow", "orange", "red"];

export const VARIANCE_ORDER: VarianceBand[] = ["ok", "flag", "warn"];
export const VARIANCE_KEY: Record<VarianceBand, string> = {
  ok: "As predicted",
  flag: "Worth a look",
  warn: "Investigate",
};
export const VARIANCE_RANGE: Record<VarianceBand, string> = {
  ok: `within ±${PRE_FLAG_PCT}%`,
  flag: `±${PRE_FLAG_PCT}–${PRE_WARN_PCT}%`,
  warn: `beyond ±${PRE_WARN_PCT}%`,
};

// ── Dates ──

/**
 * A savings/variance percentage as a whole number — presentation ONLY; the
 * stored reading keeps every digit and the exact value rides each figure's
 * title attribute.
 */
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** "Fri 20 Feb" — prose and notes, where a line is read on its own. */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * "Wed 10" — inside a day column only, where the month is already in the
 * masthead; repeating it per row is what once pushed the table past its own
 * column and into a silent clip.
 */
export function dayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * "Wed 10 Feb" when days span months (the pre/post windows usually do),
 * "Wed 10" when one month covers them all.
 */
function dayIn(iso: string, oneMonth: boolean): string {
  return oneMonth ? dayShort(iso) : dayLabel(iso);
}

// ── The columned day grid ──

/** Down each column, then across — the layout that put a month on one A4. */
export function columnsFor(count: number): number {
  return count > 20 ? 3 : count > 10 ? 2 : 1;
}

function splitColumns(days: ReportDay[]): ReportDay[][] {
  const cols = columnsFor(days.length);
  const per = Math.ceil(days.length / cols);
  const out: ReportDay[][] = [];
  for (let i = 0; i < days.length; i += per) out.push(days.slice(i, i + per));
  return out;
}

/**
 * The day-by-day evidence, in columns, with the assessment carried by tint +
 * the legend rather than a word repeated on every row. `mode` picks which
 * figure the tint judges: savings vs the baseline (post/monthly) or variance
 * vs theoretical (pre).
 */
export function DaysGrid({ days, mode }: { days: ReportDay[]; mode: "savings" | "variance" }) {
  const cols = splitColumns(days);
  const oneMonth = new Set(days.map((d) => d.date.slice(0, 7))).size <= 1;
  return (
    <div className="report-daily" style={{ "--daily-cols": cols.length } as CSSProperties}>
      {cols.map((col, i) => (
        <div key={i} className="report-daily-col print-table-scroll">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">kWh</th>
                <th className="text-right">{mode === "savings" ? "Savings" : "vs theory"}</th>
              </tr>
            </thead>
            <tbody>
              {col.map((d) => {
                const value = mode === "savings" ? d.savingsPct : d.variancePct;
                const bg =
                  mode === "savings"
                    ? d.savingsBand
                      ? SAVINGS_BAND_META[d.savingsBand].bg
                      : undefined
                    : d.varianceBand && d.varianceBand !== "ok"
                      ? VARIANCE_BAND_META[d.varianceBand].bg
                      : undefined;
                const text =
                  value === null
                    ? "—"
                    : mode === "savings"
                      ? pct(value)
                      : `${value > 0 ? "+" : ""}${pct(value)}`;
                // The class names the band so the print stylesheet can remap
                // the tint to a distinct GREY — six hues at one lightness
                // collapse to one grey on a mono printer.
                const bandClass =
                  mode === "savings"
                    ? d.savingsBand
                      ? ` report-band-${d.savingsBand}`
                      : ""
                    : d.varianceBand && d.varianceBand !== "ok"
                      ? ` report-vband-${d.varianceBand}`
                      : "";
                return (
                  <tr key={d.date} className={d.excluded ? "report-row-excluded" : undefined}>
                    <td className="num whitespace-nowrap">{dayIn(d.date, oneMonth)}</td>
                    <td className="num text-right">
                      <span className={d.excluded ? "line-through" : undefined}>{d.kWh.toFixed(2)}</span>
                    </td>
                    <td className="text-right">
                      {value === null ? (
                        <span className="num">—</span>
                      ) : d.excluded ? (
                        <span className="num line-through">{text}</span>
                      ) : (
                        <span
                          className={"num report-band" + bandClass}
                          style={{ background: bg }}
                          title={value.toFixed(2) + "%"}
                        >
                          {text}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Only the bands the days actually produced — a key, not a reference card. */
export function ReportLegend({ days, mode }: { days: ReportDay[]; mode: "savings" | "variance" }) {
  const excludedCount = days.filter((d) => d.excluded).length;
  const entries =
    mode === "savings"
      ? BAND_ORDER.filter((b) => days.some((d) => !d.excluded && d.savingsBand === b)).map((b) => ({
          key: b as string,
          cls: `report-band-${b}`,
          bg: SAVINGS_BAND_META[b].bg,
          label: BAND_KEY[b],
          range: BAND_RANGE[b],
        }))
      : VARIANCE_ORDER.filter((b) => days.some((d) => !d.excluded && d.varianceBand === b)).map((b) => ({
          key: b as string,
          cls: b === "ok" ? "" : `report-vband-${b}`,
          bg: b === "ok" ? "var(--surface-sunken)" : VARIANCE_BAND_META[b].bg,
          label: VARIANCE_KEY[b],
          range: VARIANCE_RANGE[b],
        }));
  if (entries.length === 0 && excludedCount === 0) return null;
  return (
    <dl className="report-legend">
      {entries.map((e) => (
        <div key={e.key}>
          <dt className={"report-band " + e.cls} style={{ background: e.bg }} aria-hidden />
          <dd>
            {e.label}
            <span className="num"> {e.range}</span>
          </dd>
        </div>
      ))}
      {excludedCount > 0 && (
        <div>
          <dt className="report-band report-band-excluded" aria-hidden />
          <dd>Excluded — not counted in the average</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Excluded days are shown, never hidden — but their reasons are exceptions,
 * and exceptions belong in a note rather than a column every row pays for.
 * Partial days state their hour count here too, for the same reason.
 */
export function ExclusionNotes({ days }: { days: ReportDay[] }) {
  const excluded = days.filter((d) => d.excluded);
  if (excluded.length === 0) return null;
  return (
    <ul className="report-exclusions">
      {excluded.map((d) => (
        <li key={d.date}>
          <span className="num">{dayLabel(d.date)}</span> — {d.excludedReason}
        </li>
      ))}
    </ul>
  );
}
