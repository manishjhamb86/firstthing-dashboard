import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { BackButton } from "@/components/back-button";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { PumpMetricBlock } from "@/components/pump-metric-block";
import { PumpDayTable } from "@/components/pump-day-table";
import { formatInstant } from "@/lib/format-date";
import { TYPICAL_SPECIFIC_ENERGY, dayRows, isReporting, periodTotals, trendData } from "@/lib/pump-room-view";
import { AssignControl } from "./assign-control";
import { ReassignButton } from "./reassign-button";
import { IngestHistory } from "./ingest-history";

export const dynamic = "force-dynamic";

export default async function PumpRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_users")) redirect("/admin");

  const { id } = await params;
  const [meter, societies] = await Promise.all([
    db.emsPumpMeter.findUnique({
      where: { id },
      include: {
        society: { select: { id: true, name: true, location: true } },
        assignedBy: { select: { name: true, email: true } },
        readings: { orderBy: { date: "desc" }, take: 60 },
        ingests: { orderBy: { receivedAt: "desc" }, take: 30 },
      },
    }),
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
  ]);
  if (!meter) notFound();

  const trend = trendData(meter.readings);
  const hasWater = meter.readings.some((r) => r.dailyKl !== null || r.lastTotalFlow !== null);
  const rows = dayRows(trend);
  const totals = periodTotals(trend);
  const reporting = isReporting(meter.lastReadingAt);
  const aboveBandDays = trend.efficiency.filter((v) => v !== null && v > TYPICAL_SPECIFIC_ENERGY.high).length;
  const latestEff = [...trend.efficiency].reverse().find((v) => v !== null) ?? null;
  const appliedCount = meter.ingests.filter((i) => i.status === "applied").length;

  return (
    <>
      <div className="mb-4">
        <BackButton fallbackHref="/admin/pump-rooms" />
      </div>
      <PageHeader
        title={meter.society ? meter.society.name : meter.vendorSubjectLabel}
        subtitle={`${meter.roomType ? `${meter.roomType} pump room` : "Pump room — not classified"} · EMS daily report`}
        action={
          meter.society ? (
            <ReassignButton
              roomLabel={meter.vendorSubjectLabel}
              meterId={meter.id}
              currentSocietyId={meter.society.id}
              currentRoomType={meter.roomType}
              societies={societies}
            />
          ) : undefined
        }
      />

      {/* Feed health is one line, not two tiles (2026-11-10 redesign). */}
      {meter.society && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: reporting ? "var(--ok-fg)" : "var(--warn-fg)" }} />
          <span>
            {reporting ? "Reporting" : "Not reporting"} · last reading{" "}
            <span className="num" style={{ color: "var(--text)" }}>
              {meter.lastReadingAt ? formatInstant(meter.lastReadingAt) : "—"}
            </span>{" "}
            · email applied{" "}
            <span className="num" style={{ color: "var(--text)" }}>
              {meter.lastIngestAt ? formatInstant(meter.lastIngestAt) : "—"}
            </span>
          </span>
        </p>
      )}

      {!meter.society && (
        <Card className="mb-4 p-5 sm:p-6">
          <CardTitle>Assignment</CardTitle>
          <AssignControl meterId={meter.id} currentSocietyId={null} currentRoomType={meter.roomType} societies={societies} />
        </Card>
      )}

      {trend.days.length === 0 ? (
        <Card className="p-5 sm:p-6">
          <CardTitle>Daily figures</CardTitle>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            No days have landed yet.
          </p>
        </Card>
      ) : (
        <>
          {/* Three metric blocks: the figure, the delta, and the days underneath. */}
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
                note={
                  aboveBandDays > 0
                    ? `Above the ${TYPICAL_SPECIFIC_ENERGY.low.toFixed(2)}–${TYPICAL_SPECIFIC_ENERGY.high.toFixed(2)} kWh/KL typical urban pumping range on ${aboveBandDays} of ${trend.days.length} days (CPHEEO). Worth checking pump head and efficiency.`
                    : `Inside the ${TYPICAL_SPECIFIC_ENERGY.low.toFixed(2)}–${TYPICAL_SPECIFIC_ENERGY.high.toFixed(2)} kWh/KL typical urban pumping range (CPHEEO).`
                }
              />
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="min-w-0 p-4 lg:col-span-2 sm:p-5">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <CardTitle className="mb-0">Day by day</CardTitle>
                <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                  newest first
                </span>
              </div>
              <PumpDayTable rows={rows} totals={totals} hasWater={hasWater} />
            </Card>

            <div className="flex min-w-0 flex-col gap-4">
              <Card className="grid grid-cols-2 gap-3 p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="lbl">Energy register</span>
                  <span className="num text-[15px] font-bold">
                    {meter.lastKwh !== null ? meter.lastKwh.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                    <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                      {" "}
                      kWh
                    </span>
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="lbl">Water register</span>
                  <span className="num text-[15px] font-bold">
                    {meter.lastTotalFlow !== null ? meter.lastTotalFlow.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                    <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                      {" "}
                      KL
                    </span>
                  </span>
                </div>
              </Card>

              <Card className="p-4">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="lbl">Emails received</span>
                      <span className="text-[13px]">
                        {appliedCount} applied of {meter.ingests.length}
                        {meter.lastIngestAt && (
                          <>
                            {" "}
                            · latest <span className="num">{formatInstant(meter.lastIngestAt)}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                      Show
                    </span>
                  </summary>
                  <div className="mt-3">
                    <IngestHistory
                      rows={meter.ingests.map((i) => ({
                        id: i.id,
                        receivedAt: i.receivedAt.toISOString(),
                        status: i.status,
                        parseError: i.parseError,
                        rowCount: i.rowCount,
                      }))}
                    />
                  </div>
                </details>
              </Card>
            </div>
          </div>
        </>
      )}

      {trend.days.length === 0 && (
        <Card className="mt-4 p-4 sm:p-5">
          <CardTitle>Emails received</CardTitle>
          <IngestHistory
            rows={meter.ingests.map((i) => ({
              id: i.id,
              receivedAt: i.receivedAt.toISOString(),
              status: i.status,
              parseError: i.parseError,
              rowCount: i.rowCount,
            }))}
          />
        </Card>
      )}
    </>
  );
}
