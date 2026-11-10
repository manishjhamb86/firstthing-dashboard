"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format-date";

export type TrendSeries = {
  key: string;
  label: string;
  color: string;
  /** One value per day, same length/order as `days` — what gets PLOTTED. Null breaks the line over that gap rather than bridging it. */
  points: (number | null)[];
  /** The real figure behind an indexed/normalised point, shown alongside it
      on hover so consolidating several units onto one shared axis never
      hides the actual number (dataviz skill: "a tooltip enhances, it
      never gates" — every value stays reachable). Omit when `points`
      already IS the real figure. */
  rawPoints?: (number | null)[];
  rawUnit?: string;
  rawDecimals?: number;
};

/** Rounds a chart's top to a clean step (0 / step / 2·step / …) rather than the raw max. */
function niceTop(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) {
    const step = s * magnitude;
    if (Math.ceil(max / step) * step >= max && max / (step * 4) <= 1) return Math.ceil(max / step) * step;
  }
  return Math.ceil(max / magnitude) * magnitude;
}

/**
 * A multi-series day-over-day line chart — the house pattern established by
 * TankHistoryChart (crosshair + a readout strip OUTSIDE the SVG, so it can
 * use real type and wrap, rather than a floating tooltip), extended to
 * carry more than one series at once: every series' value at the hovered
 * day is listed together, keyed by a short stroke of its own color rather
 * than a filled swatch (2026-11-10, replacing bars for pump-room trends —
 * a day-over-day figure is a trend, which a line shows and a bar does not).
 */
export function TrendChart({
  days,
  series,
  unit,
  decimals = 1,
}: {
  /** YYYY-MM-DD, oldest first. */
  days: string[];
  series: TrendSeries[];
  unit?: string;
  /** How many decimal places to show — a plain number, not a formatter
      function: this component is a Client Component, and a Server
      Component page cannot pass a function prop across that boundary
      (found by deploying, 2026-11-10 — "Functions cannot be passed
      directly to Client Components"). */
  decimals?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = (v: number) => v.toFixed(decimals);

  if (days.length < 2) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        A trend appears once there are at least two days.
      </p>
    );
  }

  const w = 960;
  const h = 220;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const bottom = padT + plotH;

  const allValues = series.flatMap((s) => s.points.filter((v): v is number => v !== null));
  const top = niceTop(Math.max(0.0001, ...allValues));
  const x = (i: number) => padL + (days.length === 1 ? 0 : (i / (days.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / top) * plotH;

  function pathFor(points: (number | null)[]): string {
    let d = "";
    let started = false;
    points.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  }

  const gridSteps = [0, top / 4, top / 2, (3 * top) / 4, top];

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ minWidth: 400 }} onMouseLeave={() => setHover(null)}>
          {gridSteps.map((g) => (
            <g key={g}>
              <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={padL - 6} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
                {fmt(g)}
              </text>
            </g>
          ))}

          {series.map((s) => (
            <g key={s.key}>
              <path d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={hover === i ? 5 : 3.5}
                    fill="var(--surface)"
                    stroke={s.color}
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          ))}

          {/* One generous hit column per day — the crosshair finds the day, not a 2px line. */}
          {days.map((d, i) => (
            <rect
              key={d}
              x={x(i) - Math.max(8, plotW / days.length / 2)}
              y={0}
              width={Math.max(16, plotW / days.length)}
              height={bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <title>
                {formatDate(d)}:{" "}
                {series
                  .map((s) => {
                    const plotted = s.points[i] === null ? "—" : `${fmt(s.points[i]!)}${unit ? ` ${unit}` : ""}`;
                    const raw = s.rawPoints && s.rawPoints[i] !== null ? ` (${s.rawPoints[i]!.toFixed(s.rawDecimals ?? 1)}${s.rawUnit ? ` ${s.rawUnit}` : ""})` : "";
                    return `${s.label} ${plotted}${raw}`;
                  })
                  .join(" · ")}
              </title>
            </rect>
          ))}

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={bottom} stroke="var(--chart-rule)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          )}

          <line x1={padL} x2={w - padR} y1={bottom} y2={bottom} stroke="var(--border)" strokeWidth={1.5} />
          <text x={padL} y={h - 5} fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
            {formatDate(days[0])}
          </text>
          <text x={w - padR} y={h - 5} textAnchor="end" fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
            {formatDate(days[days.length - 1])}
          </text>
        </svg>
      </div>

      {/* A legend box is only earned once there's more than one color to key
          (marks-and-anatomy.md: "a single series needs no legend box"). */}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* The readout sits outside the SVG so it can use real type and wrap —
          min-h reserves the active state's taller line so the card doesn't
          grow on hover (the same lesson TankHistoryChart already learned). */}
      <div
        className="mt-2 flex min-h-[42px] flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--r-sm)] border px-3 py-2 text-[13px] leading-6"
        style={{
          borderColor: hover !== null ? "var(--accent-line)" : "var(--border-subtle)",
          background: hover !== null ? "var(--accent-subtle)" : "var(--surface-sunken)",
        }}
        aria-live="polite"
      >
        {hover !== null ? (
          <>
            <span className="num" style={{ color: "var(--text-muted)" }}>
              {formatDate(days[hover])}
            </span>
            {series.map((s) => {
              const raw = s.rawPoints?.[hover] ?? null;
              return (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4" style={{ background: s.color }} />
                  <span className="num text-base font-bold leading-6">{s.points[hover] === null ? "—" : fmt(s.points[hover]!)}</span>
                  {unit && <span style={{ color: "var(--text-subtle)" }}>{unit}</span>}
                  {raw !== null && (
                    <span className="num" style={{ color: "var(--text-subtle)" }}>
                      ({raw.toFixed(s.rawDecimals ?? 1)}
                      {s.rawUnit ? ` ${s.rawUnit}` : ""})
                    </span>
                  )}
                  {series.length > 1 && <span style={{ color: "var(--text-subtle)" }}>{s.label}</span>}
                </span>
              );
            })}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>{days.length} days — hover (or tab to) a point to see its value.</span>
        )}
      </div>
    </div>
  );
}
