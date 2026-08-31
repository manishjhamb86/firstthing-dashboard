import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { SAVINGS_BAND_META, SAVINGS_WARN_BELOW } from "@/lib/circuit-load";
import { BENCHMARK_MIN_PCT, BENCHMARK_MAX_PCT } from "@/lib/commissioning-anomaly";
import { loadCircuitReport, summarize } from "../report-data";
import { PrintButton } from "../report-shared";
import { BackButton } from "@/components/back-button";
import { StatusChip } from "@/components/ui";
import { BAND_TONE, DaysGrid, ExclusionNotes, ReportLegend, pct } from "../report-format";

export const dynamic = "force-dynamic";

// CON-45 — the post-installation consumption + savings report: the baseline
// recap, what was installed against each inventory line, every post-install
// day's savings against the baseline, and the benchmark outcome. Formatted
// on the shared report system (2026-08-31).
export default async function PostInstallReportPage({
  params,
}: {
  params: Promise<{ id: string; circuitId: string }>;
}) {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  if (!perms.includes("manage_survey") && !perms.includes("manage_pipeline")) redirect("/admin");

  const { id, circuitId } = await params;
  const report = await loadCircuitReport(circuitId);
  if (!report || report.society.id !== id) notFound();
  const { circuit, society, preDays, postDays, preAverage, preIncludedCount, effBaselineNow, inventory } = report;
  if (!circuit.lightReplacementDate) notFound(); // no post phase yet — the report doesn't exist
  const circuitHref = `/admin/societies/${id}/circuits/${circuitId}`;

  const summary = summarize(effBaselineNow, postDays);
  const excludedPre = preDays.length - preIncludedCount;
  const excludedPost = postDays.filter((d) => d.excluded).length;
  const countedPost = postDays.length - excludedPost;
  const replaced = inventory.filter((l) => l.replacementName);
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const verdict =
    summary.savingsPct === null
      ? "No savings figure can be computed yet."
      : circuit.benchmarkSavingsPct !== null
        ? `Inside the ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band a valid benchmark must land in (CON-20). The confirmed benchmark of ${circuit.benchmarkSavingsPct.toFixed(1)}% is fixed for the contract term.`
        : summary.savingsPct >= BENCHMARK_MIN_PCT && summary.savingsPct <= BENCHMARK_MAX_PCT
          ? `Inside the ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band a valid benchmark must land in (CON-20).`
          : `Outside the ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band a valid benchmark must land in (CON-20) — routed to review rather than confirmed; no benchmark is written until that review resolves.`;

  return (
    <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref={circuitHref} />
        <div className="flex-1" />
        <PrintButton />
      </div>

      <article className="report-sheet">
        <header className="report-masthead">
          <div className="min-w-0 flex-1">
            <p className="lbl" style={{ color: "var(--accent)" }}>
              FirsThing · Post-installation savings report
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
            <p className="text-[20px] font-bold tracking-[-0.01em]">After installation</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Lights replaced{" "}
              <span className="num">{circuit.lightReplacementDate.toISOString().slice(0, 10)}</span>
              <br />
              Generated <span className="num">{generated}</span>
            </p>
          </div>
        </header>

        <section className="report-result">
          <div className="shrink-0">
            <p className="lbl" style={{ color: "var(--info-fg)" }}>
              Measured savings
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
              <span
                className="num text-[46px] font-bold leading-none tracking-[-0.02em]"
                title={summary.savingsPct !== null ? `${summary.savingsPct.toFixed(2)}%` : undefined}
              >
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
            {countedPost} counted day{countedPost === 1 ? "" : "s"} averaged{" "}
            <strong className="num text-[var(--text)]">{summary.averageKwh?.toFixed(2) ?? "—"}</strong>{" "}
            kWh/day against the{" "}
            <strong className="num text-[var(--text)]">{effBaselineNow?.toFixed(2) ?? "—"}</strong>{" "}
            kWh/day baseline. {verdict}
            {summary.warn &&
              summary.savingsPct !== null &&
              summary.savingsPct < SAVINGS_WARN_BELOW && (
                <strong className="text-[var(--text)]">
                  {" "}
                  Savings below {SAVINGS_WARN_BELOW}% are below the level the commercial model is
                  built on.
                </strong>
              )}
          </p>
        </section>

        <section className="report-facts">
          <div>
            <p className="lbl">Baseline in force</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{effBaselineNow?.toFixed(2) ?? "—"}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
            </p>
          </div>
          <div>
            <p className="lbl">After, average</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{summary.averageKwh?.toFixed(2) ?? "—"}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
            </p>
          </div>
          <div>
            <p className="lbl">Days counted</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{countedPost}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">of {postDays.length} recorded</span>
            </p>
          </div>
          <div>
            <p className="lbl">Excluded</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{excludedPost}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">{excludedPost === 1 ? "day" : "days"}</span>
            </p>
          </div>
        </section>

        <section className="px-8 pb-8 pt-7">
          <p className="mb-6 text-[13px] leading-relaxed text-[var(--text-muted)]">
            The baseline: {preIncludedCount} pre-installation day{preIncludedCount === 1 ? "" : "s"}
            {excludedPre > 0 && ` (${excludedPre} excluded, with reasons on the pre-installation report)`}{" "}
            averaged <strong className="num text-[var(--text)]">{preAverage?.toFixed(2) ?? "—"}</strong>{" "}
            kWh/day.
            {effBaselineNow !== null && preAverage !== null && Math.abs(effBaselineNow - preAverage) > 1e-9 && (
              <>
                {" "}
                After recorded light-count changes, the baseline in force is{" "}
                <strong className="num text-[var(--text)]">{effBaselineNow.toFixed(2)}</strong> kWh/day —
                each day below is judged against the baseline in force on that day (INV-07).
              </>
            )}
          </p>

          {replaced.length > 0 && (
            <>
              <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-semibold">What was installed</h2>
              </div>
              <div className="print-table-scroll mb-7 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)]">
                <table className="tbl w-full">
                  <thead>
                    <tr>
                      <th>Was</th>
                      <th>Installed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.count} × {l.name} ({l.wattage}W, {l.hoursPerDay} h/day)
                        </td>
                        <td>
                          {l.replacementName
                            ? `${l.replacementCount ?? l.count} × ${l.replacementName}${l.replacementWattage ? ` (${l.replacementWattage}W)` : ""}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Consumption &amp; savings, day by day</h2>
            <p className="text-xs text-[var(--text-subtle)]">Excluded days are shown, never hidden</p>
          </div>
          <DaysGrid days={postDays} mode="savings" />
          <ReportLegend days={postDays} mode="savings" />
          <ExclusionNotes days={postDays} />
        </section>

        <footer className="report-footer">
          <span>
            FirsThing · every figure traces to stored daily readings, the recorded inventory, and
            the baseline in force on each day (INV-02, INV-07).
          </span>
          <span className="num report-colophon">
            {society.name} · {circuit.location || circuit.lightType} · post-installation
          </span>
        </footer>
      </article>
    </div>
  );
}
