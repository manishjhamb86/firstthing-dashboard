// FEAT-055-AC-1 — the month's daily readings plotted against the benchmark.
//
// Form: bars, not a line. A line interpolates across a day that never
// reported, and on this screen a missing day is one of the two explanations
// the reviewer is choosing between (CON-12 coverage vs real consumption) —
// drawing a smooth slope through it would answer the question the chart
// exists to ask. One bar per calendar day, absent days left as gaps.
//
// One axis, zero-based, because bars encode magnitude by length.
//
// No client JavaScript: this renders in a Server Component, and the hover
// layer is a native <title> per mark. Identity is never colour alone — the
// legend is always present, out-of-band days are also labelled, and excluded
// days carry a hatch as well as a muted fill (the CVD/print case).

export type ChartDay = {
  date: string; // YYYY-MM-DD
  kWh: number | null; // null = no reading that day
  excluded: boolean;
  excludedReason?: string | null;
};

export function DeviationChart({
  days,
  benchmarkKwh,
  toleranceKwh,
  baselineKwh,
}: {
  days: ChartDay[];
  /** The consumption a day exactly at benchmark would show. */
  benchmarkKwh: number;
  /** Half-width of the contracted band, in kWh at this baseline. */
  toleranceKwh: number;
  /** Pre-installation daily consumption, for the "before" reference. */
  baselineKwh: number;
}) {
  const W = 880;
  const H = 260;
  const PAD = { top: 18, right: 16, bottom: 30, left: 46 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values = days.map((d) => d.kWh).filter((v): v is number => v !== null);
  const yMax = Math.max(baselineKwh, benchmarkKwh + toleranceKwh, ...values, 1) * 1.1;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const bandW = plotW / Math.max(days.length, 1);
  // Thin marks with a 2px surface gap between adjacent fills. Capped, or a
  // short month paints 28px slabs that read as one solid block rather than
  // as a series of days.
  const barW = Math.min(18, Math.max(3, bandW - 2));

  const ceiling = benchmarkKwh + toleranceKwh;
  const floorKwh = Math.max(0, benchmarkKwh - toleranceKwh);
  const overCount = days.filter((d) => !d.excluded && d.kWh !== null && d.kWh > ceiling).length;
  const missing = days.filter((d) => d.kWh === null).length;

  const ticks = [0, yMax / 2, yMax].map((v) => ({ v, y: y(v) }));

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Daily consumption for ${days.length} days against a benchmark of ${benchmarkKwh.toFixed(2)} kWh per day. ${overCount} day${overCount === 1 ? "" : "s"} above the contracted band.`}
          style={{ minWidth: 520, display: "block" }}
        >
          <defs>
            {/* Texture, so an excluded day is distinguishable without colour. */}
            <pattern id="dev-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--chart-mark-inert)" opacity="0.25" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-mark-inert)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Recessive grid. */}
          {ticks.map((t) => (
            <g key={t.v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={t.y}
                y2={t.y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={t.y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--text-subtle)"
              >
                {t.v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* The contracted band, as a region rather than two more lines. */}


          {days.map((d, i) => {
            const x = PAD.left + i * bandW + (bandW - barW) / 2;
            if (d.kWh === null) {
              // An absent day is drawn as an absence — a baseline tick, not a
              // zero-height bar, which would read as "consumed nothing".
              return (
                <g key={d.date}>
                  <title>{`${d.date} — no reading`}</title>
                  <line
                    x1={x + barW / 2}
                    x2={x + barW / 2}
                    y1={PAD.top + plotH}
                    y2={PAD.top + plotH - 4}
                    stroke="var(--chart-mark-inert)"
                    strokeWidth="2"
                  />
                </g>
              );
            }
            const over = !d.excluded && d.kWh > ceiling;
            const h = Math.max(2, PAD.top + plotH - y(d.kWh));
            return (
              <g key={d.date}>
                <title>
                  {`${d.date} — ${d.kWh.toFixed(2)} kWh` +
                    (d.excluded
                      ? ` · excluded: ${d.excludedReason ?? "no reason recorded"}`
                      : over
                        ? " · above the contracted band"
                        : " · inside the band")}
                </title>
                <rect
                  x={x}
                  y={y(d.kWh)}
                  width={barW}
                  height={h}
                  rx={Math.min(4, barW / 2)}
                  fill={
                    d.excluded
                      ? "url(#dev-hatch)"
                      : over
                        ? "var(--chart-mark-alert)"
                        : "var(--chart-mark)"
                  }
                />
              </g>
            );
          })}

          {/* The contracted band, over the marks: behind them it vanished
              entirely on a month where every day sits above it, which is the
              month a reviewer is most likely to be looking at. */}
          <rect
            x={PAD.left}
            y={y(ceiling)}
            width={plotW}
            height={Math.max(0, y(floorKwh) - y(ceiling))}
            fill="var(--chart-rule)"
            opacity="0.14"
          />
          <line x1={PAD.left} x2={W - PAD.right} y1={y(ceiling)} y2={y(ceiling)}
                stroke="var(--chart-rule)" strokeWidth="1" opacity="0.5" />
          <line x1={PAD.left} x2={W - PAD.right} y1={y(floorKwh)} y2={y(floorKwh)}
                stroke="var(--chart-rule)" strokeWidth="1" opacity="0.5" />

          {/* Reference lines LAST, so they read over the marks rather than
              under them, each with a surface-coloured halo and its label on a
              backing plate. Drawn first, the benchmark line and its label
              disappeared behind the bars — which are exactly the thing the
              reader is comparing to it. */}
          <ReferenceLine
            y={y(baselineKwh)}
            x1={PAD.left}
            x2={W - PAD.right}
            label={`Before install ${baselineKwh.toFixed(1)}`}
            dash="2 4"
            weight={1}
            muted
          />
          <ReferenceLine
            y={y(benchmarkKwh)}
            x1={PAD.left}
            x2={W - PAD.right}
            label={`Benchmark ${benchmarkKwh.toFixed(1)} kWh/day`}
            dash="6 4"
            weight={2}
          />

          {/* x axis: first and last day only — a label per bar is noise. */}
          {days.length > 0 && (
            <>
              <text x={PAD.left} y={H - 10} fontSize="10" fill="var(--text-subtle)">
                {days[0].date.slice(8)}
              </text>
              <text x={W - PAD.right} y={H - 10} textAnchor="end" fontSize="10" fill="var(--text-subtle)">
                {days[days.length - 1].date.slice(8)}
              </text>
            </>
          )}
        </svg>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-muted)]">
        <Key swatch="var(--chart-mark)">Inside the band</Key>
        <Key swatch="var(--chart-mark-alert)">
          Above the band{overCount > 0 ? ` · ${overCount} day${overCount === 1 ? "" : "s"}` : ""}
        </Key>
        <Key swatch="url(#dev-hatch)" hatch>
          Excluded from the figure
        </Key>
        {missing > 0 && (
          <span>
            {missing} day{missing === 1 ? "" : "s"} with no reading
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** A reference line that survives being drawn over data. */
function ReferenceLine({
  y,
  x1,
  x2,
  label,
  dash,
  weight,
  muted,
}: {
  y: number;
  x1: number;
  x2: number;
  label: string;
  dash: string;
  weight: number;
  muted?: boolean;
}) {
  const charW = muted ? 5.2 : 5.8;
  const plateW = label.length * charW + 10;
  return (
    <g>
      {/* Halo first: the line reads against a bar as well as against the grid. */}
      <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--surface)" strokeWidth={weight + 2} opacity="0.85" />
      <line
        x1={x1}
        x2={x2}
        y1={y}
        y2={y}
        stroke="var(--chart-rule)"
        strokeWidth={weight}
        strokeDasharray={dash}
        opacity={muted ? 0.7 : 1}
      />
      <rect
        x={x2 - plateW}
        y={y - (muted ? 16 : 18)}
        width={plateW}
        height={muted ? 13 : 15}
        rx="3"
        fill="var(--surface)"
        opacity="0.92"
      />
      <text
        x={x2 - 5}
        y={y - (muted ? 6 : 7)}
        textAnchor="end"
        fontSize={muted ? 10 : 11}
        fill={muted ? "var(--text-subtle)" : "var(--text-muted)"}
      >
        {label}
      </text>
    </g>
  );
}

function Key({ swatch, hatch, children }: { swatch: string; hatch?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-[3px]"
        style={
          hatch
            ? {
                background: "var(--chart-mark-inert)",
                opacity: 0.45,
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent 0 2px, var(--surface) 2px 3px)",
              }
            : { background: swatch }
        }
      />
      {children}
    </span>
  );
}
