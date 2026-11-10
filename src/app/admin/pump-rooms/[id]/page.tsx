import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { BackButton } from "@/components/back-button";
import { Card, CardTitle, PageHeader, Stat, StatRow } from "@/components/ui";
import { DailyBars } from "@/components/meter-ui";
import { PumpRoomEfficiency } from "@/components/pump-room-efficiency";
import { formatInstant } from "@/lib/format-date";
import { electricityBars, efficiencyRows, waterBars } from "@/lib/pump-room-view";
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

  const electricityDays = electricityBars(meter.readings);
  const waterDays = waterBars(meter.readings);
  const hasWater = meter.readings.some((r) => r.dailyKl !== null || r.lastTotalFlow !== null);
  const efficiency = efficiencyRows(meter.readings);

  return (
    <>
      <div className="mb-4">
        <BackButton fallbackHref="/admin/pump-rooms" />
      </div>
      <PageHeader
        title={meter.society ? meter.society.name : meter.vendorSubjectLabel}
        subtitle={`${meter.vendorSubjectLabel} · ${meter.roomType ?? "not classified"}`}
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

      {/* Once assigned the form moves behind Reassign (2026-11-10, user-caught:
          it sat inline taking half the page for something already done) — the
          same pattern water tanks already use. A room with no society yet
          still shows the form here, since there's nothing to reassign. */}
      {meter.society ? (
        <StatRow>
          <Stat label="Last reading" value={meter.lastReadingAt ? formatInstant(meter.lastReadingAt) : "—"} />
          <Stat label="Register" value={meter.lastKwh !== null ? meter.lastKwh.toFixed(2) : "—"} detail="kWh" />
          <Stat label="Water register" value={meter.lastTotalFlow !== null ? meter.lastTotalFlow.toFixed(2) : "—"} detail="KL" />
          <Stat label="Last email applied" value={meter.lastIngestAt ? formatInstant(meter.lastIngestAt) : "—"} />
        </StatRow>
      ) : (
        <Card className="p-5 sm:p-6">
          <CardTitle>Assignment</CardTitle>
          <AssignControl
            meterId={meter.id}
            currentSocietyId={null}
            currentRoomType={meter.roomType}
            societies={societies}
          />
        </Card>
      )}

      <Card className="mt-5 p-5 sm:p-6">
        <CardTitle>Daily electricity (kWh)</CardTitle>
        {electricityDays.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            No days have landed yet.
          </p>
        ) : (
          <>
            <DailyBars days={electricityDays} />
            <p className="mt-3 text-[11px]" style={{ color: "var(--text-subtle)" }}>
              A day with no earlier day on record (most often the first day ever read) shows that day&apos;s own
              opening-to-closing span rather than a comparison to a previous day — an approximation, not a loss.
            </p>
          </>
        )}
      </Card>

      {hasWater && (
        <Card className="mt-5 p-5 sm:p-6">
          <CardTitle>Daily water (KL)</CardTitle>
          {waterDays.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              No days have landed yet.
            </p>
          ) : (
            <DailyBars days={waterDays} />
          )}
        </Card>
      )}

      {hasWater && (
        <Card className="mt-5 p-5 sm:p-6">
          <CardTitle>Energy per kilolitre</CardTitle>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            How much electricity this room uses to move each kilolitre of water — the real efficiency question a pump
            room answers.
          </p>
          <PumpRoomEfficiency rows={efficiency} />
        </Card>
      )}

      <Card className="mt-5 p-5 sm:p-6">
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
    </>
  );
}
