import type { DemoReportCircuit } from "@/lib/demo-report";
import { Card, CardTitle, Stat, StatRow } from "@/components/ui";

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

  return (
    <div className="space-y-6">
      <StatRow>
        <Stat
          label="Measured savings"
          value={`${report.measuredSavingsPct.toFixed(2)}%`}
          detail="Across the metered demo circuits"
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

      <Card className="p-5 overflow-x-auto">
        <CardTitle>Per circuit</CardTitle>
        <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
          Each metered circuit carries its own benchmark and stands in for every light of its type (CON-11).
        </p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Light type</th>
              <th>Metered</th>
              <th>Represents</th>
              <th>Before</th>
              <th>After</th>
              <th>Benchmark</th>
              <th>Projected saving</th>
            </tr>
          </thead>
          <tbody>
            {circuits.map((c) => (
              <tr key={c.circuitId}>
                <td>
                  {c.lightType}
                  {c.location && <span className="text-[var(--text-muted)]"> · {c.location}</span>}
                </td>
                <td className="num">{c.meteredLightCount}</td>
                <td className="num">{c.representedLightCount}</td>
                <td className="num">{c.preInstallBaseline.toFixed(2)}</td>
                <td className="num">{c.postInstallAverage.toFixed(2)}</td>
                <td className="num">{c.benchmarkSavingsPct.toFixed(2)}%</td>
                <td className="num">{c.projectedSavedKwhPerDay.toFixed(2)} kWh/day</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* INV-02 — the days behind every figure above, so the number can be
          audited rather than taken on trust. */}
      {showReadings &&
        circuits.map((c) => (
          <Card key={c.circuitId} className="p-5 overflow-x-auto">
            <CardTitle>
              Daily readings — {c.lightType}
              {c.location ? ` · ${c.location}` : ""}
            </CardTitle>
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
