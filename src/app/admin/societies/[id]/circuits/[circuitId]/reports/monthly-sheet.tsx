import { Letterhead } from "@/components/letterhead";
import { monthLabel, shortDate } from "@/lib/format-date";
import { SAVINGS_BAND_META, SAVINGS_WARN_BELOW } from "@/lib/circuit-load";
import { StatusChip } from "@/components/ui";
import { BAND_TONE, DaysGrid, ExclusionNotes, ReportLegend, pct } from "./report-format";
import type { SavingsReportSnapshot } from "./report-data";

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The monthly savings report sheet, rendered from a snapshot. One renderer,
 * two sources: the operator's page builds the snapshot live; the society's
 * portal renders the copy frozen when it was published — so what the society
 * downloads is exactly what was published, never a figure that moved
 * afterwards (ADR-005).
 */
export function MonthlySavingsSheet({ s }: { s: SavingsReportSnapshot }) {
  const excludedCount = s.days.filter((d) => d.excluded).length;
  const countedCount = s.days.length - excludedCount;
  const monthTitle = monthLabel(s.month);
  const generated = shortDate(new Date(s.generatedAt));
  // The report is a sheet: it is a document, and it prints.
  return (
  <Letterhead>
  <article className="report-sheet">
    <header className="report-masthead">
      <div className="min-w-0 flex-1">
        <p className="lbl" style={{ color: "var(--accent)" }}>
          FirsThing · Monthly savings report
        </p>
        <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
          {s.societyName}
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
          {s.societyLocation}
          <br />
          {s.circuitLabel} circuit ·{" "}
          {s.meteredLightCount.toLocaleString("en-IN")} metered lights of{" "}
          {s.representedLightCount.toLocaleString("en-IN")} represented
        </p>
      </div>
      <div className="report-period">
        <p className="text-[20px] font-bold tracking-[-0.01em]">{monthTitle}</p>
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
            {s.summary.savingsPct === null ? "—" : pct(s.summary.savingsPct)}
          </span>
          {s.summary.band && (
            <StatusChip tone={BAND_TONE[s.summary.band]}>
              {SAVINGS_BAND_META[s.summary.band].label}
            </StatusChip>
          )}
        </p>
      </div>
      {/* Read ONLY from a released calculation's own fee line (INV-02) —
          this report never computes a rupee figure of its own (user-
          asked 2026-09-24, "how amount is saved"). Absent one, states
          what will produce it rather than a blank or an invented rate. */}
      <div className="shrink-0">
        <p className="lbl" style={{ color: "var(--info-fg)" }}>
          Saved this month
        </p>
        {s.fee ? (
          <p className="mt-1.5 num text-[46px] font-bold leading-none tracking-[-0.02em]">
            {inr(s.fee.savedValue)}
          </p>
        ) : (
          <p className="mt-1.5 max-w-[220px] text-[12.5px] leading-relaxed text-[var(--text-subtle)]">
            Not billed yet — added once this month&rsquo;s bill is released.
          </p>
        )}
      </div>
      <p className="min-w-0 flex-1 basis-64 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
        {monthTitle} averaged{" "}
        <strong className="num text-[var(--text)]">
          {s.summary.averageKwh?.toFixed(2) ?? "—"}
        </strong>{" "}
        kWh/day against the{" "}
        <strong className="num text-[var(--text)]">{s.baselineKwhPerDay?.toFixed(2) ?? "—"}</strong>{" "}
        kWh/day pre-installation baseline, over{" "}
        <strong className="text-[var(--text)]">
          {countedCount} counted day{countedCount === 1 ? "" : "s"}
        </strong>
        {s.benchmarkSavingsPct !== null && (
          <>
            {" "}
            — against a contracted benchmark of{" "}
            <strong className="num text-[var(--text)]">
              {pct(s.benchmarkSavingsPct)}
            </strong>
          </>
        )}
        .{" "}
        {s.fee && (
          <>
            Of that, <strong className="num text-[var(--text)]">{inr(s.fee.amount)}</strong> is
            FirsThing&rsquo;s fee and <strong className="num text-[var(--text)]">{inr(s.fee.societyNet)}</strong>{" "}
            is kept by the society.
          </>
        )}
        {s.summary.warn &&
          s.summary.savingsPct !== null &&
          s.summary.savingsPct < SAVINGS_WARN_BELOW && (
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
            {s.baselineKwhPerDay?.toFixed(2) ?? "—"}
          </span>{" "}
          <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
        </p>
      </div>
      <div>
        <p className="lbl">Contracted benchmark</p>
        <p className="mt-1.5">
          <span className="num text-[17px] font-bold">
            {s.benchmarkSavingsPct === null ? "—" : pct(s.benchmarkSavingsPct)}
          </span>
        </p>
      </div>
      <div>
        <p className="lbl">Days counted</p>
        <p className="mt-1.5">
          <span className="num text-[17px] font-bold">{countedCount}</span>{" "}
          <span className="text-xs text-[var(--text-subtle)]">of {s.days.length} recorded</span>
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

      <DaysGrid days={s.days} mode="savings" />

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
            {s.summary.averageKwh?.toFixed(2) ?? "—"}
          </span>
          <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-[var(--text-subtle)]">Savings</span>
          <span
            className={`num report-band text-[15px]${s.summary.band ? ` report-band-${s.summary.band}` : ""}`}
            style={{ background: s.summary.band ? SAVINGS_BAND_META[s.summary.band].bg : undefined }}
          >
            {s.summary.savingsPct === null ? "—" : pct(s.summary.savingsPct)}
          </span>
        </span>
      </div>

      <ReportLegend days={s.days} mode="savings" />

      <ExclusionNotes days={s.days} />

      {/* How the figure is sourced — for the reader on screen; the paper copy keeps to the figures. */}
      <p className="no-print mt-4 text-xs leading-relaxed text-[var(--text-subtle)]">
        The rupee figure above is read from the released monthly calculation, never computed on
        this page — extrapolation across the represented lights, the invoice, every other billing
        figure lives there too. This report states the measured circuit, and the two can never
        disagree because both read one store.
      </p>
    </section>

    <footer className="report-footer">
      <span>
        FirsThing · every figure traces to stored daily readings and the baseline in force on
        each day.
      </span>
      {/* Only on paper: a printed page has left the screen that knew
          which circuit it was. */}
      <span className="num report-colophon">
        {s.societyName} · {s.circuitLabel} · {s.month}
      </span>
    </footer>
  </article>
  </Letterhead>
  );
}
