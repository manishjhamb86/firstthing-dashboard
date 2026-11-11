import { db } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { PumpMetricBlock } from "@/components/pump-metric-block";
import { PumpDayTable } from "@/components/pump-day-table";
import { TYPICAL_SPECIFIC_ENERGY, dayRows, periodTotals, trendData } from "@/lib/pump-room-view";

/**
 * The resident's single pump room (one per society for now — see
 * src/lib/pump-room-ingest.ts), scoped server-side by societyId exactly
 * like the tank query (INV-05).
 *
 * Same metric blocks and day table as the back office (2026-11-10): the
 * society and the operator read one view, never two that can disagree.
 *
 * Its own tab since 2026-11-11 (user-asked) — so with no pump room on
 * record it states that rather than rendering nothing: a tab that opens
 * blank reads as broken, where a section inside the tanks page could
 * simply be absent (INV-06).
 */
export async function loadPumpRoom(societyId: string) {
  // Not a unique constraint — "one room per society" is today's matching
  // scope, not an enforced limit — so this takes the first by assignment,
  // deterministically, rather than risking a Prisma error on more than one.
  return db.emsPumpMeter.findFirst({
    where: { societyId },
    orderBy: { assignedAt: "asc" },
    include: { readings: { orderBy: { date: "desc" }, take: 30 } },
  });
}

export function PumpRoomSection({ meter }: { meter: Awaited<ReturnType<typeof loadPumpRoom>> }) {
  if (!meter) {
    return (
      <Card className="p-5 sm:p-6">
        <EmptyState title="No pump room connected yet">
          Once the pump room&apos;s backup energy meter is reporting its daily EMS figures, the electricity it uses and the water it pumps appear here, day by day.
        </EmptyState>
      </Card>
    );
  }

  const trend = trendData(meter.readings);
  const hasWater = meter.readings.some((r) => r.dailyKl !== null || r.lastTotalFlow !== null);
  const rows = dayRows(trend);
  const totals = periodTotals(trend);
  const latestEff = [...trend.efficiency].reverse().find((v) => v !== null) ?? null;

  if (trend.days.length === 0) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
          A history appears here once a first day lands.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-4 ${hasWater ? "lg:grid-cols-3" : ""}`}>
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
      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="lbl mb-0">Day by day</p>
          <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
            newest first
          </span>
        </div>
        <PumpDayTable rows={rows} totals={totals} hasWater={hasWater} />
      </Card>
    </div>
  );
}
