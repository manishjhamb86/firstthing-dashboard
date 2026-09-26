"use client";

import { useMemo, useState } from "react";
import { dayAxis, formatDate, monthLabel, monthShort } from "@/lib/format-date";
import type { LightStage } from "@/lib/light-count-history";
import { benchmarkCeiling, savingsPct, type Exclusion } from "@/lib/circuit-load";

export type MonitoringDay = { date: string; kWh: number; excluded: boolean; baseline: number | null };

const kwh = (n: number) => n.toFixed(2);

/**
 * A circuit's readings in the MONITORING period — after full installation,
 * from the billing start (2026-09-26, user-asked). Not the demo: the demo
 * report keeps its own before/after days.
 *
 * "Before" here is not a series of readings but one figure, the baseline in
 * force, so it sits in the main section and the readings below are a single
 * list. The readings are picked a year, then a month, at a time, opening on
 * the current year and month — always, as asked. Readings arrive by monthly
 * export, so the current month is often still empty; it then says so and
 * offers the latest month that has readings, rather than opening elsewhere.
 */
export function MonitoringReadings({
  days,
  benchmarkPct,
  monitoringFrom,
  stages,
  currentMonth,
  exclusion,
}: {
  days: MonitoringDay[];
  benchmarkPct: number | null;
  monitoringFrom: string | null;
  /** The circuit's light-count stages, to name the count in force that month. */
  stages: LightStage[];
  /** YYYY-MM, from the server, so the server and browser render agree. */
  currentMonth: string;
  /** What stayed on the circuit unreplaced — off both sides of the saving. */
  exclusion?: Exclusion;
}) {
  const sorted = useMemo(() => [...days].sort((a, b) => (a.date < b.date ? -1 : 1)), [days]);
  const withData = useMemo(() => [...new Set(sorted.map((d) => d.date.slice(0, 7)))], [sorted]);
  // The current month is always a tab, even before its readings arrive.
  const months = useMemo(() => [...new Set([...withData, currentMonth])].sort(), [withData, currentMonth]);
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))], [months]);
  const [month, setMonth] = useState(currentMonth);
  const latestWithData = withData.at(-1) ?? null;
  const year = month.slice(0, 4);
  const shown = sorted.filter((d) => d.date.startsWith(month));
  // A 0 kWh day is the vendor's mark for a meter that was offline, not a day
  // of zero use: counting it would read as "100% saved" (CON-45's check-the-
  // meter rule). Shown, but never averaged.
  const offline = (d: MonitoringDay) => d.kWh === 0;
  const counted = shown.filter((d) => !d.excluded && !offline(d));
  const avg = counted.length > 0 ? counted.reduce((n, d) => n + d.kWh, 0) / counted.length : null;
  const baseline = shown.at(-1)?.baseline ?? sorted.at(-1)?.baseline ?? null;
  const lastDay = shown.at(-1)?.date ?? `${month}-28`;
  const lightCount =
    stages.find((s) => (s.from === null || s.from <= lastDay) && (s.to === null || s.to >= lastDay))?.lightCount ??
    stages.at(-1)?.lightCount ??
    null;
  const baselineAvg =
    counted.length > 0 && counted.every((d) => d.baseline !== null)
      ? counted.reduce((n, d) => n + (d.baseline ?? 0), 0) / counted.length
      : null;
  const saved = avg !== null && baselineAvg ? savingsPct(baselineAvg, avg, exclusion) : null;
  const ceiling = (b: number | null) => (b !== null && benchmarkPct !== null ? benchmarkCeiling(b, benchmarkPct, exclusion) : null);

  if (sorted.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        Readings appear here once the first month after billing starts is on record.
      </p>
    );
  }

  return (
    <div className="@container">
      {/* The main section: the single "before" figure and where this month stands. */}
      <div
        className="mb-5 grid gap-px overflow-hidden rounded-[var(--r-md)] border @xl:grid-cols-3"
        style={{ borderColor: "var(--border-subtle)", background: "var(--border-subtle)" }}
      >
        <Fact
          label="Before FirsThing"
          value={baseline !== null ? `${kwh(baseline)} kWh/day` : "—"}
          detail={
            lightCount !== null
              ? `for ${lightCount.toLocaleString("en-IN")} lights in ${monthLabel(month)}`
              : "the baseline in force"
          }
        />
        <Fact
          label={`Average · ${monthLabel(month)}`}
          value={avg !== null ? `${kwh(avg)} kWh/day` : "—"}
          detail={`${counted.length} day${counted.length === 1 ? "" : "s"} counted`}
        />
        <Fact
          label="Saved"
          value={saved !== null ? `${saved.toFixed(1)}%` : "—"}
          detail={benchmarkPct !== null ? `agreed ${benchmarkPct.toFixed(2)}%` : "against the baseline in force"}
          tone={saved !== null && benchmarkPct !== null ? (saved >= benchmarkPct ? "ok" : "warn") : undefined}
        />
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {years.length > 1 && (
          <nav className="seg" aria-label="Readings year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={y === year ? "on" : undefined}
                aria-pressed={y === year}
                onClick={() =>
                  setMonth(
                    y === currentMonth.slice(0, 4)
                      ? currentMonth
                      : (withData.filter((m) => m.startsWith(y)).at(-1) ?? months.filter((m) => m.startsWith(y)).at(-1)!),
                  )
                }
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

      {shown.length === 0 ? (
        <div
          className="rounded-[var(--r-md)] border border-dashed p-5 text-[13px]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {`No readings for ${monthLabel(month)} yet — they arrive with the month's meter export.`}
          {latestWithData && latestWithData !== month && (
            <>
              {" "}
              <button type="button" className="font-semibold underline" onClick={() => setMonth(latestWithData)}>
                See {monthLabel(latestWithData)}
              </button>
            </>
          )}
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        <DaysChart days={shown} ceilingOf={ceiling} />
        {/* A month is up to 31 rows: read down columns rather than one long
            table beside a short chart, which left half the card empty. */}
        <ul className="columns-2 gap-x-6 @xl:columns-3 @3xl:columns-4">
          {shown.map((d) => (
            <li
              key={d.date}
              className="flex break-inside-avoid items-baseline justify-between gap-3 border-b py-1.5 text-[13px]"
              style={{ borderColor: "var(--border-subtle)", color: d.excluded ? "var(--text-subtle)" : undefined }}
              title={d.excluded ? "Not counted in the month's average" : undefined}
            >
              <span className="num" style={{ color: "var(--text-muted)" }}>
                {formatDate(d.date)}
              </span>
              {offline(d) ? (
                <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  no reading
                </span>
              ) : (
                <span className={`num font-semibold ${d.excluded ? "font-normal line-through" : ""}`}>{kwh(d.kWh)}</span>
              )}
            </li>
          ))}
        </ul>
        {shown.some(offline) && (
          <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
            &ldquo;No reading&rdquo; marks a day the meter reported nothing; it is left out of the average.
          </p>
        )}
        {shown.some((d) => d.excluded) && (
          <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
            Struck-through days are not counted in the month&apos;s average.
          </p>
        )}
      </div>
      )}
      {monitoringFrom && (
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-subtle)" }}>
          Monitoring since billing started on {formatDate(monitoringFrom)}.
        </p>
      )}
    </div>
  );
}

function Fact({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "ok" | "warn" }) {
  return (
    <div className="p-4" style={{ background: "var(--surface)" }}>
      <p className="lbl mb-1.5">{label}</p>
      <p
        className="num text-[20px] font-bold leading-none"
        style={tone ? { color: tone === "ok" ? "var(--ok-fg)" : "var(--warn-fg)" } : undefined}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
        {detail}
      </p>
    </div>
  );
}

/**
 * One month's days as bars, with the benchmark ceiling — the most the circuit
 * may draw and still meet the agreed saving — as the reference line. The
 * baseline itself sits far above these bars and would flatten them, so it is
 * stated in the main section instead of drawn.
 */
function DaysChart({ days, ceilingOf }: { days: MonitoringDay[]; ceilingOf: (b: number | null) => number | null }) {
  const W = 560;
  const H = 190;
  const top = 24;
  const bottom = 26;
  const padX = 6;
  const unit = (W - padX * 2) / Math.max(days.length, 1);
  const barW = Math.min(unit * 0.72, 38);
  const ceilings = days.map((d) => ceilingOf(d.baseline));
  const max = Math.max(...days.map((d) => d.kWh), ...ceilings.map((c) => c ?? 0), 1) * 1.12;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const xAt = (i: number) => padX + unit * i + unit / 2;
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));
  const lastCeiling = ceilings.filter((c): c is number => c !== null).at(-1) ?? null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily consumption for the selected month">
      <line x1={padX} x2={W - padX} y1={H - bottom} y2={H - bottom} stroke="var(--chart-rule)" />
      {days.map((d, i) => (
        <g key={d.date}>
          <title>{`${formatDate(d.date)} · ${kwh(d.kWh)} kWh${d.excluded ? " · not counted" : ""}`}</title>
          <rect
            x={xAt(i) - barW / 2}
            y={y(d.kWh)}
            width={barW}
            height={Math.max(0, H - bottom - y(d.kWh))}
            rx={2}
            fill={d.excluded ? "var(--chart-mark-inert)" : "var(--chart-mark)"}
          />
          {i % labelEvery === 0 && (
            <text x={xAt(i)} y={H - bottom + 14} textAnchor="middle" fontSize={9.5} fill="var(--text-subtle)">
              {dayAxis(d.date)}
            </text>
          )}
        </g>
      ))}
      {/* The ceiling as a step line: a light-count change moves it from its own date. */}
      {days.map((d, i) => {
        const c = ceilings[i];
        if (c === null) return null;
        return (
          <line
            key={`c-${d.date}`}
            x1={xAt(i) - unit / 2}
            x2={xAt(i) + unit / 2}
            y1={y(c)}
            y2={y(c)}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })}
      {lastCeiling !== null && (
        <text x={padX + 2} y={y(ceilings.find((c) => c !== null) ?? lastCeiling) - 5} fontSize={10.5} fontWeight={600} fill="var(--text-muted)" className="num">
          at most {kwh(ceilings.find((c) => c !== null) ?? lastCeiling)} kWh to meet the benchmark
        </text>
      )}
    </svg>
  );
}
