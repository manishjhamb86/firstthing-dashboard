import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { PRE_WARN_PCT } from "@/lib/circuit-load";
import { loadCircuitReport } from "../report-data";
import { InvestigateButton, PrintButton } from "../report-shared";
import { BackButton } from "@/components/back-button";
import { StatusChip } from "@/components/ui";
import { DaysGrid, ExclusionNotes, ReportLegend, pct } from "../report-format";

export const dynamic = "force-dynamic";

// CON-45 — the pre-installation consumption report: the devices on the
// circuit, the theoretical figure they add to, every recorded day against
// it, and the finding. Renders straight from the store, so the paper and
// the database cannot disagree. Formatted on the shared report system
// (2026-08-31) — sheet, result first, columned days, a legend that states
// each band's numeric range.
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
  const circuitHref = `/admin/societies/${id}/circuits/${circuitId}`;

  const excludedCount = preDays.length - preIncludedCount;
  const warn = avgVariance !== null && avgVariance.band === "warn";
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

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
              FirsThing · Pre-installation consumption report
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
            <p className="text-[20px] font-bold tracking-[-0.01em]">Before installation</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Meter installed{" "}
              <span className="num">{circuit.meterInstalledAt?.toISOString().slice(0, 10) ?? "—"}</span>
              <br />
              Generated <span className="num">{generated}</span>
            </p>
          </div>
        </header>

        {/* The finding, first — it is what this report exists to state. */}
        <section className="report-result">
          <div className="shrink-0">
            <p className="lbl" style={{ color: "var(--info-fg)" }}>
              Recorded vs theoretical
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
              <span
                className="num text-[46px] font-bold leading-none tracking-[-0.02em]"
                title={avgVariance?.pct != null ? `${avgVariance.pct.toFixed(2)}%` : undefined}
              >
                {avgVariance?.pct == null ? "—" : `${avgVariance.pct > 0 ? "+" : ""}${pct(avgVariance.pct)}`}
              </span>
              {avgVariance &&
                (avgVariance.band === "warn" ? (
                  <StatusChip tone="warn">Investigate</StatusChip>
                ) : avgVariance.band === "flag" ? (
                  <StatusChip tone="warn">Worth a look</StatusChip>
                ) : (
                  <StatusChip tone="ok">As predicted</StatusChip>
                ))}
            </p>
          </div>
          <p className="min-w-0 flex-1 basis-64 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            {preIncludedCount} counted day{preIncludedCount === 1 ? "" : "s"} averaged{" "}
            <strong className="num text-[var(--text)]">{preAverage?.toFixed(2) ?? "—"}</strong> kWh/day
            against a theoretical{" "}
            <strong className="num text-[var(--text)]">{theoretical?.toFixed(2) ?? "—"}</strong> kWh/day
            (count × W × hours ÷ 1000).{" "}
            {avgVariance === null
              ? "No comparison is possible without a load inventory."
              : avgVariance.band === "warn"
                ? "The recorded consumption does not match what the inventory predicts — investigate before this average becomes the savings baseline."
                : "The circuit behaves as its inventory predicts. This average is the baseline every post-installation savings figure will be measured against."}
          </p>
        </section>

        <section className="report-facts">
          <div>
            <p className="lbl">Theoretical</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{theoretical?.toFixed(2) ?? "—"}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
            </p>
          </div>
          <div>
            <p className="lbl">Recorded average</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{preAverage?.toFixed(2) ?? "—"}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">kWh/day</span>
            </p>
          </div>
          <div>
            <p className="lbl">Days counted</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{preIncludedCount}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">of {preDays.length} recorded</span>
            </p>
          </div>
          <div>
            <p className="lbl">Excluded</p>
            <p className="mt-1.5">
              <span className="num text-[17px] font-bold">{excludedCount}</span>{" "}
              <span className="text-xs text-[var(--text-subtle)]">{excludedCount === 1 ? "day" : "days"}</span>
            </p>
          </div>
        </section>

        <section className="px-8 pb-8 pt-7">
          {warn && avgVariance?.pct != null && (
            <div
              className="mb-6 rounded-[var(--r-md)] border p-4 text-sm space-y-2"
              style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
            >
              <p className="font-medium">
                The average recorded day varies {avgVariance.pct > 0 ? "+" : ""}
                {avgVariance.pct.toFixed(1)}% from the theoretical figure — beyond the ±{PRE_WARN_PCT}%
                an unremarkable circuit stays inside.
              </p>
              <p>
                Something on this circuit may not be in the inventory — an unknown device consuming
                silently, or a miscounted line. You can proceed with this report (the numbers are
                what they are), or put it in front of an inspector first.
              </p>
              <InvestigateButton circuitId={circuit.id} variancePct={avgVariance.pct} />
            </div>
          )}

          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">What is on this circuit</h2>
            <p className="text-xs text-[var(--text-subtle)]">the survey&apos;s load inventory</p>
          </div>
          <div className="print-table-scroll mb-7 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)]">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Device</th>
                  <th className="text-right">Count</th>
                  <th className="text-right">W each</th>
                  <th className="text-right">Runs</th>
                  <th className="text-right">kWh/day</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td className="num text-right">{l.count}</td>
                    <td className="num text-right">{l.wattage}</td>
                    <td className="num text-right">{l.hoursPerDay} h</td>
                    <td className="num text-right">{l.kWhPerDay.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="text-[13px] font-medium">
                    Theoretical daily consumption
                  </td>
                  <td className="num text-right font-bold">{theoretical?.toFixed(2) ?? "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {inventory.length === 0 && (
            <p className="mb-6 text-sm" style={{ color: "var(--warn-fg)" }}>
              No load inventory is recorded — there is no theoretical figure to compare against,
              which is itself a gap this report cannot paper over.
            </p>
          )}

          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Recorded consumption, day by day</h2>
            <p className="text-xs text-[var(--text-subtle)]">Excluded days are shown, never hidden</p>
          </div>
          <DaysGrid days={preDays} mode="variance" />
          <ReportLegend days={preDays} mode="variance" />
          <ExclusionNotes days={preDays} />
        </section>

        <footer className="report-footer">
          <span>
            FirsThing · every figure traces to stored daily readings and the recorded inventory
            (INV-02).
          </span>
          <span className="num report-colophon">
            {society.name} · {circuit.location || circuit.lightType} · pre-installation
          </span>
        </footer>
      </article>
    </div>
  );
}
