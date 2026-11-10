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
              <tr key={r.day}>
                <Td align="left">
                  {dayAxis(r.day)}
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
      {anyApprox && (
        <p className="text-[11px] leading-[1.45]" style={{ color: "var(--text-subtle)" }}>
          ≈ first day on record — its own opening-to-closing span, not a comparison to a previous day.
        </p>
      )}
    </div>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`lbl pb-2 ${align === "left" ? "text-left" : "text-right"}`} style={{ fontSize: 10 }}>
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
