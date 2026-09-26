import type { DemoReportCircuit, DemoReportReading } from "@/lib/demo-report";
import { dayAxis, formatDate } from "@/lib/format-date";
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
  // The benchmark is a share of what the REPLACED lights drew, so the draw of
  // fixtures left unreplaced comes off the baseline first (2026-09-26).
  const baselineTotal = circuits.reduce((n, c) => n + c.preInstallBaseline - (c.excludedKwhPerDay ?? 0), 0);
  const agreedSavingsPct =
    baselineTotal > 0
      ? (circuits.reduce((n, c) => n + (c.preInstallBaseline - (c.excludedKwhPerDay ?? 0)) * (c.benchmarkSavingsPct / 100), 0) /
          baselineTotal) *
        100
      : report.measuredSavingsPct;
  const withExcluded = circuits.filter((c) => (c.excludedDevices?.length ?? 0) > 0);

  const before = report.preInstallBaselineTotal;
  const after = report.postInstallAverageTotal;
  const afterShare = before > 0 ? Math.min(100, Math.max(0, (after / before) * 100)) : 0;
  const allPre = circuits.flatMap((c) => c.preInstallReadings ?? []);
  const allPost = circuits.flatMap((c) => c.postInstallReadings ?? []);

  return (
    <div className="demo-report @container space-y-6 print:space-y-3">
      {/* The headline band: three cells divided by hairlines, not three cards. */}
      <section
        className="grid gap-px overflow-hidden rounded-[var(--r-md)] border @2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1fr)] break-inside-avoid dr-headline"
        style={{ borderColor: "var(--border-subtle)", background: "var(--border-subtle)" }}
      >
        <div className="p-5 print:p-4" style={{ background: "var(--surface)" }}>
          <p className="lbl mb-2">Agreed savings</p>
          <p className="dr-big num text-[34px] font-bold leading-none" style={{ color: "var(--ok-fg)" }}>
            {agreedSavingsPct.toFixed(2)}%
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            {circuits.length > 1
              ? "Each circuit's benchmark, weighted by its baseline"
              : "The benchmark on record for this circuit"}
          </p>
        </div>

        <div className="dr-compare p-5 print:p-4" style={{ background: "var(--surface)" }}>
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

        <div className="p-5 print:p-4" style={{ background: "var(--surface)" }}>
          <p className="lbl mb-2">Across your society</p>
          <p className="dr-big num text-[24px] font-bold leading-none">
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
        <dl className="dr-periods grid grid-cols-2 gap-y-2 text-[13px]">
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
      {/* Fixtures on a demo circuit that were not replaced (2026-09-26,
          user-specified): named, with the draw subtracted, so the saving is
          visibly the saving of the lights that were replaced. */}
      {withExcluded.length > 0 && (
        <section className="break-inside-avoid rounded-[var(--r-md)] border px-4 py-3 text-[13.5px] leading-relaxed" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="font-semibold">Lights on the circuit that were not replaced</p>
          {withExcluded.map((c) => (
            <p key={c.circuitId} className="mt-1" style={{ color: "var(--text-muted)" }}>
              {circuits.length > 1 ? `${circuitLabelOf(c.location ?? null, c.lightType)}: ` : ""}
              {c.excludedDevices!.map((d) => `${d.count} × ${d.name} (${d.wattage}W)`).join(", ")} stay on the circuit and are
              excluded from the benchmark. Their{" "}
              <span className="num font-semibold" style={{ color: "var(--text)" }}>
                {(c.excludedKwhPerDay ?? 0).toFixed(2)} kWh/day
              </span>{" "}
              is subtracted from both the before and after averages, so the saving is measured on the replaced lights only: (
              <span className="num">{c.preInstallBaseline.toFixed(2)}</span> −{" "}
              <span className="num">{c.postInstallAverage.toFixed(2)}</span>) ÷ (
              <span className="num">{c.preInstallBaseline.toFixed(2)}</span> −{" "}
              <span className="num">{(c.excludedKwhPerDay ?? 0).toFixed(2)}</span>) ={" "}
              <span className="num font-semibold" style={{ color: "var(--text)" }}>
                {(((c.preInstallBaseline - c.postInstallAverage) / (c.preInstallBaseline - (c.excludedKwhPerDay ?? 0))) * 100).toFixed(1)}%
              </span>
              .
            </p>
          ))}
        </section>
      )}

      {showReadings &&
        circuits.map((c) => {
          const pre = c.preInstallReadings ?? [];
          const post = c.postInstallReadings ?? [];
          if (pre.length === 0 && post.length === 0) return null;
          return (
            <section key={c.circuitId} className="break-inside-avoid border-t pt-5 print:pt-3" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-[15px] font-semibold">
                  Demo days{circuits.length > 1 ? ` — ${circuitLabelOf(c.location ?? null, c.lightType)}` : ""}
                </h3>
              </div>
              <div className="dr-days grid gap-5 @2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                {/* The legend sits on the chart it explains, so it moves with the
                    chart wherever the table goes (user-caught 2026-09-26: on
                    paper the table moved under the chart and the legend was
                    left stranded top right). On paper the chart runs the full
                    width, taller: a portrait page has the height. */}
                <div className="min-w-0">
                  <Legend hasPre={pre.length > 0} hasPost={post.length > 0} />
                  <div className="print:hidden">
                    <DemoDaysChart pre={pre} post={post} preAvg={c.preInstallBaseline} postAvg={c.postInstallAverage} />
                  </div>
                  <div className="hidden print:block">
                    <DemoDaysChart pre={pre} post={post} preAvg={c.preInstallBaseline} postAvg={c.postInstallAverage} width={720} height={130} />
                  </div>
                </div>
                <DaysTable pre={pre} post={post} preAvg={c.preInstallBaseline} postAvg={c.postInstallAverage} />
              </div>
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

/** Over the chart, split like it: before over the left half, after from the midpoint. */
function Legend({ hasPre, hasPost }: { hasPre: boolean; hasPost: boolean }) {
  const both = hasPre && hasPost;
  const item = (label: string, colour: string) => (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
  return (
    <p className={`mb-1 grid text-[11.5px] ${both ? "grid-cols-2" : ""}`} style={{ color: "var(--text-subtle)" }}>
      {hasPre && item("Before replacement", "var(--chart-mark-inert)")}
      {hasPost && item("After replacement", "var(--chart-mark)")}
    </p>
  );
}

/**
 * The demo's days as bars, before and after the replacement side by side,
 * with each period's average drawn across its own bars. Server-rendered SVG,
 * so it prints with the report.
 */
function DemoDaysChart({
  pre,
  post,
  preAvg,
  postAvg,
  width = 560,
  height = 190,
}: {
  pre: DemoReportReading[];
  post: DemoReportReading[];
  preAvg: number;
  postAvg: number;
  width?: number;
  height?: number;
}) {
  const W = width;
  const H = height;
  const top = 24;
  const bottom = 26;
  const padX = 6;
  // Before on the left half, after from the midpoint — the same split as the
  // period line above and the table below, so the three read as one column
  // each (user-caught 2026-09-26: they sat at three different offsets).
  const both = pre.length > 0 && post.length > 0;
  const inner = W - padX * 2;
  const half = both ? inner / 2 : inner;
  const unit = half / Math.max(pre.length, post.length, 1);
  const barW = Math.min(unit * 0.72, 38);
  const max = Math.max(preAvg, ...pre.map((r) => r.consumptionKwh), ...post.map((r) => r.consumptionKwh), 1) * 1.12;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const preX = (i: number) => padX + unit * i + unit / 2;
  const postX = (i: number) => padX + (both ? half : 0) + unit * i + unit / 2;
  const labelEvery = Math.max(1, Math.ceil(Math.max(pre.length, post.length) / 7));

  const bars = [
    ...pre.map((r, i) => ({ r, x: preX(i), fill: "var(--chart-mark-inert)", i })),
    ...post.map((r, i) => ({ r, x: postX(i), fill: "var(--chart-mark)", i })),
  ];
  const avgLine = (x1: number, x2: number, v: number) => (
    <g>
      <line x1={x1} x2={x2} y1={y(v)} y2={y(v)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" />
      <text x={x1} y={y(v) - 5} textAnchor="start" fontSize={10.5} fontWeight={600} fill="var(--text-muted)" className="num">
        avg {kwh(v)} kWh
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily consumption during the demo, before and after the replacement">
      <line x1={padX} x2={W - padX} y1={H - bottom} y2={H - bottom} stroke="var(--chart-rule)" />
      {bars.map(({ r, x, fill, i }) => (
        <g key={`${r.date}-${i}`}>
          <title>{`${formatDate(r.date)} · ${kwh(r.consumptionKwh)} kWh`}</title>
          <rect x={x - barW / 2} y={y(r.consumptionKwh)} width={barW} height={Math.max(0, H - bottom - y(r.consumptionKwh))} rx={2} fill={fill} />
          {i % labelEvery === 0 && (
            <text x={x} y={H - bottom + 14} textAnchor="middle" fontSize={9.5} fill="var(--text-subtle)">
              {dayAxis(r.date)}
            </text>
          )}
        </g>
      ))}
      {both && (
        <line x1={padX + half} x2={padX + half} y1={top - 6} y2={H - bottom} stroke="var(--chart-rule)" strokeDasharray="2 3" />
      )}
      {pre.length > 0 && avgLine(padX + 2, preX(pre.length - 1) + unit / 2 - 2, preAvg)}
      {post.length > 0 && avgLine(postX(0) - unit / 2 + 2, postX(post.length - 1) + unit / 2 - 2, postAvg)}
    </svg>
  );
}

/** The same days as figures: before and after side by side, averages below. */
function DaysTable({
  pre,
  post,
  preAvg,
  postAvg,
}: {
  pre: DemoReportReading[];
  post: DemoReportReading[];
  preAvg: number;
  postAvg: number;
}) {
  const rows = Math.max(pre.length, post.length);
  return (
    <table className="dr-days-table tbl tbl-compact w-full table-fixed self-start [&_td]:py-1.5">
      <colgroup>
        <col className="w-[30%]" />
        <col className="w-[20%]" />
        <col className="w-[30%]" />
        <col className="w-[20%]" />
      </colgroup>
      <thead>
        <tr>
          <th>Before</th>
          <th className="text-right">kWh</th>
          <th>After</th>
          <th className="text-right">kWh</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td className="num" style={{ color: "var(--text-muted)" }}>{pre[i] ? formatDate(pre[i].date) : ""}</td>
            <td className="num text-right">{pre[i] ? kwh(pre[i].consumptionKwh) : ""}</td>
            <td className="num" style={{ color: "var(--text-muted)" }}>{post[i] ? formatDate(post[i].date) : ""}</td>
            <td className="num text-right">{post[i] ? kwh(post[i].consumptionKwh) : ""}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t" style={{ borderColor: "var(--border)" }}>
          <td className="font-semibold">Average</td>
          <td className="num text-right font-semibold">{kwh(preAvg)}</td>
          <td />
          <td className="num text-right font-semibold">{kwh(postAvg)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
