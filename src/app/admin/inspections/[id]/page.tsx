import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { Card, CardTitle, PageHeader, PageRibbon, StatusChip } from "@/components/ui";
import { formatDateTime, monthLabel } from "@/lib/format-date";
import { inspectionSummary, SENSOR_STATUS_META } from "@/lib/inspection";
import { VoidInspectionButton } from "./void-button";
import { FinalizeInspectionForm } from "./finalize-inspection-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspection" };

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_survey")) redirect("/admin");

  const { id } = await params;
  const inspection = await db.inspection.findUnique({
    where: { id },
    include: {
      society: { select: { name: true, location: true } },
      circuit: { select: { representedLightCount: true } },
      voidedBy: { select: { name: true, email: true } },
      findings: { orderBy: { srNo: "asc" } },
    },
  });
  if (!inspection) notFound();

  const isDraft = inspection.totalLightsChecked === null && !inspection.voidedAt;

  const summary = inspectionSummary({
    totalLightsChecked: inspection.totalLightsChecked ?? 0,
    findingsCount: inspection.findings.length,
  });

  return (
    <>
      {inspection.voidedAt && (
        <PageRibbon tone="bad">
          This inspection was voided by {inspection.voidedBy?.name ?? inspection.voidedBy?.email ?? "—"} on{" "}
          <span className="num">{formatDateTime(inspection.voidedAt)}</span> — {inspection.voidReason}. The
          record is kept for history but no longer counts as the society&apos;s inspection for this month.
        </PageRibbon>
      )}

      <PageHeader
        backHref="/admin/inspections"
        title={`${inspection.society.name} — ${inspection.area || "Whole society"}`}
        subtitle={`${monthLabel(`${inspection.period}-01`)} · inspected ${formatDateTime(inspection.inspectedAt)}`}
        chip={
          inspection.voidedAt ? (
            <StatusChip tone="neu">Voided</StatusChip>
          ) : isDraft ? (
            <StatusChip tone="info">In progress</StatusChip>
          ) : summary.faultyLightsCount === 0 ? (
            <StatusChip tone="ok">Clean</StatusChip>
          ) : (
            <StatusChip tone="warn">{summary.faultyLightsCount} faulty</StatusChip>
          )
        }
      />

      {isDraft ? (
        <>
          <Card className="mb-6 p-6">
            <CardTitle>Visit</CardTitle>
            <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt className="lbl">Inspector</dt>
                <dd>
                  {inspection.inspectorName} — {inspection.inspectorContact}
                </dd>
              </div>
            </dl>
          </Card>
          <FinalizeInspectionForm
            inspectionId={inspection.id}
            defaultTotal={inspection.circuit?.representedLightCount ?? null}
          />
        </>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="lbl">Total lights checked</p>
              <p className="num mt-1 text-[26px] font-bold">{summary.totalLightsChecked}</p>
            </Card>
            <Card className="p-5">
              <p className="lbl">Faulty lights</p>
              <p className="num mt-1 text-[26px] font-bold">{summary.faultyLightsCount}</p>
            </Card>
            <Card className="p-5">
              <p className="lbl">Faulty %</p>
              <p className="num mt-1 text-[26px] font-bold">{summary.faultyPct.toFixed(1)}%</p>
            </Card>
          </div>

          <Card className="mb-6 p-6">
            <CardTitle>Visit</CardTitle>
            <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt className="lbl">Inspector</dt>
                <dd>
                  {inspection.inspectorName} — {inspection.inspectorContact}
                </dd>
              </div>
              <div>
                <dt className="lbl">Society representative</dt>
                <dd>{inspection.societyRepName ?? "Not available at the time of the visit"}</dd>
              </div>
              {inspection.notes && (
                <div className="sm:col-span-2">
                  <dt className="lbl">Notes</dt>
                  <dd>{inspection.notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-6">
            <CardTitle>Faulty or notable fixtures</CardTitle>
            {inspection.findings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No faults found on this visit.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Sr</th>
                      <th>Location</th>
                      <th>Sensor</th>
                      <th>Damage</th>
                      <th>Replace</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspection.findings.map((f) => {
                      const meta = SENSOR_STATUS_META[f.sensorStatus];
                      return (
                        <tr key={f.id}>
                          <td>{f.srNo}</td>
                          <td>{f.location}</td>
                          <td>
                            <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                          </td>
                          <td>{f.physicalDamage ? "Yes" : "No"}</td>
                          <td>{f.actionReplace ? "Yes" : "No"}</td>
                          <td>{f.remarks ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {!inspection.voidedAt && isOperations(actor.team) && (
        <div className="mt-6">
          <VoidInspectionButton id={inspection.id} />
        </div>
      )}
    </>
  );
}
