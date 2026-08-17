import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { SAVINGS_BAND_META, SAVINGS_WARN_BELOW } from "@/lib/circuit-load";
import { BENCHMARK_MIN_PCT, BENCHMARK_MAX_PCT } from "@/lib/commissioning-anomaly";
import { loadCircuitReport, summarize } from "../report-data";
import { PrintButton } from "../report-shared";

// CON-45 — the post-installation consumption + savings report: the baseline
// recap, what was installed against each inventory line, every post-install
// day's savings against the baseline, and the benchmark outcome.
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

  const summary = summarize(effBaselineNow, postDays);
  const excludedPre = preDays.length - preIncludedCount;
  const excludedPost = postDays.filter((d) => d.excluded).length;

  return (
    <main className="print-doc mx-auto max-w-[820px] p-10 space-y-8">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={`/admin/societies/${id}/circuits/${circuitId}`} className="underline text-sm">
          ← Back to the circuit
        </Link>
        <PrintButton />
      </div>

      <header>
        <p className="text-sm font-semibold tracking-wide uppercase">FirsThing · Post-installation savings report</p>
        <h1 className="text-2xl font-semibold mt-1">{society.name}</h1>
        <p className="text-sm mt-1">
          {society.location} · {circuit.location || circuit.lightType} circuit ·{" "}
          {circuit.meteredLightCount} metered lights of {circuit.representedLightCount} represented
        </p>
        <p className="text-sm">
          Meter installed {circuit.meterInstalledAt?.toISOString().slice(0, 10)} · lights replaced{" "}
          {circuit.lightReplacementDate.toISOString().slice(0, 10)} · report generated{" "}
          {new Date().toISOString().slice(0, 10)}
        </p>
      </header>

      <section>
        <h2 className="text-base font-semibold mb-2">1. The baseline this is measured against</h2>
        <p className="text-sm">
          Before installation, {preIncludedCount} day{preIncludedCount === 1 ? "" : "s"} of metered
          consumption
          {excludedPre > 0 && ` (${excludedPre} excluded with reasons on the pre-installation report)`}{" "}
          averaged <strong className="num">{preAverage?.toFixed(2) ?? "—"}</strong> kWh/day.
          {effBaselineNow !== null && preAverage !== null && Math.abs(effBaselineNow - preAverage) > 1e-9 && (
            <>
              {" "}
              After recorded light-count changes, the baseline in force is{" "}
              <strong className="num">{effBaselineNow.toFixed(2)}</strong> kWh/day (INV-07 — each day
              below is judged against the baseline in force on that day).
            </>
          )}
        </p>
      </section>

      {inventory.some((l) => l.replacementName) && (
        <section>
          <h2 className="text-base font-semibold mb-2">2. What was installed</h2>
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
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold mb-2">3. Post-installation consumption &amp; savings, day by day</h2>
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
            {postDays.map((d) => (
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
        </table>
        {excludedPost > 0 && (
          <p className="text-xs mt-2 text-[var(--text-muted)]">
            {excludedPost} excluded day{excludedPost === 1 ? "" : "s"} shown struck through — listed,
            never counted.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">4. Result</h2>
        <p className="text-sm">
          The counted post-installation days average{" "}
          <strong className="num">{summary.averageKwh?.toFixed(2) ?? "—"}</strong> kWh/day against the{" "}
          <strong className="num">{effBaselineNow?.toFixed(2) ?? "—"}</strong> kWh/day baseline —{" "}
          <strong className="num">
            {summary.savingsPct === null ? "—" : `${summary.savingsPct.toFixed(1)}%`}
          </strong>{" "}
          measured savings.
        </p>
        <p className="text-sm mt-2">
          {summary.savingsPct === null
            ? "No savings figure can be computed yet."
            : circuit.benchmarkSavingsPct !== null
              ? `This is inside the ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band a valid benchmark must land in (CON-20). The confirmed benchmark of ${circuit.benchmarkSavingsPct.toFixed(1)}% is fixed for the contract term.`
              : summary.savingsPct >= BENCHMARK_MIN_PCT && summary.savingsPct <= BENCHMARK_MAX_PCT
                ? `This is inside the ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band a valid benchmark must land in (CON-20).`
                : `This is outside the ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band a valid benchmark must land in (CON-20) — the result has been routed to review rather than confirmed, and no benchmark is written until that review resolves.`}
          {summary.warn &&
            summary.savingsPct !== null &&
            summary.savingsPct < SAVINGS_WARN_BELOW &&
            " Savings below 60% are below the level the commercial model is built on."}
        </p>
      </section>

      <footer className="text-xs pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        FirsThing · every figure traces to stored daily readings, the recorded inventory, and the
        baseline in force on each day (INV-02, INV-07). Excluded days are shown, not hidden.
      </footer>
    </main>
  );
}
