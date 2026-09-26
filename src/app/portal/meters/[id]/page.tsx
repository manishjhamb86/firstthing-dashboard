import { notFound, redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { hasGrant } from "@/lib/portal-access";
import { MeterAlerts, MeterDemoCard, MeterHourlyChart, MeterReadout, MeterStateChip } from "@/components/meter-ui";
import { meterDemoContext, meterHourly, meterRow } from "@/lib/meter-view";
import { readMeterIfDue } from "@/lib/meter-read-on-open";
import { nextLiveReadAt } from "@/lib/meter-live";
import { formatInstant } from "@/lib/format-date";

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

  // Scope first (INV-05): a society can never trigger a read of a meter
  // that is not its own. Then read live if the last reading is over an hour
  // old — once an hour per meter, whoever opens it.
  const owned = await meterRow(id, viewer.societyId);
  if (!owned) notFound();
  const read = await readMeterIfDue(id, "portal");
  const meter = read === "read" ? ((await meterRow(id, viewer.societyId)) ?? owned) : owned;
  const nextRead = nextLiveReadAt(meter.readAt ? new Date(meter.readAt) : null, "portal");

  const [days, demo] = await Promise.all([meterHourly(id, 14, viewer.societyId), meterDemoContext(id, viewer.societyId)]);

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
        {nextRead && read !== "failed" && (
          <p className="-mt-3 text-[12px]" style={{ color: "var(--text-subtle)" }}>
            The meter is read live at most once an hour — the next live reading is available after{" "}
            {formatInstant(nextRead)}.
          </p>
        )}
        <MeterDemoCard context={demo} />

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
