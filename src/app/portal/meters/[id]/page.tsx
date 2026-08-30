import { notFound, redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { hasGrant } from "@/lib/portal-access";
import { MeterAlerts, MeterHourlyChart, MeterReadout, MeterStateChip } from "@/components/meter-ui";
import { meterHourly, meterRow } from "@/lib/meter-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meter" };

/**
 * One of the society's own meters. `meterRow` is given the viewer's own
 * societyId, so a meter belonging to another society is not found here —
 * INV-05 enforced in the query rather than by what this page chooses to
 * render.
 */
export default async function PortalMeterPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "electricity")) redirect("/portal");
  const { id } = await params;

  const meter = await meterRow(id, viewer.societyId);
  if (!meter) notFound();

  const days = await meterHourly(id, 14);

  return (
    <>
      <PageHeader
        backHref="/portal/electricity"
        title={meter.name}
        chip={<MeterStateChip state={meter.state} />}
        subtitle={meter.circuitLabel ?? "Not yet bound to a circuit"}
      />

      <div className="space-y-6">
        <MeterAlerts meter={meter} />
        <MeterReadout meter={meter} />

        <Card className="p-6">
          <CardTitle>Hourly consumption</CardTitle>
          <p className="mb-4 mt-1 text-[13px] text-[var(--text-muted)]">
            Read from the meter&rsquo;s own recorded history. These are the hours the meter measured —
            they are not what your bill is computed from, which FirsThing reviews separately before
            any month is billed.
          </p>
          {days.length === 0 ? (
            <EmptyState title="No hourly history yet">
              The meter records its own hours; FirsThing uploads them here periodically. Its live
              reading above is available now.
            </EmptyState>
          ) : (
            <MeterHourlyChart days={days} />
          )}
        </Card>
      </div>
    </>
  );
}
