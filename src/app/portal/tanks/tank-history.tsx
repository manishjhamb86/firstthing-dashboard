"use client";

import { useState } from "react";

/**
 * A tank's recorded levels over a chosen window (user-specified, 2026-08-31:
 * "the period/duration should be selectable… last 24 hours or the whole week,
 * or whole month. and day should be scrolable using left right arrows").
 *
 * Two rules the shape follows:
 *
 *  · **Windows are read in IST, not UTC.** A level is a machine instant, and
 *    this product operates in one zone — the same distinction format-date.ts
 *    already draws. A UTC "day" would cut a resident's day at 05:30.
 *
 *  · **The current window is rolling; older ones snap to the calendar.** The
 *    live view is genuinely the last 24 hours (what was asked for, and what
 *    keeps last night on screen at 09:00), while stepping back lands on whole
 *    days, weeks and months a person can name — "Sat 30 Aug" rather than a
 *    pair of timestamps.
 *
 * The chart draws the min–max envelope per bucket, not an average: these
 * controllers report in 25% steps, so an averaged line would invent levels the
 * sensor never reported. Where a bucket holds one reading the band collapses
 * onto the line by itself.
 */

/** [epoch ms, level 0-100], oldest first. */
export type LevelPoint = [number, number];

type Mode = "day" | "week" | "month";

const DAY = 86_400_000;
const IST_OFF = 330 * 60_000;

const MODES: { id: Mode; label: string; rolling: string }[] = [
  { id: "day", label: "24 hours", rolling: "Last 24 hours" },
  { id: "week", label: "Week", rolling: "Last 7 days" },
  { id: "month", label: "Month", rolling: "Last 30 days" },
];

function istDayStart(ms: number): number {
  return Math.floor((ms + IST_OFF) / DAY) * DAY - IST_OFF;
}
function istWeekStart(ms: number): number {
  const dow = (new Date(ms + IST_OFF).getUTCDay() + 6) % 7; // Monday = 0
  return istDayStart(ms) - dow * DAY;
}
function istMonthStart(ms: number, monthsBack = 0): number {
  const d = new Date(ms + IST_OFF);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1) - IST_OFF;
}
/** Render a moment's IST parts — the same zone every other timestamp uses. */
function ist(ms: number, opts: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", ...opts });
}

type Window = { from: number; to: number; label: string };

function windowFor(mode: Mode, offset: number, now: number): Window {
  if (offset === 0) {
    const len = mode === "day" ? DAY : mode === "week" ? 7 * DAY : 30 * DAY;
    return { from: now - len, to: now, label: MODES.find((m) => m.id === mode)!.rolling };
  }
  if (mode === "day") {
    const from = istDayStart(now) - offset * DAY;
    return {
      from,
      to: from + DAY,
      label: offset === 1 ? "Yesterday" : ist(from, { weekday: "short", day: "numeric", month: "short" }),
    };
  }
  if (mode === "week") {
    const from = istWeekStart(now) - offset * 7 * DAY;
    const to = from + 7 * DAY;
    const a = ist(from, { day: "numeric", month: "short" });
    const b = ist(to - DAY, { day: "numeric", month: "short" });
    return { from, to, label: `${a} – ${b}` };
  }
  const from = istMonthStart(now, offset);
  const to = istMonthStart(from + 40 * DAY, 0);
  return { from, to, label: ist(from, { month: "long", year: "numeric" }) };
}

type Bucket = { min: number; max: number; last: number } | null;

function bucketise(points: LevelPoint[], w: Window, n: number): Bucket[] {
  const out: Bucket[] = new Array(n).fill(null);
  const span = w.to - w.from;
  for (const [t, v] of points) {
    if (t < w.from || t >= w.to) continue;
    const i = Math.min(n - 1, Math.floor(((t - w.from) / span) * n));
    const b = out[i];
    out[i] = b === null ? { min: v, max: v, last: v } : { min: Math.min(b.min, v), max: Math.max(b.max, v), last: v };
  }
  return out;
}

function axisTicks(mode: Mode, w: Window): { at: number; text: string }[] {
  const ticks: { at: number; text: string }[] = [];
  const span = w.to - w.from;
  if (mode === "day") {
    for (let t = Math.ceil(w.from / (6 * 3_600_000)) * 6 * 3_600_000; t < w.to; t += 6 * 3_600_000) {
      ticks.push({ at: (t - w.from) / span, text: ist(t, { hour: "2-digit", minute: "2-digit", hour12: false }) });
    }
  } else if (mode === "week") {
    for (let t = istDayStart(w.from) + DAY; t < w.to; t += DAY) {
      if (t < w.from) continue;
      ticks.push({ at: (t - w.from) / span, text: ist(t, { weekday: "short" }) });
    }
  } else {
    for (let t = istDayStart(w.from) + 5 * DAY; t < w.to; t += 5 * DAY) {
      ticks.push({ at: (t - w.from) / span, text: ist(t, { day: "numeric", month: "short" }) });
    }
  }
  return ticks;
}

export function TankHistory({
  points,
  quiet,
  now,
}: {
  points: LevelPoint[];
  quiet: boolean;
  /** Stamped by the server: a Date.now() here would differ between the
      server render and hydration, and the rolling window would disagree
      with itself for one frame. */
  now: number;
}) {
  const [mode, setMode] = useState<Mode>("day");
  const [offset, setOffset] = useState(0);

  const w = windowFor(mode, offset, now);
  const n = mode === "day" ? 48 : mode === "week" ? 84 : 90;
  // Not memoised: `w` is rebuilt every render, so a dependency array over it
  // would never hit — and bucketing a few thousand points is nothing.
  const buckets = bucketise(points, w, n);

  const inWindow = points.filter(([t]) => t >= w.from && t < w.to);
  const oldest = points.length > 0 ? points[0][0] : null;
  const canGoBack = oldest !== null && oldest < w.from;

  // A left gutter for the scale: without it a flat line near the top and one
  // near the bottom look the same, and the shape is the whole point of the
  // chart. Every quarter is labelled, because the quarters are exactly what
  // this sensor reports — a line sitting on the third gridline should read
  // as 75% without counting rules (user-asked 2026-08-31).
  // The viewBox is sized close to the card's real width on purpose: an SVG
  // scaled 1.8× scales its type with it, and 8px labels rendered at 14 —
  // bigger than the caption underneath them.
  const width = 560;
  const gutter = 26;
  const plotW = width - gutter;
  const height = 88;
  const y = (v: number) => height - (v / 100) * (height - 8) - 4;
  const x = (i: number) => gutter + ((i + 0.5) / n) * plotW;
  const stroke = quiet ? "var(--chart-mark-inert)" : "var(--chart-mark)";

  // The line breaks over a gap in the record rather than bridging it — a
  // straight run across a silent night would be a level nobody reported.
  const segments: string[] = [];
  let cur: string[] = [];
  const band: { i: number; min: number; max: number }[] = [];
  buckets.forEach((b, i) => {
    if (b === null) {
      if (cur.length > 1) segments.push(cur.join(" "));
      cur = [];
      return;
    }
    cur.push(`${cur.length === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(b.last).toFixed(1)}`);
    band.push({ i, min: b.min, max: b.max });
  });
  if (cur.length > 1) segments.push(cur.join(" "));
  const dots = buckets.map((b, i) => (b === null ? null : { x: x(i), y: y(b.last) })).filter(Boolean) as {
    x: number;
    y: number;
  }[];

  const ticks = axisTicks(mode, w);
  const levels = inWindow.map(([, v]) => v);

  const step = (dir: -1 | 1) => setOffset((o) => Math.max(0, o + dir));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="lbl">Level history</p>
        <nav className="seg seg-sm" aria-label="History period">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? "on" : undefined}
              aria-pressed={mode === m.id}
              onClick={() => {
                setMode(m.id);
                setOffset(0);
              }}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          className="tank-nav"
          onClick={() => step(1)}
          disabled={!canGoBack}
          aria-label={`Earlier ${mode === "day" ? "day" : mode}`}
        >
          ‹
        </button>
        <span
          className="num flex-1 text-center text-[12px] font-semibold"
          style={{ color: "var(--text-muted)" }}
          // Pressing an arrow changes only this label and the chart, and a
          // chart announces nothing — so the window is what gets read out.
          aria-live="polite"
        >
          {w.label}
        </span>
        <button
          type="button"
          className="tank-nav"
          onClick={() => step(-1)}
          disabled={offset === 0}
          aria-label={`Later ${mode === "day" ? "day" : mode}`}
        >
          ›
        </button>
      </div>

      {/* The frame is ALWAYS drawn, empty window or not (user-reported
          2026-08-31: "this section is flickering when a day has no data to a
          day when it have data and vice versa"). Swapping a 75px chart for a
          one-line sentence resized the card on every arrow press, so a day
          with nothing recorded keeps the same axes and says so inside them —
          the repo's own ChartPending rule, applied to a window that steps. */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height + 15}`}
          className="block w-full"
          role="img"
          aria-label={`Tank level, ${w.label}`}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <text
              key={`s${v}`}
              x={gutter - 4}
              y={y(v) + 3.5}
              textAnchor="end"
              fontSize={9.5}
              fill="var(--text-subtle)"
            >
              {v}
            </text>
          ))}
          {[0, 25, 50, 75, 100].map((v) => (
            <line
              key={v}
              x1={gutter}
              x2={width}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border-subtle)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {band.map((b) => (
            <rect
              key={b.i}
              x={x(b.i) - plotW / n / 2}
              width={plotW / n}
              y={y(b.max)}
              height={Math.max(1.5, y(b.min) - y(b.max))}
              fill={stroke}
              opacity={0.16}
            />
          ))}
          {segments.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* A window holding a single reading has no line to draw — a dot is
              the only honest mark for one point. */}
          {dots.length === 1 && <circle cx={dots[0].x} cy={dots[0].y} r={3} fill={stroke} />}
          {ticks.map((t) => (
            <text
              key={t.at}
              // Anchored inward near the edges — a centred label on the last
              // tick had half of itself outside the box ("23:3").
              x={t.at > 0.94 ? width : gutter + t.at * plotW}
              y={height + 11}
              textAnchor={t.at > 0.94 ? "end" : t.at < 0.03 ? "start" : "middle"}
              fontSize={10}
              fill="var(--text-subtle)"
            >
              {t.text}
            </text>
          ))}
        </svg>
        {inWindow.length === 0 && (
          <p
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center text-[11px]"
            style={{ height: `${(height / (height + 15)) * 100}%`, color: "var(--text-subtle)" }}
          >
            Nothing recorded in this window
          </p>
        )}
      </div>
      {/* A floor on the line box, not a fixed height: the stats line carries
          .num spans (monospace, a taller strut) and the empty line does not,
          and the two resolved a pixel apart — enough to nudge the card on
          every arrow press. */}
      <p className="mt-1 min-h-[19px] text-[11px]" style={{ color: "var(--text-subtle)" }}>
        {inWindow.length === 0 ? (
          canGoBack ? (
            "There is older history — step back with \u2039."
          ) : (
            "Levels are recorded every half hour."
          )
        ) : (
          <>
            Low <span className="num">{Math.min(...levels)}%</span> · high{" "}
            <span className="num">{Math.max(...levels)}%</span> ·{" "}
            <span className="num">{levels.length}</span> reading{levels.length === 1 ? "" : "s"}
          </>
        )}
      </p>
    </div>
  );
}
