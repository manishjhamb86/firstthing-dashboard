import { db } from "@/lib/db";
import { Card, StatusChip } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { formatInstant } from "@/lib/format-date";
import { indexToFirst, trendData } from "@/lib/pump-room-view";

/**
 * The resident's single pump room (one per society for now — see
 * src/lib/pump-room-ingest.ts), scoped server-side by societyId exactly
 * like the tank query above it (INV-05). Renders nothing when the society
 * has no classified pump room yet — same "absent is a stated state, never
 * guessed at" rule as the water tanks it sits beside.
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

  return (
    <Card className="mb-7 p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-[15px] font-bold capitalize">{meter.roomType ?? "Pump room"}</h2>
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
      ) : hasWater ? (
        <>
          <p className="lbl mb-2">Electricity, water & efficiency</p>
          <p className="mb-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
            Each line starts at 100 on its own first day, so kWh, KL and kWh/KL read on one chart. Tap a point for
            the real figure.
          </p>
          <TrendChart
            days={trend.days}
            series={[
              { key: "kwh", label: "Electricity", color: "var(--chart-mark)", points: indexToFirst(trend.kwh), rawPoints: trend.kwh, rawUnit: "kWh" },
              { key: "kl", label: "Water", color: "var(--chart-mark-2)", points: indexToFirst(trend.kl), rawPoints: trend.kl, rawUnit: "KL" },
              {
                key: "eff",
                label: "kWh per KL",
                color: "var(--chart-mark-3)",
                points: indexToFirst(trend.efficiency),
                rawPoints: trend.efficiency,
                rawUnit: "kWh/KL",
                rawDecimals: 2,
              },
            ]}
            unit="= 100 on day 1"
            decimals={0}
          />
        </>
      ) : (
        <>
          <p className="lbl mb-2">Electricity (kWh/day)</p>
          <TrendChart days={trend.days} series={[{ key: "kwh", label: "Electricity", color: "var(--chart-mark)", points: trend.kwh }]} unit="kWh" />
        </>
      )}
    </Card>
  );
}
