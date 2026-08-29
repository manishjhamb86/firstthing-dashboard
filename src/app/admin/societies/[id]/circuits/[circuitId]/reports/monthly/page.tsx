import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import {
  SAVINGS_BAND_META,
  SAVINGS_CYAN_MIN,
  SAVINGS_GREEN_MIN,
  SAVINGS_ORANGE_MIN,
  SAVINGS_SUSPECT_ABOVE,
  SAVINGS_WARN_BELOW,
  SAVINGS_YELLOW_MIN,
  type SavingsBand,
} from "@/lib/circuit-load";
import { loadCircuitReport, monthDays, monthsWithData, summarize, type ReportDay } from "../report-data";
import { PrintButton } from "../report-shared";
import { BackButton } from "@/components/back-button";
import { StatusChip, type ChipTone } from "@/components/ui";

// CON-45 — the monthly savings report for one explicitly-selected month
// (INV-04: the month is a selection, never inferred). Circuit-scoped and
// kWh-only by design: the rupee figures a society is billed on come from
// the released monthly calculation (MS-08), which this report deliberately
// does not duplicate — two sources for one money figure is how they end up
// disagreeing.

/**
 * The band's own tint is a wash, not an ink: #0e7fa5 on the cyan tint is
 * 3.5:1 and #1f9d55 on the green one is 3.0:1, both under 4.5 for the 14px
 * semibold this renders at. So the tint carries the signal and `--text`
 * carries the characters — and where the band is stated in WORDS it goes
 * through the app's own contrast-tuned StatusChip rather than an ink colour
 * invented here. Five tones to six bands is fine: the label is always the
 * band's own wording, so "Slightly under" and "Under target" stay distinct
 * to the reader even though both are warn-toned.
 */
const BAND_TONE: Record<SavingsBand, ChipTone> = {
  green: "ok",
  cyan: "info",
  yellow: "warn",
  orange: "warn",
  red: "bad",
  suspect: "warn",
};

/**
 * A savings percentage, as a whole number (the user's call, 2026-08-29).
 *
 * Presentation ONLY. Nothing here feeds a calculation: the stored reading
 * keeps every digit, the released monthly calculation still computes on the
 * unrounded figure, and this report says so in its own closing note. The
 * exact value stays reachable on each figure's title, so a disputed day can
 * still be read to two places without re-opening the database.
 */
function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/**
 * What each band MEANS, as the range that produces it. This is what lets the
 * per-row assessment column go away without the colour becoming the only
 * carrier: every row's band decodes from the figure printed in it, so the
 * table survives a mono printer, a greyscale photocopy and a reader who
 * cannot separate the tints. Built from the thresholds themselves, so a
 * retuned band cannot leave the legend saying something untrue.
 */
const BAND_RANGE: Record<SavingsBand, string> = {
  suspect: `over ${SAVINGS_SUSPECT_ABOVE}%`,
  green: `${SAVINGS_GREEN_MIN}\u2013${SAVINGS_SUSPECT_ABOVE}%`,
  cyan: `${SAVINGS_CYAN_MIN}\u2013${SAVINGS_GREEN_MIN}%`,
  yellow: `${SAVINGS_YELLOW_MIN}\u2013${SAVINGS_CYAN_MIN}%`,
  orange: `${SAVINGS_ORANGE_MIN}\u2013${SAVINGS_YELLOW_MIN}%`,
  red: `under ${SAVINGS_ORANGE_MIN}%`,
};

/**
 * The legend's own wording. SAVINGS_BAND_META's labels are written to stand
 * alone in a sentence; here each sits beside its numeric range, which
 * already says "implausibly high", so the label only has to name the ACTION.
 * The long one wrapped the legend onto a second line (user-reported with a
 * screenshot, 2026-08-29) — and a key that wraps stops reading as one row.
 */
const BAND_KEY: Record<SavingsBand, string> = {
  suspect: "Check the meter",
  green: "On target",
  cyan: "Within band",
  yellow: "Slightly under",
  orange: "Under target",
  red: "Well under",
};

/** Best month to worst, so the legend reads as a scale rather than a set. */
const BAND_ORDER: SavingsBand[] = ["suspect", "green", "cyan", "yellow", "orange", "red"];

/**
 * "Fri 20 Feb" — every row of a monthly report is the same month and year,
 * so the day is the only part that varies, and the year lives in the
 * masthead. The full ISO date rendered in the mono face wrapped onto two
 * lines in the date column; this never does. UTC, like every other date
 * reader in this codebase: these are stored at UTC midnight and a local
 * read shifts the day backwards west of Greenwich.
 */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * "Wed 10" — inside the table only. Every row of a monthly report is the
 * same month and the same year, and both are stated in the masthead (and in
 * the colophon, on a page that has left the screen), so repeating "Jun" 31
 * times bought nothing and cost 34px in the narrowest column on the sheet —
 * enough that the day columns were being clipped. The prose notes below the
 * table keep the month, because a sentence is read on its own.
 */
function dayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export default async function MonthlyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; circuitId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  if (!perms.includes("manage_survey") && !perms.includes("manage_pipeline")) redirect("/admin");

  const { id, circuitId } = await params;
  const { month: monthParam } = await searchParams;
  const report = await loadCircuitReport(circuitId);
  if (!report || report.society.id !== id) notFound();
  const { circuit, society, effBaselineNow } = report;
  const circuitHref = `/admin/societies/${id}/circuits/${circuitId}`;

  const months = monthsWithData(report);
  // A circuit with no monitoring month yet is not a missing page — it is a
  // page with nothing to report. notFound() here was a dead end of exactly
  // the kind this codebase has already fixed twice: the reader is told the
  // URL is wrong when the truth is that billing has not started.
  if (months.length === 0) {
    return (
      <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
        <div className="no-print mb-5">
          <BackButton fallbackHref={circuitHref} />
        </div>
        <article className="report-sheet">
          <header className="report-masthead">
            <div className="min-w-0 flex-1">
              <p className="lbl" style={{ color: "var(--accent)" }}>
                FirsThing · Monthly savings report
              </p>
              <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
                {society.name}
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                {society.location}
                <br />
                {circuit.location || circuit.lightType} circuit
              </p>
            </div>
          </header>
          <div className="px-8 py-7">
            <p className="text-sm">
              No monitoring month has been recorded for this circuit yet. Monthly readings start
              after the installation is signed off — billing begins the day after the completion
              certificate (CON-22), so there is nothing to report against until then.
            </p>
            <p className="mt-4 text-sm no-print">
              <Link href={circuitHref} className="underline">
                Open the circuit&apos;s setup &amp; history →
              </Link>
            </p>
          </div>
        </article>
      </div>
    );
  }
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) && months.includes(monthParam)
      ? monthParam
      : months[months.length - 1];

  const days = monthDays(report, month);
  const summary = summarize(effBaselineNow, days);
  const excludedCount = days.filter((d) => d.excluded).length;
  const countedCount = days.length - excludedCount;
  const excludedDays = days.filter((d) => d.excluded);
  // Only the bands this month actually produced. A fixed six-entry legend
  // under a table showing two of them is a reference card, not a key.
  const bandsPresent = BAND_ORDER.filter((b) =>
    days.some((d) => !d.excluded && d.savingsBand === b),
  );
  // Days read DOWN each column, then across. One 31-row column is what put
  // the printed report onto a second sheet; three 11-row columns fit A4 with
  // room to spare. Short months keep one column — two five-row slivers are
  // not a layout, they are a table cut in half.
  const dailyCols = days.length > 20 ? 3 : days.length > 10 ? 2 : 1;
  const perCol = Math.ceil(days.length / dailyCols);
  const dayColumns: ReportDay[][] = [];
  for (let i = 0; i < days.length; i += perCol) dayColumns.push(days.slice(i, i + perCol));
  const asMonth = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const monthLabel = asMonth(month);
  const shortMonth = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  // Two Februaries in one picker have to be told apart, so the year appears
  // only when the months actually span more than one.
  const multiYear = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
      {/* One toolbar. Back, the month, and the one action — a printed page
          never carries any of it (.no-print). */}
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref={circuitHref} />
        <div className="flex-1" />
        {months.length > 1 && (
          <>
            <span className="lbl" style={{ display: "inline" }}>
              Month
            </span>
            <nav className="seg" aria-label="Report month">
              {months.map((m) => (
                <Link
                  key={m}
                  href={`?month=${m}`}
                  className={m === month ? "on" : undefined}
                  aria-current={m === month ? "page" : undefined}
                >
                  {multiYear ? `${shortMonth(m)} ${m.slice(2, 4)}` : shortMonth(m)}
                </Link>
              ))}
            </nav>
          </>
        )}
        <PrintButton />
      </div>

      {/* The report is a sheet: it is a document, and it prints. */}
      <article className="report-sheet">
        <header className="report-masthead">
          <div className="min-w-0 flex-1">
            <p className="lbl" style={{ color: "var(--accent)" }}>
              FirsThing · Monthly savings report
            </p>
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
              {society.name}
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
              {society.location}
              <br />
              {circuit.location || circuit.lightType} circuit ·{" "}
              {circuit.meteredLightCount.toLocaleString("en-IN")} metered lights of{" "}
              {circuit.representedLightCount.toLocaleString("en-IN")} represented
            </p>
          </div>
          <div className="report-period">
            <p className="text-[20px] font-bold tracking-[-0.01em]">{monthLabel}</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Generated <span className="num">{generated}</span>
            </p>
          </div>
        </header>

        {/* The answer, first. It was the last paragraph on the page, at body
            size, after every row of the evidence it summarises. */}
        <section className="report-result">
          <div className="shrink-0">
            <p className="lbl" style={{ color: "var(--info-fg)" }}>
              Verified savings
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
              <span className="num text-[46px] font-bold leading-none tracking-[-0.02em]">
                {summary.savingsPct === null ? "—" : pct(summary.savingsPct)}
              </span>
              {summary.band && (
                <StatusChip tone={BAND_TONE[summary.band]}>
                  {SAVINGS_BAND_META[summary.band].label}
                </StatusChip>
              )}
            </p>
          </div>
          <p className="min-w-0 flex-1 basis-64 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            {monthLabel} averaged{" "}
            <strong className="num text-[var(--text)]">
              {summary.averageKwh?.toFixed(2) ?? "—"}
            </strong>{" "}
            kWh/day against the{" "}
            <strong className="num text-[var(--text)]">{effBaselineNow?.toFixed(2) ?? "—"}</strong>{" "}
            kWh/day pre-installation baseline, over{" "}
            <strong className="text-[var(--text)]">
              {countedCount} counted day{countedCount === 1 ? "" : "s"}
            </strong>
            {circuit.benchmarkSavingsPct !== null && (
              <>
                {" "}
                — against a contracted benchmark of{" "}
                <strong className="num text-[var(--text)]">
                  {pct(circuit.benchmarkSavingsPct)}
                </strong>
              </>
            )}
            .
            {summary.warn &&
              summary.savingsPct !== null &&
              summary.savingsPct < SAVINGS_WARN_BELOW && (
                <>
                  {" "}
                  <strong className="text-[var(--text)]">
                    This month is below the {SAVINGS_WARN_BELOW}% the commercial model is built on.
                  </strong>
                </>
              )}
          </p>
        </section>

        {/* The facts that were run together in one sentence under the title. */}
        <section className="report-facts">
          <div>
            <p className="lbl">Baseline in force</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">
                {effBaselineNow?.toFixed(2) ?? "—"}
              </span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
            </p>
          </div>
          <div>
            <p className="lbl">Contracted benchmark</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">
                {circuit.benchmarkSavingsPct === null ? "—" : pct(circuit.benchmarkSavingsPct)}
              </span>
            </p>
          </div>
          <div>
            <p className="lbl">Days counted</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{countedCount}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">of {days.length} recorded</span>
            </p>
          </div>
          <div>
            <p className="lbl">Excluded</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{excludedCount}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">
                {excludedCount === 1 ? "day" : "days"}
              </span>
            </p>
          </div>
        </section>

        <section className="px-8 pb-8 pt-7">
          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Daily consumption &amp; savings</h2>
            <p className="text-xs text-[var(--text-subtle)]">
              Excluded days are shown, never hidden
            </p>
          </div>

          <div className="report-daily" style={{ "--daily-cols": dailyCols } as CSSProperties}>
            {dayColumns.map((col, i) => (
              <div key={i} className="report-daily-col print-table-scroll">
                <table className="tbl w-full">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">kWh</th>
                      <th className="text-right">Savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {col.map((d) => (
                      <tr key={d.date} className={d.excluded ? "report-row-excluded" : undefined}>
                        {/* The date stays legible. The strike-through belongs
                            on the figures that do not count, not on the label
                            that says which day they were. */}
                        <td className="num whitespace-nowrap">{dayShort(d.date)}</td>
                        <td className="num text-right">
                          <span className={d.excluded ? "line-through" : undefined}>
                            {d.kWh.toFixed(2)}
                          </span>
                        </td>
                        <td className="text-right">
                          {d.savingsPct === null ? (
                            <span className="num">—</span>
                          ) : d.excluded ? (
                            <span className="num line-through">{pct(d.savingsPct)}</span>
                          ) : (
                            <span
                              className={`num report-band${d.savingsBand ? ` report-band-${d.savingsBand}` : ""}`}
                              style={{
                                background: d.savingsBand
                                  ? SAVINGS_BAND_META[d.savingsBand].bg
                                  : undefined,
                              }}
                              // The rounding is presentation; the exact figure
                              // stays one hover away.
                              title={`${d.savingsBand ? SAVINGS_BAND_META[d.savingsBand].label : "Savings"} — ${d.savingsPct.toFixed(2)}%`}
                            >
                              {pct(d.savingsPct)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* The month, footed up. With the days in columns there is no one
              tfoot to carry it, and a per-column subtotal would be arithmetic
              nobody asked for. */}
          <div className="report-total">
            <span>
              {countedCount} day{countedCount === 1 ? "" : "s"} counted
            </span>
            <span className="ml-auto flex items-baseline gap-2">
              <span className="text-[var(--text-subtle)]">Average</span>
              <span className="num text-[15px] font-bold">
                {summary.averageKwh?.toFixed(2) ?? "—"}
              </span>
              <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[var(--text-subtle)]">Savings</span>
              <span
                className={`num report-band text-[15px]${summary.band ? ` report-band-${summary.band}` : ""}`}
                style={{ background: summary.band ? SAVINGS_BAND_META[summary.band].bg : undefined }}
              >
                {summary.savingsPct === null ? "—" : pct(summary.savingsPct)}
              </span>
            </span>
          </div>

          {/* The assessment used to be a word repeated on every row — 31 times
              for one month, in the widest column of the table, which is what
              made the printed report run to a second sheet. It is a legend
              now. The colour is deliberately NOT the carrier: each entry
              states the RANGE, so any row decodes from the printed figure
              alone — which is what has to be true on a mono printer, in
              greyscale, and for a reader who cannot separate the tints. */}
          {(bandsPresent.length > 0 || excludedCount > 0) && (
            <dl className="report-legend">
              {bandsPresent.map((b) => (
                <div key={b}>
                  <dt
                    className={`report-band report-band-${b}`}
                    style={{ background: SAVINGS_BAND_META[b].bg }}
                    aria-hidden
                  />
                  <dd>
                    {BAND_KEY[b]}
                    <span className="num"> {BAND_RANGE[b]}</span>
                  </dd>
                </div>
              ))}
              {excludedCount > 0 && (
                <div>
                  <dt className="report-band report-band-excluded" aria-hidden />
                  <dd>Excluded — not counted</dd>
                </div>
              )}
            </dl>
          )}

          {/* Excluded days are shown, never hidden — but their reasons are
              exceptions, and exceptions belong in a note rather than in a
              column every ordinary row has to make room for. */}
          {excludedDays.length > 0 && (
            <ul className="report-exclusions">
              {excludedDays.map((d) => (
                <li key={d.date}>
                  <span className="num">{dayLabel(d.date)}</span> — {d.excludedReason}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs leading-relaxed text-[var(--text-subtle)]">
            Billing figures — extrapolation across the represented lights, ₹ values, the invoice —
            come from the released monthly calculation, which consumes exactly these readings. This
            report states the measured circuit, and the two can never disagree because both read one
            store.
          </p>
        </section>

        <footer className="report-footer">
          <span>
            FirsThing · every figure traces to stored daily readings and the baseline in force on
            each day (INV-02, INV-07).
          </span>
          {/* Only on paper: a printed page has left the screen that knew
              which circuit it was. */}
          <span className="num report-colophon">
            {society.name} · {circuit.location || circuit.lightType} · {month}
          </span>
        </footer>
      </article>
    </div>
  );
}
