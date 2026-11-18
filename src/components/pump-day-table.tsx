import { dayAxis } from "@/lib/format-date";
import type { DayRow, PeriodTotals } from "@/lib/pump-room-view";
import { TYPICAL_SPECIFIC_ENERGY } from "@/lib/pump-room-view";

/**
 * The day-by-day readout for a pump room — every figure on screen, newest
 * first. On a phone there is no hover, so this table is where a number is
 * read, not a tooltip (2026-11-10). Hook-free.
 */
export function PumpDayTable({ rows, totals, hasWater }: { rows: DayRow[]; totals: PeriodTotals; hasWater: boolean }) {
  const anyApprox = rows.some((r) => r.approximate);
  const anySpread = rows.some((r) => r.spread);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th align="left">Day</Th>
              <Th>kWh</Th>
              {hasWater && <Th>KL</Th>}
              {hasWater && <Th>kWh/KL</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.day} style={r.spread ? { color: "var(--text-subtle)", fontStyle: "italic" } : undefined}>
                <Td align="left">
                  {dayAxis(r.day)}
                  {r.spread && <SpreadMark />}
                  {r.approximate && (
                    <span className="ml-1" style={{ color: "var(--text-subtle)" }}>
                      ≈
                    </span>
                  )}
                </Td>
                <Td strong={idx === 0}>{r.kwh === null ? "—" : r.kwh.toFixed(0)}</Td>
                {hasWater && <Td>{r.kl === null ? "—" : r.kl.toFixed(0)}</Td>}
                {hasWater && (
                  <Td warn={r.efficiency !== null && r.efficiency > TYPICAL_SPECIFIC_ENERGY.high}>
                    {r.efficiency === null ? "—" : r.efficiency.toFixed(2)}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-2 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <span>
          {totals.days} {totals.days === 1 ? "day" : "days"} · <span className="num" style={{ color: "var(--text)" }}>{Math.round(totals.kwh).toLocaleString("en-IN")}</span> kWh
          {hasWater && (
            <>
              {" "}
              · <span className="num" style={{ color: "var(--text)" }}>{Math.round(totals.kl).toLocaleString("en-IN")}</span> KL
            </>
          )}
        </span>
        {hasWater && totals.overallEfficiency !== null && (
          <span>
            overall{" "}
            <span className="num font-bold" style={{ color: "var(--text)" }}>
              {totals.overallEfficiency.toFixed(2)}
            </span>{" "}
            kWh/KL
          </span>
        )}
      </div>
      {anySpread && (
        <p className="text-[11px] leading-[1.45]" style={{ color: "var(--text-subtle)" }}>
          <span className="font-bold not-italic" style={{ color: "var(--warn-fg)" }}>spread</span>{" "}no report came for this day — the meter&apos;s total across the missing days is divided evenly between them, so the totals match the meter. Replaced when the day&apos;s report arrives.
        </p>
      )}
      {anyApprox && (
        <p className="text-[11px] leading-[1.45]" style={{ color: "var(--text-subtle)" }}>
          ≈ no report for the day before (the first day on record, or the first after a gap) — its own opening-to-closing span, not a comparison to a previous day.
        </p>
      )}
    </div>
  );
}

export function SpreadMark() {
  return (
    <span className="ml-1 rounded px-1 text-[9.5px] font-bold not-italic" style={{ color: "var(--warn-fg)", background: "var(--warn-bg)" }} title="No report came for this day — a share of the meter's total across the missing days">
      spread
    </span>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`pb-2 font-semibold uppercase tracking-[0.06em] ${align === "left" ? "text-left" : "text-right"}`} style={{ fontSize: 10, color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}

function Td({ children, align = "right", strong = false, warn = false }: { children: React.ReactNode; align?: "left" | "right"; strong?: boolean; warn?: boolean }) {
  return (
    <td
      className={`num whitespace-nowrap border-t py-[7px] text-[13px] ${align === "left" ? "text-left" : "text-right"} ${strong ? "font-bold" : ""} ${warn ? "font-semibold" : ""}`}
      style={{ borderColor: "var(--border-subtle)", color: warn ? "var(--warn-fg)" : undefined }}
    >
      {children}
    </td>
  );
}
