import { db } from "@/lib/db";
import { Card, StatusChip } from "@/components/ui";
import { DailyBars } from "@/components/meter-ui";
import { PumpRoomEfficiency } from "@/components/pump-room-efficiency";
import { formatInstant } from "@/lib/format-date";
import { electricityBars, efficiencyRows, waterBars } from "@/lib/pump-room-view";

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

  const electricityDays = electricityBars(meter.readings);
  const waterDays = waterBars(meter.readings);
  const hasWater = meter.readings.some((r) => r.dailyKl !== null || r.lastTotalFlow !== null);
  const efficiency = efficiencyRows(meter.readings);

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
      {electricityDays.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
          A history appears here once a first day lands.
        </p>
      ) : (
        <>
          <p className="lbl mb-2">Electricity (kWh/day)</p>
          <DailyBars days={electricityDays} />
          {hasWater && (
            <>
              <p className="lbl mb-2 mt-5">Water (KL/day)</p>
              <DailyBars days={waterDays} />
              <p className="lbl mb-2 mt-5">Energy per kilolitre</p>
              <PumpRoomEfficiency rows={efficiency} />
            </>
          )}
        </>
      )}
    </Card>
  );
}
