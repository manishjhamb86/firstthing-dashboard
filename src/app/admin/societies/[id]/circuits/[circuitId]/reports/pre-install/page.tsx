import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { VARIANCE_BAND_META, PRE_WARN_PCT } from "@/lib/circuit-load";
import { loadCircuitReport } from "../report-data";
import { InvestigateButton, PrintButton } from "../report-shared";

// CON-45 — the pre-installation consumption report: the devices on the
// circuit, the theoretical figure they add to, every recorded day against
// it, and the finding. Renders straight from the store, so the paper and
// the database cannot disagree.
export default async function PreInstallReportPage({
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
  const { circuit, society, theoretical, preDays, preAverage, preIncludedCount, avgVariance, inventory } = report;

  const excludedCount = preDays.length - preIncludedCount;
  const warn = avgVariance !== null && avgVariance.band === "warn";

  return (
    <main className="print-doc mx-auto max-w-[820px] p-10 space-y-8">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={`/admin/societies/${id}/circuits/${circuitId}`} className="underline text-sm">
          ← Back to the circuit
        </Link>
        <PrintButton />
      </div>

      <header>
        <p className="text-sm font-semibold tracking-wide uppercase">FirsThing · Pre-installation consumption report</p>
        <h1 className="text-2xl font-semibold mt-1">{society.name}</h1>
        <p className="text-sm mt-1">
          {society.location} · {circuit.location || circuit.lightType} circuit ·{" "}
          {circuit.meteredLightCount} metered lights of {circuit.representedLightCount} represented
        </p>
        <p className="text-sm">
          Meter installed {circuit.meterInstalledAt?.toISOString().slice(0, 10)} · report generated{" "}
          {new Date().toISOString().slice(0, 10)}
        </p>
      </header>

      {warn && avgVariance?.pct != null && (
        <section
          className="rounded-[var(--r-md)] border p-4 text-sm space-y-2"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          <p className="font-medium">
            The average recorded day varies {avgVariance.pct > 0 ? "+" : ""}
            {avgVariance.pct.toFixed(1)}% from the theoretical figure — beyond the ±{PRE_WARN_PCT}%
            an unremarkable circuit stays inside.
          </p>
          <p>
            Something on this circuit may not be in the inventory — an unknown device consuming
            silently, or a miscounted line. You can proceed with this report (the numbers are what
            they are), or put it in front of an inspector first.
          </p>
          <InvestigateButton circuitId={circuit.id} variancePct={avgVariance.pct} />
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold mb-2">1. What is on this circuit</h2>
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Device</th>
              <th>Count</th>
              <th>W each</th>
              <th>Runs</th>
              <th>kWh/day</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td className="num">{l.count}</td>
                <td className="num">{l.wattage}</td>
                <td className="num">{l.hoursPerDay} h/day</td>
                <td className="num">{l.kWhPerDay.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="font-medium">
                Theoretical daily consumption (count × W × hours ÷ 1000)
              </td>
              <td className="num font-semibold">{theoretical?.toFixed(2) ?? "—"}</td>
            </tr>
          </tfoot>
        </table>
        {inventory.length === 0 && (
          <p className="text-sm mt-2" style={{ color: "var(--warn-fg)" }}>
            No load inventory is recorded — there is no theoretical figure to compare against, which
            is itself a gap this report cannot paper over.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">2. Recorded consumption, day by day</h2>
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Date</th>
              <th>kWh</th>
              <th>Hours reported</th>
              <th>vs theoretical</th>
              <th>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {preDays.map((d) => (
              <tr
                key={d.date}
                style={
                  d.excluded
                    ? { opacity: 0.55 }
                    : d.varianceBand && VARIANCE_BAND_META[d.varianceBand].bg !== "transparent"
                      ? { backgroundColor: VARIANCE_BAND_META[d.varianceBand].bg }
                      : undefined
                }
              >
                <td className="num" style={d.excluded ? { textDecoration: "line-through" } : undefined}>
                  {d.date}
                </td>
                <td className="num" style={d.excluded ? { textDecoration: "line-through" } : undefined}>
                  {d.kWh.toFixed(2)}
                </td>
                <td className="num">
                  {d.intervalCount ?? "—"}
                  {d.intervalCount != null && d.expectedIntervals != null && d.intervalCount < d.expectedIntervals
                    ? ` of ${d.expectedIntervals}`
                    : ""}
                </td>
                <td className="num">
                  {d.variancePct === null ? "—" : `${d.variancePct > 0 ? "+" : ""}${d.variancePct.toFixed(1)}%`}
                </td>
                <td className="text-sm">
                  {d.excluded
                    ? `Excluded — ${d.excludedReason}`
                    : d.varianceBand
                      ? VARIANCE_BAND_META[d.varianceBand].label
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">3. Finding</h2>
        <p className="text-sm">
          {preIncludedCount} day{preIncludedCount === 1 ? "" : "s"} counted
          {excludedCount > 0 && ` (${excludedCount} excluded, each with its reason above)`}, averaging{" "}
          <strong className="num">{preAverage?.toFixed(2) ?? "—"}</strong> kWh/day against a
          theoretical <strong className="num">{theoretical?.toFixed(2) ?? "—"}</strong> kWh/day
          {avgVariance?.pct != null && (
            <>
              {" — a variance of "}
              <strong className="num">
                {avgVariance.pct > 0 ? "+" : ""}
                {avgVariance.pct.toFixed(1)}%
              </strong>
            </>
          )}
          .
        </p>
        <p className="text-sm mt-2">
          {avgVariance === null
            ? "No comparison is possible without a load inventory."
            : avgVariance.band === "ok" || avgVariance.band === "flag"
              ? "The circuit behaves as its inventory predicts, within the ±10% an unremarkable circuit stays inside. No unknown load is indicated. This average is the baseline every post-installation savings figure will be measured against."
              : "The recorded consumption does not match what the inventory predicts. Either something is on this circuit that the survey did not capture, or a line item is wrong. Investigate before treating this average as the savings baseline — a wrong baseline misprices the whole term."}
        </p>
      </section>

      <footer className="text-xs pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        FirsThing · every figure in this report traces to stored daily readings and the recorded
        inventory (INV-02). Excluded days are shown, not hidden.
      </footer>
    </main>
  );
}
