import type { ReactNode } from "react";
import { Card, CardTitle, StatusChip, type ChipTone } from "@/components/ui";
import type { MeterRow } from "@/lib/meter-view";

/**
 * The meter presentation shared by the back office and a society's own
 * portal. Hook-free on purpose, so both Server Components render it directly
 * and neither surface can drift into describing a meter differently.
 *
 * The rule running through all of it: a figure is never shown without its
 * age. A meter unreachable for three hours still has a last known reading
 * worth seeing — presenting it as the current one is what turns a stale
 * number into a decision.
 */

const STATE_META: Record<string, { label: string; tone: ChipTone }> = {
  reporting: { label: "Reporting", tone: "ok" },
  silent: { label: "Not reporting", tone: "warn" },
  offline: { label: "Offline", tone: "bad" },
};

/**
 * ONE sentence about the figures, covering both how old they are and whether
 * the meter is still answering.
 *
 * It was two — a freshness line and a state hint — and they contradicted each
 * other on screen: "Last known, read 16 min ago. These are not current
 * figures." sat directly above "Answering and sending fresh readings." Two
 * independent sentences about one fact will eventually disagree, so there is
 * one now, and its shape makes disagreement impossible.
 */
function readingCaption(meter: MeterRow): { text: string; warn: boolean } {
  if (meter.readAt === null) return { text: "This meter has not been read yet.", warn: false };
  if (meter.state === "offline") {
    return {
      text: `Last known, read ${meter.readAge}. The meter is not reachable, so these are not current figures.`,
      warn: true,
    };
  }
  if (meter.state === "silent") {
    return {
      text: `Last known, read ${meter.readAge}. The meter is connected but has stopped sending, so these are not current figures.`,
      warn: true,
    };
  }
  if (meter.stale) {
    return {
      text: `Read ${meter.readAge}. The hourly check has not run since — read it now for the current figures.`,
      warn: true,
    };
  }
  return { text: `Read ${meter.readAge} from the meter itself.`, warn: false };
}

export function MeterStateChip({ state }: { state: string | null }) {
  if (!state) return <StatusChip tone="neu">Unassigned</StatusChip>;
  const meta = STATE_META[state];
  if (!meta) return <StatusChip tone="neu">{state}</StatusChip>;
  return <StatusChip tone={meta.tone}>{meta.label}</StatusChip>;
}

/**
 * A 24h power sparkline — a value beside its trajectory, which is what makes
 * a fleet row readable at a glance. Renders nothing under 3 points: two
 * samples draw a line that claims a trend no data supports.
 */
export const SPARKLINE_WIDTH = 96;
export const SPARKLINE_MIN_POINTS = 3;

export function Sparkline({ values, muted = false }: { values: number[]; muted?: boolean }) {
  const w = SPARKLINE_WIDTH;
  const h0 = 26;
  if (values.length < SPARKLINE_MIN_POINTS) {
    // The slot is ALWAYS drawn, so the figure beside it never moves when a
    // meter has too few reads to trend (user-reported 2026-08-28: one row's
    // wattage sat right, its neighbours' sat left). Dashed, not solid — a
    // flat solid line would read as a real reading of zero.
    return (
      <svg
        viewBox={`0 0 ${w} ${h0}`}
        style={{ width: w, height: h0, display: "block" }}
        role="img"
        aria-label={`Not enough reads to draw a trend — ${values.length} so far, ${SPARKLINE_MIN_POINTS} needed`}
      >
        <title>{`Not enough reads to draw a trend — ${values.length} of ${SPARKLINE_MIN_POINTS} hourly reads so far`}</title>
        <line
          x1="0"
          y1={h0 / 2}
          x2={w}
          y2={h0 / 2}
          stroke="var(--border)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
      </svg>
    );
  }
  const h = 26;
  const max = Math.max(...values) || 1;
  const pts = values
    .map((v, i) => `${((i * w) / (values.length - 1)).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`)
    .join(" ");
  const last = values[values.length - 1];
  const stroke = muted ? "var(--chart-mark-inert)" : "var(--signal)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: "block" }} aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={w} cy={h - 2 - (last / max) * (h - 6)} r="2.4" fill={stroke} />
    </svg>
  );
}

/**
 * Power now against everything the circuit could draw at once. The scale is
 * the connected load in WATTS (Σ count × wattage) — the instantaneous twin
 * of the daily kWh ceiling the alerts use.
 */
function PowerGauge({ powerW, connectedLoadW }: { powerW: number; connectedLoadW: number }) {
  const size = 190;
  const c = size / 2;
  const r = c - 13;
  const a0 = 135;
  const sweep = 270;
  const frac = Math.min(1, Math.max(0, powerW / connectedLoadW));
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)] as const;
  };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = pt(a0 + sweep * f0);
    const [x1, y1] = pt(a0 + sweep * f1);
    const large = sweep * (f1 - f0) > 180 ? 1 : 0;
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const ticks = Array.from({ length: 28 }, (_, i) => {
    const f = i / 27;
    const rad = ((a0 + sweep * f) * Math.PI) / 180;
    return {
      x1: c + (r - 12) * Math.cos(rad),
      y1: c + (r - 12) * Math.sin(rad),
      x2: c + (r - 7) * Math.cos(rad),
      y2: c + (r - 7) * Math.sin(rad),
      on: f <= frac,
    };
  });
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: "block" }} aria-hidden>
        <path d={arc(0, 1)} fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        {frac > 0.005 && (
          <path d={arc(0, frac)} fill="none" stroke="var(--signal)" strokeWidth="8" strokeLinecap="round" />
        )}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.on ? "var(--signal)" : "var(--border)"}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div
        style={{ position: "absolute", inset: 0 }}
        className="flex flex-col items-center justify-center gap-0.5"
      >
        <span className="num text-[30px] font-semibold leading-none">{powerW.toFixed(1)}</span>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          watts now
        </span>
      </div>
    </div>
  );
}

/** A slim progress track — today's kWh against the circuit's daily ceiling. */
export function CeilingBar({ value, ceiling }: { value: number; ceiling: number }) {
  const pct = Math.max(3, Math.min(100, (value / ceiling) * 100));
  return (
    <div className="relative h-1.5 rounded-full" style={{ background: "var(--border)" }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct.toFixed(0)}%`, background: "var(--signal)" }}
      />
    </div>
  );
}

/**
 * The daily trend, one bar per day. This is where a change in the circuit's
 * life reads at a glance — a retrofit is a cliff in this chart — while the
 * heatmap below answers WHEN within each day. A partial day is amber, never
 * a short blue bar: a short bar reads as a quiet day, which a partial day
 * is not evidence of.
 */
export function DailyBars({
  days,
}: {
  days: { day: string; total: number; intervalCount: number }[];
}) {
  const shown = [...days].reverse(); // oldest first
  const peak = Math.max(0.0001, ...shown.map((d) => d.total));
  const complete = shown.filter((d) => d.intervalCount === 24);
  const avg = complete.length > 0 ? complete.reduce((s, d) => s + d.total, 0) / complete.length : null;
  const H = 150;
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-2" style={{ minWidth: 520, height: H + 46, paddingTop: 18 }}>
          {shown.map((d) => {
            const h = Math.max(3, (d.total / peak) * H);
            const partial = d.intervalCount < 24;
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="num text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {d.total.toFixed(1)}
                </span>
                <div
                  title={
                    partial
                      ? `${d.day} — ${d.total.toFixed(2)} kWh over ${d.intervalCount} of 24 hours`
                      : `${d.day} — ${d.total.toFixed(2)} kWh`
                  }
                  className="w-full rounded-[4px]"
                  style={{
                    height: h,
                    background: partial ? "var(--warn-fg)" : "var(--chart-mark)",
                    opacity: partial ? 0.75 : 1,
                  }}
                />
                <span className="num text-[10px] tabular-nums" style={{ color: "var(--text-subtle)" }}>
                  {d.day.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]" style={{ color: "var(--text-subtle)" }}>
        {avg !== null && (
          <span>
            average complete day <span className="num font-semibold">{avg.toFixed(2)}</span> kWh
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--chart-mark)" }} />
          complete day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--warn-fg)", opacity: 0.75 }} />
          partial day
        </span>
      </div>
    </div>
  );
}

/**
 * What the meter is reading right now — the one thing the vendor API is used
 * for. The heading carries the age of the figures, not each tile, so the
 * reader cannot take one of them as live while another is old.
 */
export function MeterReadout({ meter, action }: { meter: MeterRow; action?: ReactNode }) {
  const caption = readingCaption(meter);
  const hasGauge = meter.powerW !== null && meter.connectedLoadW !== null && meter.connectedLoadW > 0;
  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <CardTitle>Live reading</CardTitle>
          <p
            className="mt-1 text-[13px]"
            style={{ color: caption.warn ? "var(--warn-fg)" : "var(--text-muted)" }}
          >
            {caption.text}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Power now, against everything the circuit could draw at once. */}
        {/* flex-1 on the text column gives it a zero flex-basis, so the line
            can never overflow on a wide screen and wrap is left for phones —
            the wrap that put V/A/PF under the gauge came from the column
            sizing to its caption's full unwrapped width. */}
        <div
          className="flex flex-wrap items-center gap-6 rounded-[var(--r-md)] p-5"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
        >
          {hasGauge ? (
            <PowerGauge powerW={meter.powerW!} connectedLoadW={meter.connectedLoadW!} />
          ) : (
            <div className="py-6">
              <span className="num text-[34px] font-semibold leading-none">
                {meter.powerW === null ? "—" : meter.powerW.toFixed(1)}
              </span>
              <span className="ml-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                W now
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1 flex flex-col gap-3" style={{ minWidth: 130 }}>
            <p className="lbl" style={{ color: "var(--ok-fg)" }}>
              Power now
            </p>
            <div className="num flex flex-col gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
              <span>{meter.voltageV === null ? "—" : meter.voltageV.toFixed(1)} <span style={{ color: "var(--text-subtle)" }}>V</span></span>
              <span>{meter.currentA === null ? "—" : meter.currentA.toFixed(2)} <span style={{ color: "var(--text-subtle)" }}>A</span></span>
              {meter.powerW !== null && meter.voltageV !== null && meter.currentA !== null && meter.voltageV * meter.currentA > 0 && (
                <span>{(meter.powerW / (meter.voltageV * meter.currentA)).toFixed(2)} <span style={{ color: "var(--text-subtle)" }}>PF</span></span>
              )}
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {hasGauge
                ? `${Math.round((meter.powerW! / meter.connectedLoadW!) * 100)}% of the ${(meter.connectedLoadW! / 1000).toFixed(2)} kW this circuit can draw`
                : "no load inventory to give this a scale"}
            </p>
          </div>
        </div>

        {/* The meter's own counters, each against what would make it an alert. */}
        <div
          className="flex flex-col justify-between gap-4 rounded-[var(--r-md)] p-5"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
        >
          <div>
            <p className="lbl mb-2.5">Energy counters</p>
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="num text-[28px] font-semibold leading-none">
                {meter.dayKwh === null ? "—" : meter.dayKwh.toFixed(2)}
              </span>
              <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                kWh today so far
              </span>
            </p>
            {meter.dayKwh !== null && meter.capacityKwh !== null ? (
              <div className="mt-3">
                <CeilingBar value={meter.dayKwh} ceiling={meter.capacityKwh} />
                <div className="mt-1.5 flex justify-between text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  <span>{Math.round((meter.dayKwh / meter.capacityKwh) * 100)}% of the daily ceiling</span>
                  <span className="num">{meter.capacityKwh.toFixed(2)} kWh</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                {meter.dayKwh === null ? "the meter reported no day counter" : "no load inventory to compare against"}
              </p>
            )}
          </div>
          <div
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-3.5"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="flex items-baseline gap-2">
              <span className="num text-[19px] font-semibold leading-none">
                {meter.monthKwh === null ? "—" : meter.monthKwh.toFixed(1)}
              </span>
              <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                kWh this month · the meter&rsquo;s own counter
              </span>
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {meter.hourlyCount > 0 ? (
                <>
                  <span className="num font-semibold" style={{ color: "var(--text-muted)" }}>
                    {meter.hourlyCount.toLocaleString()}
                  </span>{" "}
                  hours of history · {meter.hourlyFrom} → {meter.hourlyTo}
                </>
              ) : (
                "no exported history yet"
              )}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Open alerts, most recent first. Nothing is invented when there are none. */
export function MeterAlerts({ meter }: { meter: MeterRow }) {
  if (meter.openAlerts.length === 0) return null;
  return (
    <Card className="p-6">
      <CardTitle>Needs attention</CardTitle>
      <ul className="mt-3 space-y-2">
        {meter.openAlerts.map((a) => (
          <li
            key={a.id}
            className="rounded-[var(--r-sm)] p-3"
            style={{ background: "var(--bad-bg)", border: "1px solid var(--bad-line)" }}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusChip tone={a.kind === "offline" ? "bad" : "warn"}>
                {a.kind === "offline" ? "Not reachable" : "Out of range"}
              </StatusChip>
              <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                raised {a.openedAt.slice(0, 16).replace("T", " ")}
              </span>
            </div>
            <p className="text-[13px]" style={{ color: "var(--text)" }}>
              {a.message}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The hourly series as a day x hour heatmap, with each day's total beside it.
 *
 * It was 24 bars per row first, and that was the wrong encoding: a bar 65px
 * wide and 20px tall cannot show the difference between 0.29 kWh and 0.68,
 * so a real 60% drop in the middle of the series — the retrofit itself —
 * rendered as fourteen identical rows of blue. Colour has far more
 * perceptual range in a small cell than height does in a wide one.
 *
 * So: the CELL says what happened in that hour, the BAR beside it says what
 * the day came to. One shows the daily shape (a lighting circuit's block of
 * consumption sits where the lights are on), the other shows the trend
 * between days. Neither is legible from the other.
 *
 * Three states, never conflated: an hour with consumption, an hour the meter
 * reported as zero, and an hour the export never carried. A missing hour and
 * a quiet hour are different facts, and the second is not evidence of a
 * fault while the first might be.
 */
export function MeterHourlyChart({
  days,
}: {
  days: { day: string; hours: { hour: number; kWh: number }[]; total: number; intervalCount: number }[];
}) {
  const values = days.flatMap((d) => d.hours.map((h) => h.kWh)).filter((v) => v > 0);
  const peakHour = values.length > 0 ? Math.max(...values) : 0;
  const peakDay = Math.max(0.0001, ...days.map((d) => d.total));
  const complete = days.filter((d) => d.intervalCount === 24);
  const avgDay = complete.length > 0 ? complete.reduce((s, d) => s + d.total, 0) / complete.length : null;

  // Cell intensity, LINEAR against the busiest hour, with a floor of 14% so
  // the smallest real reading is still visible against the ground.
  //
  // A square-root curve was tried first and rejected: it made a 0.29 kWh hour
  // read at two thirds of full accent when it is a third of the peak. On a
  // product whose figures are billed, a colour scale that flatters the low
  // end is a scale that misleads, and the legend cannot undo it.
  const intensity = (v: number) => (peakHour <= 0 ? 0 : 14 + (v / peakHour) * 86);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
        <span>
          <span className="lbl">Days shown</span>{" "}
          <span className="num font-semibold">{days.length}</span>
        </span>
        {avgDay !== null && (
          <span>
            <span className="lbl">Average complete day</span>{" "}
            <span className="num font-semibold">{avgDay.toFixed(2)}</span>
            <span className="text-[var(--text-muted)]"> kWh</span>
          </span>
        )}
        <span>
          <span className="lbl">Busiest hour</span>{" "}
          <span className="num font-semibold">{peakHour.toFixed(2)}</span>
          <span className="text-[var(--text-muted)]"> kWh</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 620 }}>
          {/* The hour axis. Without it the reader can see a pattern but not
              when it happens, which is the whole question. */}
          <div className="mb-1 flex items-end gap-[3px]" style={{ paddingLeft: 84, paddingRight: 199 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="num flex-1 text-center text-[10px] tabular-nums"
                style={{ color: "var(--text-subtle)" }}
              >
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </div>
            ))}
          </div>

          {days.map((d) => {
            const byHour = new Map(d.hours.map((h) => [h.hour, h.kWh]));
            const partial = d.intervalCount < 24;
            return (
              <div key={d.day} className="flex items-center gap-[3px] py-[2px]">
                <span
                  className="num shrink-0 text-[11px] tabular-nums"
                  style={{ color: "var(--text-muted)", width: 81 }}
                >
                  {d.day}
                </span>

                {Array.from({ length: 24 }, (_, h) => {
                  const v = byHour.get(h);
                  const missing = v === undefined;
                  const zero = v === 0;
                  return (
                    <div
                      key={h}
                      title={
                        missing
                          ? `${d.day} ${String(h).padStart(2, "0")}:00 — not in the export`
                          : `${d.day} ${String(h).padStart(2, "0")}:00 — ${v!.toFixed(3)} kWh`
                      }
                      className="h-[22px] flex-1 rounded-[2px]"
                      style={
                        missing
                          ? {
                              background: "transparent",
                              border: "1px dashed var(--border)",
                            }
                          : zero
                            ? { background: "var(--surface-sunken)", border: "1px solid var(--border)" }
                            : {
                                background: `color-mix(in oklab, var(--accent) ${intensity(v!).toFixed(1)}%, var(--surface-sunken))`,
                              }
                      }
                    />
                  );
                })}

                {/* The day's total, as a figure AND as a bar — the figures
                    alone make a 60% drop between two rows easy to miss. */}
                <span className="flex shrink-0 items-center gap-2.5" style={{ width: 196 }}>
                  <span className="relative h-[12px] flex-1 rounded-[3px]" style={{ background: "var(--surface-sunken)" }}>
                    <span
                      className="absolute inset-y-0 left-0 rounded-[3px]"
                      style={{
                        width: `${Math.max(2, (d.total / peakDay) * 100)}%`,
                        background: partial ? "var(--warn-fg)" : "var(--accent)",
                      }}
                    />
                  </span>
                  <span
                    className="num shrink-0 text-right text-[11px] tabular-nums"
                    style={{ width: 74, color: "var(--text)" }}
                  >
                    {d.total.toFixed(2)}
                    {partial && (
                      <span style={{ color: "var(--warn-fg)" }} title={`only ${d.intervalCount} of 24 hours`}>
                        {" "}
                        ·{d.intervalCount}h
                      </span>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
        <span className="flex items-center gap-2">
          <span>0</span>
          <span
            className="inline-block h-3 w-24 rounded-[2px]"
            style={{
              background: `linear-gradient(to right, color-mix(in oklab, var(--accent) 12%, var(--surface-sunken)), var(--accent))`,
            }}
          />
          <span className="num">{peakHour.toFixed(2)} kWh in an hour</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-[2px]"
            style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
          />
          reported zero
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-[2px]"
            style={{ border: "1px dashed var(--border)" }}
          />
          not in the export
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded-[2px]" style={{ background: "var(--warn-fg)" }} />
          partial day
        </span>
      </div>
    </div>
  );
}
