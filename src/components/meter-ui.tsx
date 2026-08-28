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

const STATE_META: Record<string, { label: string; tone: ChipTone; hint: string }> = {
  reporting: { label: "Reporting", tone: "ok", hint: "Answering and sending fresh readings." },
  silent: {
    label: "Not reporting",
    tone: "warn",
    hint: "Connected, but it has sent nothing for over two hours. The figures below are the last it sent.",
  },
  offline: { label: "Offline", tone: "bad", hint: "The meter could not be reached." },
};

export function MeterStateChip({ state }: { state: string | null }) {
  if (!state) return <StatusChip tone="neu">Unassigned</StatusChip>;
  const meta = STATE_META[state];
  if (!meta) return <StatusChip tone="neu">{state}</StatusChip>;
  return <StatusChip tone={meta.tone}>{meta.label}</StatusChip>;
}

export function meterStateHint(state: string | null): string | null {
  return state ? (STATE_META[state]?.hint ?? null) : null;
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
  const hint = meterStateHint(meter.state);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <CardTitle>Live reading</CardTitle>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {meter.readAt === null ? (
              "This meter has not been read yet."
            ) : meter.stale ? (
              <>
                <span style={{ color: "var(--warn-fg)" }}>Last known</span>, read {meter.readAge}. These are
                not current figures.
              </>
            ) : (
              <>Read {meter.readAge} from the meter itself.</>
            )}
          </p>
        </div>
        {action}
      </div>

      {hint && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}

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
          value={meter.hourlyCount === 0 ? "—" : String(meter.hourlyCount)}
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
 * The hourly series, one row per day, 24 bars each.
 *
 * A day laid out as its own row is what makes a lighting circuit legible —
 * the block of consumption sits where the lights are on, and a day that
 * breaks the pattern is visible without reading a single number. The bars
 * are scaled against the busiest hour in view, and that hour is stated, so
 * the height of a bar means something.
 */
export function MeterHourlyChart({
  days,
}: {
  days: { day: string; hours: { hour: number; kWh: number }[]; total: number; intervalCount: number }[];
}) {
  const peak = Math.max(0.0001, ...days.flatMap((d) => d.hours.map((h) => h.kWh)));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
          Each row is one day, midnight to midnight. Bars are scaled against the busiest hour in view
          ({peak.toFixed(2)} kWh).
        </p>
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 520 }}>
          {days.map((d) => {
            const byHour = new Map(d.hours.map((h) => [h.hour, h.kWh]));
            return (
              <div key={d.day} className="flex items-center gap-3 py-1">
                <span
                  className="num shrink-0 text-[11px] tabular-nums"
                  style={{ color: "var(--text-muted)", width: 78 }}
                >
                  {d.day}
                </span>
                <div className="flex h-7 flex-1 items-end gap-[2px]">
                  {Array.from({ length: 24 }, (_, h) => {
                    const v = byHour.get(h);
                    const pct = v === undefined ? 0 : Math.max(3, (v / peak) * 100);
                    return (
                      <div
                        key={h}
                        title={
                          v === undefined
                            ? `${d.day} ${String(h).padStart(2, "0")}:00 — no reading in the export`
                            : `${d.day} ${String(h).padStart(2, "0")}:00 — ${v.toFixed(3)} kWh`
                        }
                        className="flex-1 rounded-[1px]"
                        style={{
                          height: `${pct}%`,
                          // An hour the export never carried is drawn as a gap,
                          // not as a zero: a missing hour and a quiet hour are
                          // different facts.
                          background:
                            v === undefined
                              ? "var(--border)"
                              : v === 0
                                ? "var(--surface-sunken)"
                                : "var(--accent)",
                          opacity: v === undefined ? 0.5 : 1,
                        }}
                      />
                    );
                  })}
                </div>
                <span
                  className="num shrink-0 text-right text-[11px] tabular-nums"
                  style={{ color: "var(--text-muted)", width: 96 }}
                >
                  {d.total.toFixed(2)} kWh
                  {d.intervalCount < 24 && (
                    <span style={{ color: "var(--warn-fg)" }} title={`${d.intervalCount} of 24 hours`}>
                      {" "}
                      ·{d.intervalCount}h
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px]" style={{ color: "var(--text-subtle)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[1px]" style={{ background: "var(--accent)" }} />
          consumption
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[1px]" style={{ background: "var(--surface-sunken)" }} />
          reported zero
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[1px]"
            style={{ background: "var(--border)", opacity: 0.5 }}
          />
          not in the export
        </span>
      </div>
    </div>
  );
}
