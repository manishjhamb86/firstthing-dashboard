"use client";

import { useState } from "react";
import { formatInstant, timeAgo } from "@/lib/format-date";

export type HistoryPoint = { at: string; level: number };

/**
 * The sampled level history, one dot per reading.
 *
 * Interactive rather than a static SVG because the question people actually
 * ask of this chart is "when did that reading arrive" — a flat line of
 * identical values is either a calm tank or a silent sensor, and only the
 * timestamps tell you which (user-asked 2026-08-25).
 *
 * Hover is not the only way in: every point carries a <title>, so a
 * screen reader and a touch device get the same fact without a pointer.
 */
export function TankHistoryChart({ points }: { points: HistoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Not enough samples yet — the background job records one every 30 minutes; the chart appears
        once a few exist.
      </p>
    );
  }

  const w = 960;
  const h = 190;
  const padL = 34;
  const padR = 12;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padB;

  const times = points.map((p) => new Date(p.at).getTime());
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const span = Math.max(1, t1 - t0);
  const x = (i: number) => padL + ((times[i] - t0) / span) * plotW;
  const y = (v: number) => plotH - (v / 100) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.level).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${plotH} L${x(0).toFixed(1)} ${plotH} Z`;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block w-full"
          style={{ minWidth: 520 }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={padL - 6} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
                {g}%
              </text>
            </g>
          ))}

          <path d={area} fill="var(--chart-mark)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--chart-mark)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* One dot per reading — the point of the chart is that each of
              these is a moment the sensor spoke. */}
          {points.map((p, i) => (
            <g key={p.at + i}>
              <circle
                cx={x(i)}
                cy={y(p.level)}
                r={hover === i ? 5 : 3}
                fill="var(--surface)"
                stroke="var(--chart-mark)"
                strokeWidth={2}
              />
              {/* A generous invisible target: 3px dots are not hoverable. */}
              <rect
                x={x(i) - Math.max(8, plotW / points.length / 2)}
                y={0}
                width={Math.max(16, plotW / points.length)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <title>{`${p.level}% · ${formatInstant(new Date(p.at))} · ${timeAgo(new Date(p.at))}`}</title>
              </rect>
            </g>
          ))}

          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={0}
              y2={plotH}
              stroke="var(--chart-mark)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
          )}

          <line x1={padL} x2={w - padR} y1={plotH} y2={plotH} stroke="var(--border)" strokeWidth={1.5} />
          <text x={padL} y={h - 5} fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
            {formatInstant(new Date(points[0].at))}
          </text>
          <text x={w - padR} y={h - 5} textAnchor="end" fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace, Menlo, monospace">
            {formatInstant(new Date(points[points.length - 1].at))}
          </text>
        </svg>
      </div>

      {/* The readout sits outside the SVG so it can use real type and wrap
          like everything else on the page. */}
      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-sm)] border px-3 py-2 text-[13px]"
        style={{
          borderColor: active ? "var(--accent-line)" : "var(--border-subtle)",
          background: active ? "var(--accent-subtle)" : "var(--surface-sunken)",
        }}
        aria-live="polite"
      >
        {active ? (
          <>
            <span className="num text-base font-bold">{active.level}%</span>
            <span className="num" style={{ color: "var(--text-muted)" }}>
              {formatInstant(new Date(active.at))}
            </span>
            <span style={{ color: "var(--text-subtle)" }}>{timeAgo(new Date(active.at))}</span>
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>
            {points.length} readings — hover a point to see when it arrived.
          </span>
        )}
      </div>
    </div>
  );
}
