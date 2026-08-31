"use client";

import { useMemo, useState } from "react";

/**
 * The society's consumption over time, with a selectable period and bucket
 * (user-specified, 2026-08-31).
 *
 * Two things this fixes about the chart it replaces:
 *
 *  1. **It scaled to the BASELINE, not the data.** With a 91% saving, a
 *     2.9 kWh day against a 32.7 kWh/day baseline rendered as an 8% sliver —
 *     every bar a flat slab on the axis (user-reported, with a screenshot).
 *     A reference line an order of magnitude above the data destroys the very
 *     thing the chart is for. The scale now follows the DATA; the baseline is
 *     drawn only when it is close enough to share the scale honestly, and is
 *     stated in words with an ↑ marker when it is not. The saving itself is
 *     already given as a figure in the hero card — it does not need the chart
 *     to be unreadable to make its point.
 *
 *  2. **The window was fixed at 14 days.** Daily / weekly / monthly / yearly
 *     and overall are now selectable; daily over the last 30 days is the
 *     default.
 *
 * Bucketing sums both kWh and the per-day baselines in force, so a bucket
 * always compares like with like even across an INV-07 rescale.
 */
export type DailyPoint = { date: string; kWh: number; baseline: number | null };

type Bucket = "daily" | "weekly" | "monthly" | "yearly" | "overall";

const PERIODS: { id: Bucket; label: string; note: string }[] = [
  { id: "daily", label: "Daily", note: "last 30 recorded days" },
  { id: "weekly", label: "Weekly", note: "last 26 recorded weeks" },
  { id: "monthly", label: "Monthly", note: "last 24 recorded months" },
  { id: "yearly", label: "Yearly", note: "every recorded year" },
  { id: "overall", label: "Overall", note: "everything on record" },
];

/** Monday of the week a date falls in, in UTC (dates are stored at UTC midnight). */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function labelFor(key: string, bucket: Bucket): string {
  if (bucket === "yearly") return key;
  if (bucket === "monthly") {
    const d = new Date(`${key}-01T00:00:00Z`);
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

type Bar = { key: string; label: string; kWh: number; baseline: number | null; days: number };

function bucketise(days: DailyPoint[], bucket: Bucket): { bars: Bar[]; note: string } {
  if (days.length === 0) return { bars: [], note: "" };

  // "Overall" keeps the whole history and picks whatever bucket keeps the
  // chart readable — a 275-day history as 275 bars is not a chart.
  let effective = bucket;
  if (bucket === "overall") {
    effective = days.length <= 40 ? "daily" : days.length <= 200 ? "weekly" : "monthly";
  }

  const keyOf = (d: DailyPoint) =>
    effective === "daily"
      ? d.date
      : effective === "weekly"
        ? weekStart(d.date)
        : effective === "monthly"
          ? d.date.slice(0, 7)
          : d.date.slice(0, 4);

  const groups = new Map<string, { kWh: number; baseline: number; anyNull: boolean; days: number }>();
  for (const d of days) {
    const k = keyOf(d);
    const g = groups.get(k) ?? { kWh: 0, baseline: 0, anyNull: false, days: 0 };
    g.kWh += d.kWh;
    if (d.baseline === null) g.anyNull = true;
    else g.baseline += d.baseline;
    g.days += 1;
    groups.set(k, g);
  }

  let bars: Bar[] = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, g]) => ({
      key,
      label: labelFor(key, effective),
      kWh: g.kWh,
      baseline: g.anyNull ? null : g.baseline,
      days: g.days,
    }));

  const cap =
    bucket === "daily" ? 30 : bucket === "weekly" ? 26 : bucket === "monthly" ? 24 : Infinity;
  const trimmed = bars.length > cap;
  if (trimmed) bars = bars.slice(-cap);

  const unit = effective === "daily" ? "day" : effective === "weekly" ? "week" : effective === "monthly" ? "month" : "year";
  const note =
    bucket === "overall"
      ? `everything on record · ${bars.length} ${unit}${bars.length === 1 ? "" : "s"}`
      : `${bars.length} recorded ${unit}${bars.length === 1 ? "" : "s"}`;
  return { bars, note };
}

/**
 * A top-of-scale whose QUARTERS are round, not just its maximum: four
 * gridlines under a nice-looking 25 read 0.0 / 6.3 / 13 / 19 / 25, which is
 * four odd numbers to make one tidy one. Picking the step first and
 * multiplying gives 0 / 6 / 12 / 18 / 24 instead.
 */
function niceStep(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10]) {
    if (step * mag >= v) return step * mag;
  }
  return 10 * mag;
}
function niceAxisTop(v: number): number {
  return niceStep(v / 4) * 4;
}

export function ConsumptionChart({
  days,
  height = 170,
}: {
  days: DailyPoint[];
  height?: number;
}) {
  const [bucket, setBucket] = useState<Bucket>("daily");
  const { bars, note } = useMemo(() => bucketise(days, bucket), [days, bucket]);

  if (days.length === 0) return null;

  const w = 1020;
  const padLeft = 46;
  const plotW = w - padLeft;
  const maxKwh = Math.max(...bars.map((b) => b.kWh), 0);
  // The baseline for a bucket, averaged over the buckets that have one — the
  // rule is a single line, so it can only honestly represent a single figure.
  const withBase = bars.filter((b) => b.baseline !== null);
  const avgBaseline =
    withBase.length > 0 ? withBase.reduce((s, b) => s + (b.baseline ?? 0), 0) / withBase.length : null;

  // Scale to the DATA. The baseline shares the scale only when it is close
  // enough not to flatten it; otherwise it is stated, not drawn.
  const baselineFits = avgBaseline !== null && avgBaseline <= maxKwh * 2.2;
  const top = niceAxisTop(baselineFits ? Math.max(maxKwh, avgBaseline) * 1.1 : maxKwh * 1.15);
  const y = (v: number) => height - (v / top) * height;

  const gridSteps = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);
  const gap = bars.length > 60 ? 1 : bars.length > 30 ? 2 : 6;
  const bw = Math.max(1.5, (plotW - gap * (bars.length - 1)) / bars.length);
  const perBucket = bucket === "daily" ? "day" : "bucket";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="seg" aria-label="Chart period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={bucket === p.id ? "on" : undefined}
              aria-pressed={bucket === p.id}
              onClick={() => setBucket(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
          kWh · {note}
        </p>
      </div>

      <svg
        // -10 of headroom: the top gridline's own label sits at y≈3 and was
        // clipped by the viewBox edge.
        viewBox={`0 -10 ${w} ${height + 44}`}
        style={{ width: "100%", display: "block" }}
        role="img"
        aria-label={`Consumption, ${bars.length} ${bucket} buckets`}
      >
        {gridSteps.map((v) => (
          <g key={v}>
            <line
              x1={padLeft}
              x2={w}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={padLeft - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-subtle)">
              {v % 1 === 0 ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        {baselineFits && avgBaseline !== null && (
          <>
            <line
              x1={padLeft}
              x2={w}
              y1={y(avgBaseline)}
              y2={y(avgBaseline)}
              stroke="var(--chart-rule)"
              strokeWidth={1.4}
              strokeDasharray="5 4"
            />
            <text
              x={w}
              y={y(avgBaseline) + 15}
              textAnchor="end"
              fontSize={10.5}
              fontWeight={600}
              fill="var(--text-muted)"
            >
              before FirsThing · {avgBaseline.toFixed(1)} kWh per {perBucket}
            </text>
          </>
        )}

        {bars.map((b, i) => {
          const bh = Math.max(2, (b.kWh / top) * height);
          return (
            <rect
              key={b.key}
              x={padLeft + i * (bw + gap)}
              y={height - bh}
              width={bw}
              height={bh}
              rx={Math.min(3.5, bw / 2)}
              fill="var(--chart-mark)"
            >
              <title>{`${b.label} · ${b.kWh.toFixed(2)} kWh${b.baseline !== null ? ` · before FirsThing ${b.baseline.toFixed(2)} kWh` : ""}`}</title>
            </rect>
          );
        })}

        <line x1={padLeft} x2={w} y1={height} y2={height} stroke="var(--border)" strokeWidth={1} />

        {bars.map((b, i) =>
          // Sparse x labels: first, last and an even spread, so 30 bars do
          // not smear into a grey band.
          i === 0 || i === bars.length - 1 || i % Math.ceil(bars.length / 6) === 0 ? (
            <text
              key={`l${b.key}`}
              // The first and last labels are anchored to the plot's edges:
              // centred on their own bar, half of each fell outside the box.
              x={i === 0 ? padLeft : i === bars.length - 1 ? w : padLeft + i * (bw + gap) + bw / 2}
              y={height + 16}
              textAnchor={i === 0 ? "start" : i === bars.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--text-subtle)"
            >
              {b.label}
            </text>
          ) : null,
        )}
      </svg>

      {!baselineFits && avgBaseline !== null && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
          ↑ Before FirsThing this circuit drew about{" "}
          <span className="num" style={{ color: "var(--text-muted)", fontWeight: 600 }}>
            {avgBaseline.toFixed(1)} kWh
          </span>{" "}
          per {perBucket} — off the top of this scale, which is set to what you use now so the days
          stay readable.
        </p>
      )}
    </div>
  );
}
