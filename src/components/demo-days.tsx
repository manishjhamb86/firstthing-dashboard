"use client";

import { useMemo, useState } from "react";
import { dayAxis, formatDate, monthShort } from "@/lib/format-date";

export type DemoDay = { date: string; kWh: number; phase: "pre" | "post" };

const kwh = (n: number) => n.toFixed(2);

/**
 * The readings behind a demo report, one month at a time (2026-09-26,
 * user-asked): pick a year, then a month, and that month's days show as a
 * chart and a table. It opens on the current month when there are readings
 * in it, otherwise on the latest month that has any — a report whose days
 * all lie in the past would otherwise open on an empty month.
 *
 * The before-installation figure is a single number and lives in the
 * report's headline, so the days are one list. When a report does carry
 * days from both sides of the replacement, each day still says which side
 * it is on, so the two can't be mistaken for one series.
 */
export function DemoDays({ days, preAvg, postAvg }: { days: DemoDay[]; preAvg: number; postAvg: number }) {
  const sorted = useMemo(() => [...days].sort((a, b) => (a.date < b.date ? -1 : 1)), [days]);
  const months = useMemo(() => [...new Set(sorted.map((d) => d.date.slice(0, 7)))], [sorted]);
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))], [months]);
  const bothPhases = sorted.some((d) => d.phase === "pre") && sorted.some((d) => d.phase === "post");

  const now = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(months.includes(now) ? now : (months.at(-1) ?? now));
  const year = month.slice(0, 4);
  const shown = sorted.filter((d) => d.date.startsWith(month));

  if (sorted.length === 0) return null;
  return (
    <div>
      <div className="mb-4 flex flex-col gap-2">
        {years.length > 1 && (
          <nav className="seg" aria-label="Readings year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={y === year ? "on" : undefined}
                aria-pressed={y === year}
                onClick={() => setMonth(months.filter((m) => m.startsWith(y)).at(-1)!)}
              >
                {y}
              </button>
            ))}
          </nav>
        )}
        <nav className="seg seg-sm" aria-label="Readings month">
          {months
            .filter((m) => m.startsWith(year))
            .map((m) => (
              <button
                key={m}
                type="button"
                className={m === month ? "on" : undefined}
                aria-pressed={m === month}
                onClick={() => setMonth(m)}
              >
                {monthShort(m)}
                {years.length === 1 ? ` ${m.slice(2, 4)}` : ""}
              </button>
            ))}
        </nav>
      </div>

      <div className="grid gap-5 @2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DaysChart days={shown} preAvg={preAvg} postAvg={postAvg} />
        <table className="tbl tbl-compact w-full self-start [&_td]:py-1.5">
          <thead>
            <tr>
              <th>Date</th>
              {bothPhases && <th>Side</th>}
              <th className="text-right">kWh</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.date + d.phase}>
                <td className="num" style={{ color: "var(--text-muted)" }}>
                  {formatDate(d.date)}
                </td>
                {bothPhases && (
                  <td className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    {d.phase === "pre" ? "Before" : "After"}
                  </td>
                )}
                <td className="num text-right">{kwh(d.kWh)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="font-semibold">
                {shown.length} day{shown.length === 1 ? "" : "s"}
              </td>
              {bothPhases && <td />}
              <td className="num text-right font-semibold">
                avg {kwh(shown.reduce((n, d) => n + d.kWh, 0) / Math.max(shown.length, 1))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** One month's days as bars, with each side's report average drawn across its bars. */
function DaysChart({ days, preAvg, postAvg }: { days: DemoDay[]; preAvg: number; postAvg: number }) {
  const W = 560;
  const H = 190;
  const top = 24;
  const bottom = 26;
  const padX = 6;
  const unit = (W - padX * 2) / Math.max(days.length, 1);
  const barW = Math.min(unit * 0.72, 38);
  const phases = new Set(days.map((d) => d.phase));
  const avgs = [phases.has("pre") ? preAvg : 0, phases.has("post") ? postAvg : 0];
  const max = Math.max(...avgs, ...days.map((d) => d.kWh), 1) * 1.12;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const xAt = (i: number) => padX + unit * i + unit / 2;
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));

  const avgLine = (phase: "pre" | "post", v: number) => {
    const idx = days.map((d, i) => (d.phase === phase ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) return null;
    const x1 = xAt(idx[0]) - unit / 2 + 2;
    const x2 = xAt(idx[idx.length - 1]) + unit / 2 - 2;
    return (
      <g key={phase}>
        <line x1={x1} x2={x2} y1={y(v)} y2={y(v)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" />
        <text x={x1} y={y(v) - 5} fontSize={10.5} fontWeight={600} fill="var(--text-muted)" className="num">
          avg {kwh(v)} kWh
        </text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily consumption for the selected month">
      <line x1={padX} x2={W - padX} y1={H - bottom} y2={H - bottom} stroke="var(--chart-rule)" />
      {days.map((d, i) => (
        <g key={d.date + d.phase}>
          <title>{`${formatDate(d.date)} · ${kwh(d.kWh)} kWh`}</title>
          <rect
            x={xAt(i) - barW / 2}
            y={y(d.kWh)}
            width={barW}
            height={Math.max(0, H - bottom - y(d.kWh))}
            rx={2}
            fill={d.phase === "pre" ? "var(--chart-mark-inert)" : "var(--chart-mark)"}
          />
          {i % labelEvery === 0 && (
            <text x={xAt(i)} y={H - bottom + 14} textAnchor="middle" fontSize={9.5} fill="var(--text-subtle)">
              {dayAxis(d.date)}
            </text>
          )}
        </g>
      ))}
      {avgLine("pre", preAvg)}
      {avgLine("post", postAvg)}
    </svg>
  );
}
