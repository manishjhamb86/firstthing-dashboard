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

function fmt(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

/**
 * One live figure. `pending` renders the same tile with an em-dash and the
 * condition that would fill it, rather than a zero — a zero is a reading.
 */
function Reading({
  label,
  value,
  unit,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className="rounded-[var(--r-md)] p-4"
      style={{
        background: emphasis ? "var(--accent-subtle)" : "var(--surface-sunken)",
        border: `1px solid ${emphasis ? "var(--accent-line)" : "var(--border)"}`,
      }}
    >
      <p className="lbl mb-1.5">{label}</p>
      <p className="flex items-baseline gap-1">
        <span
          className="num text-[22px] font-semibold leading-none"
          style={{ color: emphasis ? "var(--accent)" : "var(--text)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
            {unit}
          </span>
        )}
      </p>
      <p className="mt-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
        {detail ?? " "}
      </p>
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
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <CardTitle>Live reading</CardTitle>
          <p
            className="mt-1 text-[13px]"
            style={{ color: caption.warn ? "var(--warn-fg)" : "var(--text-muted)" }}
          >
            {caption.text}
          </p>
        </div>
        {action}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Reading
          label="Power now"
          value={fmt(meter.powerW)}
          unit="W"
          emphasis
          detail={
            meter.voltageV !== null && meter.currentA !== null
              ? `${fmt(meter.voltageV)} V · ${fmt(meter.currentA)} A`
              : "no voltage or current reported"
          }
        />
        <Reading
          label="Today so far"
          value={fmt(meter.dayKwh)}
          unit="kWh"
          detail={
            meter.capacityKwh !== null
              ? `ceiling ${meter.capacityKwh.toFixed(2)} kWh/day`
              : "no load inventory to compare against"
          }
        />
        <Reading
          label="This month so far"
          value={fmt(meter.monthKwh)}
          unit="kWh"
          detail="the meter's own month counter"
        />
        <Reading
          label="Exported history"
          value={meter.hourlyCount === 0 ? "—" : meter.hourlyCount.toLocaleString()}
          unit={meter.hourlyCount === 0 ? undefined : "hours"}
          detail={
            meter.hourlyFrom
              ? `${meter.hourlyFrom} to ${meter.hourlyTo}`
              : "upload a meter export for the hourly series"
          }
        />
      </div>
    </Card>
  );
}

/** Open alerts, most recent first. Nothing is invented when there are none. */
export function MeterAlerts({ meter }: { meter: MeterRow }) {
  if (meter.openAlerts.length === 0) return null;
  return (
    <Card className="border-l-4" >
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
