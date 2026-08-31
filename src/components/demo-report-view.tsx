import type { DemoReportCircuit } from "@/lib/demo-report";
import { Card, CardTitle, Stat, StatRow } from "@/components/ui";
import { circuitLabelOf } from "@/lib/meter-view";

// Shared by the back-office report screen and the society portal, so the two
// can never drift into showing different figures for the same report — the
// society and PER-01 arguing from differently-rendered numbers is exactly
// the dispute INV-02 exists to prevent.
export function DemoReportView({
  report,
  showReadings = true,
  lightCountSource,
}: {
  report: {
    measuredSavingsPct: number;
    preInstallBaselineTotal: number;
    postInstallAverageTotal: number;
    societyLightCount: number;
    meteredLightCount: number;
    extrapolationFactor: number;
    projectedSavingsKwhPerDay: number;
    circuitSnapshot: unknown;
  };
  showReadings?: boolean;
  /**
   * Where the whole-society light count came from. A society commissioned
   * before this system existed has no walked inventory, so the figure is the
   * population each circuit already records itself as representing. Saying so
   * matters: the two are the same quantity but not the same evidence, and a
   * report that presents them identically is one a society cannot audit.
   */
  lightCountSource?: "inventory" | "represented";
}) {
  const circuits = (report.circuitSnapshot as DemoReportCircuit[]) ?? [];

  // The figure that governs is the benchmark each circuit carries — what the
  // agreement says and what the bill is computed from. The report used to
  // re-ratio the stored totals into a second percentage, which disagreed
  // with the contract wherever a circuit excludes a shared fitting from the
  // calculation or was demonstrated more than once. Derived from the
  // snapshot rather than stored, so reports written before this render it too.
  const baselineTotal = circuits.reduce((n, c) => n + c.preInstallBaseline, 0);
  const agreedSavingsPct =
    baselineTotal > 0
      ? (circuits.reduce((n, c) => n + c.preInstallBaseline * (c.benchmarkSavingsPct / 100), 0) /
          baselineTotal) *
        100
      : report.measuredSavingsPct;

  return (
    <div className="space-y-6">
      <StatRow>
        <Stat
          label="Agreed savings"
          value={`${agreedSavingsPct.toFixed(2)}%`}
          detail={
            circuits.length > 1
              ? "Each circuit's benchmark, weighted by its baseline"
              : "The benchmark on record for this circuit"
          }
        />
        <Stat
          label="Before (daily)"
          value={`${report.preInstallBaselineTotal.toFixed(2)} kWh`}
          detail="Pre-install baseline average"
        />
        <Stat
          label="After (daily)"
          value={`${report.postInstallAverageTotal.toFixed(2)} kWh`}
          detail="Post-install average"
        />
        <Stat
          label="Projected society-wide"
          value={`${report.projectedSavingsKwhPerDay.toFixed(2)} kWh/day`}
          detail={
            lightCountSource === "represented"
              ? `${report.meteredLightCount} metered of ${report.societyLightCount} represented — from each circuit's recorded population, not a walked inventory`
              : `${report.meteredLightCount} metered of ${report.societyLightCount} lights`
          }
        />
      </StatRow>

      {/* The scroll box wraps the TABLE, never the card: with overflow on the
          card itself, scrolling a wide table dragged this heading and its
          own description out of view and ran the rows past the rounded
          corner (user-reported 2026-08-31). Units live in the headers so the
          seven columns fit a half-page column without one at all. */}
      <Card className="p-5">
        <CardTitle>Per circuit</CardTitle>
        <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
          Each metered circuit carries its own benchmark and stands in for every light of its type (CON-11).
        </p>
        <div className="-mx-3 overflow-x-auto">
          <table className="tbl tbl-compact">
            <thead>
              <tr>
                <th>Light type</th>
                <th className="text-right">Metered</th>
                <th className="text-right">Represents</th>
                <th className="text-right">
                  Before
                  <span className="block font-normal normal-case tracking-normal">kWh/day</span>
                </th>
                <th className="text-right">
                  After
                  <span className="block font-normal normal-case tracking-normal">kWh/day</span>
                </th>
                <th className="text-right">Benchmark</th>
                <th className="text-right">
                  Projected saving
                  <span className="block font-normal normal-case tracking-normal">kWh/day</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {circuits.map((c) => (
                <tr key={c.circuitId}>
                  {/* circuitLabelOf, not a hand-built string: several
                      backfilled circuits sit in the Basement AND carry the
                      light type "basement", and "basement · Basement" reads
                      as a rendering fault (already fixed once, on the meters
                      list — this was the fifth place building it by hand). */}
                  <td>{circuitLabelOf(c.location ?? null, c.lightType)}</td>
                  <td className="num text-right">{c.meteredLightCount}</td>
                  <td className="num text-right">{c.representedLightCount}</td>
                  <td className="num text-right">{c.preInstallBaseline.toFixed(2)}</td>
                  <td className="num text-right">{c.postInstallAverage.toFixed(2)}</td>
                  <td className="num text-right">{c.benchmarkSavingsPct.toFixed(2)}%</td>
                  <td className="num text-right">{c.projectedSavedKwhPerDay.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* INV-02 — the days behind every figure above, so the number can be
          audited rather than taken on trust. */}
      {showReadings &&
        circuits.map((c) => (
          <Card key={c.circuitId} className="p-5">
            <CardTitle>Daily readings — {circuitLabelOf(c.location ?? null, c.lightType)}</CardTitle>
            <div className="grid gap-6 sm:grid-cols-2 mt-4">
              <div>
                <p className="lbl mb-2">Before replacement</p>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>kWh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(c.preInstallReadings ?? []).map((r) => (
                      <tr key={r.date}>
                        <td className="num">{r.date}</td>
                        <td className="num">{r.consumptionKwh.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="lbl mb-2">After replacement</p>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>kWh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(c.postInstallReadings ?? []).map((r) => (
                      <tr key={r.date}>
                        <td className="num">{r.date}</td>
                        <td className="num">{r.consumptionKwh.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        ))}
    </div>
  );
}
