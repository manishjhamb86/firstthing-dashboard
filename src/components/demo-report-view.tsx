import type { DemoReportCircuit, DemoReportReading } from "@/lib/demo-report";
import { formatDate } from "@/lib/format-date";
import { DemoDays } from "@/components/demo-days";
import { circuitLabelOf } from "@/lib/meter-view";

// Shared by the back-office report screen and the society portal, so the two
// can never drift into showing different figures for the same report — the
// society and PER-01 arguing from differently-rendered numbers is exactly
// the dispute INV-02 exists to prevent.
//
// Laid out (2026-09-26, user-caught: "space on this report is not utilised
// properly") as one headline band — the agreed saving, the before/after on
// the demo lights, and what that means across the society — then the demo's
// own days as a chart beside the table behind it. Four half-empty tiles and a
// table repeating the same four numbers for a one-circuit demo are gone; the
// per-circuit table appears only when there is more than one circuit to
// compare. Everything here is the demo: its light count and its days, never
// the circuit as it stands today.

const kwh = (n: number) => n.toFixed(2);

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
  // agreement says and what the bill is computed from. Derived from the
  // snapshot rather than stored, so reports written before this render it too.
  const baselineTotal = circuits.reduce((n, c) => n + c.preInstallBaseline, 0);
  const agreedSavingsPct =
    baselineTotal > 0
      ? (circuits.reduce((n, c) => n + c.preInstallBaseline * (c.benchmarkSavingsPct / 100), 0) /
          baselineTotal) *
        100
      : report.measuredSavingsPct;

  const before = report.preInstallBaselineTotal;
  const after = report.postInstallAverageTotal;
  const afterShare = before > 0 ? Math.min(100, Math.max(0, (after / before) * 100)) : 0;
  const allPre = circuits.flatMap((c) => c.preInstallReadings ?? []);
  const allPost = circuits.flatMap((c) => c.postInstallReadings ?? []);

  return (
    <div className="@container space-y-6">
      {/* The headline band: three cells divided by hairlines, not three cards. */}
      <section
        className="grid gap-px overflow-hidden rounded-[var(--r-md)] border @2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1fr)] break-inside-avoid"
        style={{ borderColor: "var(--border-subtle)", background: "var(--border-subtle)" }}
      >
        <div className="p-5" style={{ background: "var(--surface)" }}>
          <p className="lbl mb-2">Agreed savings</p>
          <p className="num text-[34px] font-bold leading-none" style={{ color: "var(--ok-fg)" }}>
            {agreedSavingsPct.toFixed(2)}%
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            {circuits.length > 1
              ? "Each circuit's benchmark, weighted by its baseline"
              : "The benchmark on record for this circuit"}
          </p>
        </div>

        <div className="p-5" style={{ background: "var(--surface)" }}>
          <p className="lbl mb-3">
            On the {report.meteredLightCount.toLocaleString("en-IN")} demo light{report.meteredLightCount === 1 ? "" : "s"}
          </p>
          <BarRow label="Before" value={before} share={100} tone="var(--chart-mark-inert)" note="pre-install average" />
          <BarRow label="After" value={after} share={afterShare} tone="var(--chart-mark)" note="post-install average" />
          <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            Saves <span className="num font-semibold" style={{ color: "var(--text)" }}>{kwh(before - after)} kWh/day</span>{" "}
            — measured {report.measuredSavingsPct.toFixed(2)}%
          </p>
        </div>

        <div className="p-5" style={{ background: "var(--surface)" }}>
          <p className="lbl mb-2">Across your society</p>
          <p className="num text-[24px] font-bold leading-none">
            {kwh(report.projectedSavingsKwhPerDay)}
            <span className="ml-1 text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>
              kWh/day
            </span>
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            {report.meteredLightCount.toLocaleString("en-IN")} demo lights stand in for{" "}
            {report.societyLightCount.toLocaleString("en-IN")}
            {lightCountSource === "represented"
              ? " — from each circuit's recorded population, not a walked inventory"
              : ""}
          </p>
        </div>
      </section>

      {/* The demo's own period, so a reader knows which days are behind it. */}
      {(allPre.length > 0 || allPost.length > 0) && (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          <PeriodFact label="Before period" days={allPre} />
          <PeriodFact label="After period" days={allPost} />
        </dl>
      )}

      {circuits.length > 1 && (
        <section className="break-inside-avoid">
          <h3 className="mb-1 text-[15px] font-semibold">Per circuit</h3>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Each metered circuit carries its own benchmark and stands in for every light of its type.
          </p>
          <div className="-mx-3 overflow-x-auto">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Light type</th>
                  <th className="text-right">Demo lights</th>
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
                    {/* circuitLabelOf, not a hand-built string ("basement · Basement"). */}
                    <td>{circuitLabelOf(c.location ?? null, c.lightType)}</td>
                    <td className="num text-right">{c.meteredLightCount}</td>
                    <td className="num text-right">{c.representedLightCount}</td>
                    <td className="num text-right">{kwh(c.preInstallBaseline)}</td>
                    <td className="num text-right">{kwh(c.postInstallAverage)}</td>
                    <td className="num text-right">{c.benchmarkSavingsPct.toFixed(2)}%</td>
                    <td className="num text-right">{kwh(c.projectedSavedKwhPerDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* INV-02 — the days behind every figure above, so the number can be
          audited rather than taken on trust. Only the demo's days: the report
          is the demo, and the circuit's later monitoring is not part of it. */}
      {showReadings &&
        circuits.map((c) => {
          const pre = c.preInstallReadings ?? [];
          const post = c.postInstallReadings ?? [];
          if (pre.length === 0 && post.length === 0) return null;
          const days = [
            ...pre.map((r) => ({ date: r.date, kWh: r.consumptionKwh, phase: "pre" as const })),
            ...post.map((r) => ({ date: r.date, kWh: r.consumptionKwh, phase: "post" as const })),
          ];
          return (
            <section key={c.circuitId} className="border-t pt-5" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="mb-3 text-[15px] font-semibold">
                Readings{circuits.length > 1 ? ` — ${circuitLabelOf(c.location ?? null, c.lightType)}` : ""}
              </h3>
              {/* On screen: a year, then a month, at a time. On paper every
                  day is printed, since a printed report has no tabs. */}
              <div className="print:hidden">
                <DemoDays days={days} preAvg={c.preInstallBaseline} postAvg={c.postInstallAverage} />
              </div>
              <table className="tbl tbl-compact hidden w-full print:table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {pre.length > 0 && post.length > 0 && <th>Side</th>}
                    <th className="text-right">kWh</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => (
                    <tr key={d.date + d.phase}>
                      <td className="num">{formatDate(d.date)}</td>
                      {pre.length > 0 && post.length > 0 && <td>{d.phase === "pre" ? "Before" : "After"}</td>}
                      <td className="num text-right">{kwh(d.kWh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
    </div>
  );
}

function BarRow({ label, value, share, tone, note }: { label: string; value: number; share: number; tone: string; note: string }) {
  return (
    <div className="mb-2 grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3">
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="h-3 overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }} title={note}>
        <span className="block h-full rounded-full" style={{ width: `${share}%`, background: tone }} />
      </span>
      <span className="num text-[14px] font-semibold">
        {kwh(value)} <span className="text-[11px] font-normal" style={{ color: "var(--text-subtle)" }}>kWh/day</span>
      </span>
    </div>
  );
}

function PeriodFact({ label, days }: { label: string; days: DemoReportReading[] }) {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <div>
      <dt className="lbl mb-0.5">{label}</dt>
      <dd className="num">
        {formatDate(sorted[0].date)} → {formatDate(sorted[sorted.length - 1].date)}{" "}
        <span style={{ color: "var(--text-subtle)" }}>
          · {days.length} day{days.length === 1 ? "" : "s"}
        </span>
      </dd>
    </div>
  );
}
