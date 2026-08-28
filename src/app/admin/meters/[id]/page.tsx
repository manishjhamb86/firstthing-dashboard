import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { MeterAlerts, MeterHourlyChart, MeterReadout, MeterStateChip } from "@/components/meter-ui";
import { meterHourly, meterRow } from "@/lib/meter-view";
import { db } from "@/lib/db";
import { MeterDetailActions } from "./meter-detail-client";

export default async function MeterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage();
  if (!actor) redirect("/api/session-ended");
  const { id } = await params;

  const meter = await meterRow(id);
  if (!meter) notFound();

  const [days, imports] = await Promise.all([
    meterHourly(id, 14),
    db.meterCsvImport.findMany({
      where: { meterId: id },
      orderBy: { uploadedAt: "desc" },
      take: 8,
      select: {
        id: true,
        fileName: true,
        firstDay: true,
        lastDay: true,
        hoursInFile: true,
        hoursSuperseded: true,
        matchMethod: true,
        overrodeMatch: true,
        uploadedAt: true,
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  const canManage = actor.user.adminPermissions.includes("manage_users");

  return (
    <>
      <PageHeader
        backHref="/admin/meters"
        title={meter.name}
        chip={<MeterStateChip state={meter.state} />}
        subtitle={
          <>
            {meter.productModel} · device type {meter.uiid}
            {meter.societyName && (
              <>
                {" · "}
                <Link href={`/admin/societies/${meter.societyId}`} className="underline">
                  {meter.societyName}
                </Link>
              </>
            )}
            {meter.circuitLabel && ` · ${meter.circuitLabel}`}
          </>
        }
      />

      <div className="space-y-6">
        <MeterAlerts meter={meter} />

        <MeterReadout
          meter={meter}
          action={canManage ? <MeterDetailActions meterId={meter.id} mode="read" /> : undefined}
        />

        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div>
              <CardTitle>What this meter measures</CardTitle>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                The circuit it is bound to, and who is chased when it stops answering.
              </p>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Society" value={meter.societyName} href={meter.societyId ? `/admin/societies/${meter.societyId}` : null} missing="Not assigned" />
            <Detail
              label="Circuit"
              value={meter.circuitLabel}
              href={meter.circuitId && meter.societyId ? `/admin/societies/${meter.societyId}/circuits/${meter.circuitId}` : null}
              missing="Not assigned — nothing is billed against this meter"
            />
            <Detail
              label="Daily ceiling"
              value={meter.capacityKwh === null ? null : `${meter.capacityKwh.toFixed(2)} kWh`}
              missing="No load inventory on the circuit"
            />
            <Detail label="Chased when it stops" value={meter.ownerLabel} missing="Nobody named" />
          </dl>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div>
              <CardTitle>Hourly consumption</CardTitle>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                From the meter&rsquo;s own exported history. The live API gives a running counter, never
                the hours themselves, so this series only grows when an export is uploaded.
              </p>
            </div>
            {canManage && <MeterDetailActions meterId={meter.id} mode="upload" />}
          </div>

          {days.length === 0 ? (
            <EmptyState title="No hourly history yet">
              Download the history CSV from this meter in the eWeLink app and upload it here. The system
              works out which meter it belongs to by comparing it against what is already stored.
            </EmptyState>
          ) : (
            <MeterHourlyChart days={days} />
          )}
        </Card>

        {imports.length > 0 && (
          <Card>
            <CardTitle>Imports</CardTitle>
            <div className="mt-3 overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Covers</th>
                    <th className="text-right">Hours</th>
                    <th className="text-right">Replaced</th>
                    <th>Matched by</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.id}>
                      <td className="font-medium">{i.fileName}</td>
                      <td className="num text-[13px]">
                        {i.firstDay.toISOString().slice(0, 10)} → {i.lastDay.toISOString().slice(0, 10)}
                      </td>
                      <td className="num text-right">{i.hoursInFile}</td>
                      <td className="num text-right">
                        {i.hoursSuperseded > 0 ? (
                          <span style={{ color: "var(--warn-fg)" }}>{i.hoursSuperseded}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-[13px]">
                        {i.overrodeMatch ? (
                          <span style={{ color: "var(--warn-fg)" }}>Chosen by hand</span>
                        ) : (
                          "Overlapping hours"
                        )}
                      </td>
                      <td className="text-[13px] text-[var(--text-muted)]">
                        {i.uploadedAt.toISOString().slice(0, 16).replace("T", " ")}
                        <br />
                        {i.uploadedBy.name ?? i.uploadedBy.email}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  href,
  missing,
}: {
  label: string;
  value: string | null;
  href?: string | null;
  missing: string;
}) {
  return (
    <div>
      <dt className="lbl mb-1">{label}</dt>
      <dd className="text-[15px]">
        {value === null ? (
          <span className="text-[13px] text-[var(--text-subtle)]">{missing}</span>
        ) : href ? (
          <Link href={href} className="underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
