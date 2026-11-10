import { db } from "@/lib/db";
import { Card, StatusChip } from "@/components/ui";
import { PumpMetricBlock } from "@/components/pump-metric-block";
import { PumpDayTable } from "@/components/pump-day-table";
import { formatInstant } from "@/lib/format-date";
import { TYPICAL_SPECIFIC_ENERGY, dayRows, periodTotals, trendData } from "@/lib/pump-room-view";

/**
 * The resident's single pump room (one per society for now — see
 * src/lib/pump-room-ingest.ts), scoped server-side by societyId exactly
 * like the tank query above it (INV-05). Renders nothing when the society
 * has no classified pump room yet — same "absent is a stated state, never
 * guessed at" rule as the water tanks it sits beside.
 *
 * Same metric blocks and day table as the back office (2026-11-10): the
 * society and the operator read one view, never two that can disagree.
 */
export async function PumpRoomSection({ societyId }: { societyId: string }) {
  // Not a unique constraint — "one room per society" is today's matching
  // scope, not an enforced limit — so this takes the first by assignment,
  // deterministically, rather than risking a Prisma error on more than one.
  const meter = await db.emsPumpMeter.findFirst({
    where: { societyId },
    orderBy: { assignedAt: "asc" },
    include: { readings: { orderBy: { date: "desc" }, take: 30 } },
  });
  if (!meter) return null;

  const trend = trendData(meter.readings);
  const hasWater = meter.readings.some((r) => r.dailyKl !== null || r.lastTotalFlow !== null);
  const rows = dayRows(trend);
  const totals = periodTotals(trend);
  const latestEff = [...trend.efficiency].reverse().find((v) => v !== null) ?? null;

  return (
    <Card className="mb-7 p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-[15px] font-bold capitalize">{meter.roomType ? `${meter.roomType} pump room` : "Pump room"}</h2>
        {meter.lastReadingAt ? (
          <StatusChip tone="ok">Last reading {formatInstant(meter.lastReadingAt)}</StatusChip>
        ) : (
          <StatusChip tone="neu">No readings yet</StatusChip>
        )}
      </div>
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Backup energy meter, read from the daily EMS report.
      </p>
      {trend.days.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
          A history appears here once a first day lands.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className={`grid gap-4 ${hasWater ? "xl:grid-cols-3" : ""}`}>
            <PumpMetricBlock
              label="Electricity"
              unit="kWh"
              decimals={0}
              days={trend.days}
              points={trend.kwh}
              kind="bars"
              color="var(--chart-mark)"
              approximateFirst={rows[rows.length - 1]?.approximate}
            />
            {hasWater && (
              <PumpMetricBlock
                label="Water pumped"
                unit="KL"
                decimals={0}
                days={trend.days}
                points={trend.kl}
                kind="bars"
                color="var(--chart-mark-2)"
                approximateFirst={rows[rows.length - 1]?.approximate}
              />
            )}
            {hasWater && (
              <PumpMetricBlock
                label="Energy per kilolitre"
                unit="kWh / KL"
                decimals={2}
                days={trend.days}
                points={trend.efficiency}
                kind="line"
                color="var(--chart-mark-3)"
                band={{ ...TYPICAL_SPECIFIC_ENERGY, label: `typical urban range ≤ ${TYPICAL_SPECIFIC_ENERGY.high.toFixed(2)}` }}
                approximateFirst={rows[rows.length - 1]?.approximate}
                tone={latestEff !== null && latestEff > TYPICAL_SPECIFIC_ENERGY.high ? "warn" : undefined}
                note="Electricity used to move each kilolitre of water. The shaded band is the typical urban pumping range."
              />
            )}
          </div>
          <div>
            <p className="lbl mb-2">Day by day</p>
            <PumpDayTable rows={rows} totals={totals} hasWater={hasWater} />
          </div>
        </div>
      )}
    </Card>
  );
}
