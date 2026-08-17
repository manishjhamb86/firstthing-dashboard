import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { SAVINGS_BAND_META, SAVINGS_WARN_BELOW } from "@/lib/circuit-load";
import { loadCircuitReport, monthDays, monthsWithData, summarize } from "../report-data";
import { PrintButton } from "../report-shared";

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

  const months = monthsWithData(report);
  if (months.length === 0) notFound();
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && months.includes(monthParam)
    ? monthParam
    : months[months.length - 1];

  const days = monthDays(report, month);
  const summary = summarize(effBaselineNow, days);
  const excludedCount = days.filter((d) => d.excluded).length;
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="print-doc mx-auto max-w-[820px] p-10 space-y-8">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={`/admin/societies/${id}/circuits/${circuitId}`} className="underline text-sm">
          ← Back to the circuit
        </Link>
        <PrintButton />
        {months.length > 1 && (
          <span className="text-sm text-[var(--text-muted)]">
            Month:{" "}
            {months.map((m) => (
              <Link
                key={m}
                href={`?month=${m}`}
                className={m === month ? "font-semibold underline mr-2" : "underline mr-2"}
              >
                {m}
              </Link>
            ))}
          </span>
        )}
      </div>

      <header>
        <p className="text-sm font-semibold tracking-wide uppercase">
          FirsThing · Monthly savings report — {monthLabel}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{society.name}</h1>
        <p className="text-sm mt-1">
          {society.location} · {circuit.location || circuit.lightType} circuit ·{" "}
          {circuit.meteredLightCount} metered lights of {circuit.representedLightCount} represented
        </p>
        <p className="text-sm">
          Baseline in force: <strong className="num">{effBaselineNow?.toFixed(2) ?? "—"}</strong>{" "}
          kWh/day
          {circuit.benchmarkSavingsPct !== null && (
            <>
              {" "}
              · contracted benchmark <strong className="num">{circuit.benchmarkSavingsPct.toFixed(1)}%</strong>
            </>
          )}{" "}
          · generated {new Date().toISOString().slice(0, 10)}
        </p>
      </header>

      <section>
        <h2 className="text-base font-semibold mb-2">Daily consumption &amp; savings</h2>
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Date</th>
              <th>kWh</th>
              <th>Savings</th>
              <th>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.date}
                style={
                  d.excluded
                    ? { opacity: 0.55 }
                    : d.savingsBand
                      ? { backgroundColor: SAVINGS_BAND_META[d.savingsBand].bg }
                      : undefined
                }
              >
                <td className="num" style={d.excluded ? { textDecoration: "line-through" } : undefined}>
                  {d.date}
                </td>
                <td className="num" style={d.excluded ? { textDecoration: "line-through" } : undefined}>
                  {d.kWh.toFixed(2)}
                </td>
                <td className="num">{d.savingsPct === null ? "—" : `${d.savingsPct.toFixed(1)}%`}</td>
                <td className="text-sm">
                  {d.excluded
                    ? `Excluded — ${d.excludedReason}`
                    : d.savingsBand
                      ? SAVINGS_BAND_META[d.savingsBand].label
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-medium">
                {days.length - excludedCount} day{days.length - excludedCount === 1 ? "" : "s"} counted
              </td>
              <td className="num font-semibold">{summary.averageKwh?.toFixed(2) ?? "—"} avg</td>
              <td className="num font-semibold">
                {summary.savingsPct === null ? "—" : `${summary.savingsPct.toFixed(1)}%`}
              </td>
              <td className="text-sm">
                {summary.band ? SAVINGS_BAND_META[summary.band].label : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">Result</h2>
        <p className="text-sm">
          {monthLabel} averaged{" "}
          <strong className="num">{summary.averageKwh?.toFixed(2) ?? "—"}</strong> kWh/day against
          the <strong className="num">{effBaselineNow?.toFixed(2) ?? "—"}</strong> kWh/day
          pre-installation baseline —{" "}
          <strong className="num">
            {summary.savingsPct === null ? "—" : `${summary.savingsPct.toFixed(1)}%`}
          </strong>{" "}
          verified savings on this circuit.
          {summary.warn && summary.savingsPct !== null && summary.savingsPct < SAVINGS_WARN_BELOW && (
            <strong> This month is below the 60% the commercial model is built on.</strong>
          )}
        </p>
        <p className="text-xs mt-2 text-[var(--text-muted)]">
          Billing figures (extrapolation across the represented lights, ₹ values, the invoice) come
          from the released monthly calculation, which consumes exactly these readings — this report
          states the measured circuit, and the two can never disagree because both read one store.
        </p>
      </section>

      <footer className="text-xs pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        FirsThing · every figure traces to stored daily readings and the baseline in force on each
        day (INV-02, INV-07). Excluded days are shown, not hidden.
      </footer>
    </main>
  );
}
