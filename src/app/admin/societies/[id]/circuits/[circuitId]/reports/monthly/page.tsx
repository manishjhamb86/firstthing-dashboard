import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { SAVINGS_BAND_META, SAVINGS_WARN_BELOW } from "@/lib/circuit-load";
import { loadCircuitReport, monthDays, monthsWithData, summarize } from "../report-data";
import { PrintButton } from "../report-shared";
import { BackButton } from "@/components/back-button";
import { StatusChip } from "@/components/ui";
import { BAND_TONE, DaysGrid, ExclusionNotes, ReportLegend, pct } from "../report-format";

// CON-45 — the monthly savings report for one explicitly-selected month
// (INV-04: the month is a selection, never inferred). Circuit-scoped and
// kWh-only by design: the rupee figures a society is billed on come from
// the released monthly calculation (MS-08), which this report deliberately
// does not duplicate — two sources for one money figure is how they end up
// disagreeing.

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

          <DaysGrid days={days} mode="savings" />

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

          <ReportLegend days={days} mode="savings" />

          <ExclusionNotes days={days} />

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
