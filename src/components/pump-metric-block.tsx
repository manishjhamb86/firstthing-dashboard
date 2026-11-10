import type { ReactNode } from "react";
import { dayAxis } from "@/lib/format-date";
import { metricSummary } from "@/lib/pump-room-view";

/**
 * One pump-room metric, read on a phone: yesterday's figure, how it sits
 * against the last week, and the last days drawn underneath — the chart IS
 * the tile (2026-11-10, the researched redesign that replaced four stat
 * tiles plus separate hover-driven charts; a phone cannot hover, so nothing
 * here depends on it, and the day-by-day table beside it carries every
 * number). Hook-free so both the admin page and the portal render it as a
 * Server Component.
 *
 * `bars` is for a quantity (kWh/day, KL/day): drawn from zero, as a bar must
 * be. `line` is for a ratio (kWh per KL): a fitted axis, read by slope, with
 * an optional reference band shaded where it falls — the axis is labelled so
 * the non-zero start is plain.
 */
export function PumpMetricBlock({
  label,
  unit,
  decimals,
  days,
  points,
  kind,
  color,
  band,
  note,
  approximateFirst = false,
  tone,
}: {
  label: string;
  unit: string;
  decimals: number;
  /** YYYY-MM-DD, oldest first, same length as `points`. */
  days: string[];
  points: (number | null)[];
  kind: "bars" | "line";
  /** A CSS color — a chart token such as `var(--chart-mark)`. */
  color: string;
  band?: { low: number; high: number; label: string };
  note?: ReactNode;
  /** The oldest day is its own opening-to-closing span, not a diff — drawn hollow. */
  approximateFirst?: boolean;
  /** Tints the headline when the latest figure needs a look (e.g. above the band). */
  tone?: "warn";
}) {
  const s = metricSummary(days, points);
  const fmt = (v: number) => v.toFixed(decimals);
  const n = days.length;

  const w = 330;
  const plotH = 80;
  const h = 98;
  const slot = w / Math.max(1, n);
  const cx = (i: number) => i * slot + slot / 2;
  const present = points.filter((v): v is number => v !== null);
  const dMax = present.length ? Math.max(...present) : 0;
  const dMin = present.length ? Math.min(...present) : 0;

  let lo = 0;
  let hi = 1;
  let step = 1;
  if (kind === "bars") {
    step = niceStep(Math.max(dMax * 1.08, 1e-9) / 4);
    hi = Math.max(step, Math.ceil((dMax * 1.08) / step) * step);
  } else {
    const span = dMax - dMin || dMax * 0.1 || 0.1;
    step = niceStep((span * 1.9) / 3);
    lo = Math.max(0, Math.floor((dMin - span * 1.5) / step) * step);
    hi = Math.ceil((dMax + span * 0.4) / step) * step;
    if (hi <= lo) hi = lo + step;
  }
  const y = (v: number) => plotH - ((v - lo) / (hi - lo)) * plotH;

  const gridValues: number[] = [];
  for (let g = Math.ceil(lo / step) * step; g <= hi + 1e-9; g += step) gridValues.push(+g.toFixed(6));

  const bandTop = band ? Math.min(hi, band.high) : null;
  const bandBottom = band ? Math.max(lo, band.low) : null;
  const bandVisible = band !== undefined && bandTop !== null && bandBottom !== null && bandTop > bandBottom;

  const linePath = (() => {
    let d = "";
    let started = false;
    points.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${cx(i).toFixed(1)} ${y(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  })();

  const ariaValues = points.map((v) => (v === null ? "no figure" : fmt(v))).join(", ");

  return (
    <section className="card flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="lbl">{label}</span>
        {s.latestDay && (
          <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
            latest · {dayAxis(s.latestDay)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="num text-[28px] font-extrabold leading-none" style={tone === "warn" ? { color: "var(--warn-fg)" } : undefined}>
          {s.latest === null ? "—" : fmt(s.latest)}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>
          {unit}
        </span>
        {s.avg7 !== null && s.deltaPct !== null && (
          <span className="num ml-auto text-[12px]" style={{ color: "var(--text-muted)" }}>
            {s.deltaPct >= 0 ? "+" : "−"}
            {Math.abs(s.deltaPct).toFixed(0)}% vs 7-day avg <span style={{ color: "var(--text)" }}>{fmt(s.avg7)}</span>
          </span>
        )}
      </div>

      {n > 0 && (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${label}, ${dayAxis(days[0])} to ${dayAxis(days[n - 1])}: ${ariaValues} ${unit}.${s.avg7 !== null ? ` 7-day average ${fmt(s.avg7)}.` : ""}${bandVisible ? ` ${band!.label}.` : ""}`}
        >
          {bandVisible && (
            <>
              <rect x={0} y={y(bandTop!)} width={w} height={y(bandBottom!) - y(bandTop!)} fill="var(--warn-bg)" />
              <line x1={0} x2={w} y1={y(bandTop!)} y2={y(bandTop!)} stroke="var(--warn-line)" strokeWidth={1} />
              <text x={2} y={Math.min(plotH - 4, y(bandBottom!) - 4)} fontSize={9} fontWeight={600} fill="var(--warn-fg)">
                {band!.label}
              </text>
            </>
          )}

          {kind === "line" &&
            gridValues.map((g) => (
              <g key={g}>
                {Math.abs(g - lo) > 1e-9 && <line x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="var(--border-subtle)" strokeWidth={1} />}
                <text x={w} y={y(g) - 3} textAnchor="end" fontSize={9} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
                  {fmt(g)}
                </text>
              </g>
            ))}

          {kind === "bars" &&
            points.map((v, i) =>
              v === null ? null : (
                <rect
                  key={i}
                  x={i * slot + 3}
                  y={y(v)}
                  width={Math.max(2, slot - 6)}
                  height={plotH - y(v)}
                  rx={3}
                  fill={approximateFirst && i === 0 ? "var(--surface)" : color}
                  fillOpacity={approximateFirst && i === 0 ? 1 : i === n - 1 ? 1 : 0.35}
                  stroke={approximateFirst && i === 0 ? color : "none"}
                  strokeWidth={1.5}
                  strokeDasharray={approximateFirst && i === 0 ? "3 2" : undefined}
                />
              ),
            )}

          {s.avg7 !== null && (
            <>
              <line x1={0} x2={w} y1={y(s.avg7)} y2={y(s.avg7)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" />
              {kind === "bars" && (
                <text x={w} y={y(s.avg7) - 3.5} textAnchor="end" fontSize={9} fill="var(--text-muted)" fontFamily="ui-monospace, Menlo, monospace">
                  avg {fmt(s.avg7)}
                </text>
              )}
            </>
          )}

          {kind === "line" && (
            <>
              <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={cx(i)}
                    cy={y(v)}
                    r={i === n - 1 ? 4.5 : 3}
                    fill={i === n - 1 ? color : "var(--surface)"}
                    stroke={i === n - 1 ? "var(--surface)" : color}
                    strokeWidth={2}
                    strokeDasharray={approximateFirst && i === 0 ? "2 1.5" : undefined}
                  />
                ),
              )}
            </>
          )}

          <line x1={0} x2={w} y1={plotH} y2={plotH} stroke="var(--border)" strokeWidth={1} />
          <text x={0} y={h - 4} fontSize={9.5} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
            {dayAxis(days[0])}
            {approximateFirst ? " ≈" : ""}
          </text>
          {n > 2 && (
            <text x={w / 2} y={h - 4} textAnchor="middle" fontSize={9.5} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
              {dayAxis(days[Math.floor((n - 1) / 2)])}
            </text>
          )}
          {n > 1 && (
            <text x={w} y={h - 4} textAnchor="end" fontSize={9.5} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
              {dayAxis(days[n - 1])}
            </text>
          )}
        </svg>
      )}

      {note && (
        <p className="text-[12px] leading-[1.45]" style={{ color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
    </section>
  );
}

/** 1 / 2 / 5 × 10ⁿ — the step just above `raw`. */
function niceStep(raw: number): number {
  const mag = 10 ** Math.floor(Math.log10(raw));
  const m = raw / mag;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * mag;
}
