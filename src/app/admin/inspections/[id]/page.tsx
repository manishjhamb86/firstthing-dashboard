import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { Card, CardTitle, PageHeader, PageRibbon, Stat, StatRow, StatusChip } from "@/components/ui";
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

  // Who did the visit is a fact of the HEADER (set when it started), not a
  // separate card whose only content is one line (2026-09-12, user-caught:
  // "things that wont take more than a line are taking almost 1/3rd of the
  // space" — an inspector reads this on a phone, where that cost is real).
  const visitLine = [
    `${monthLabel(`${inspection.period}-01`)} · inspected ${formatDateTime(inspection.inspectedAt)}`,
    inspection.inspectorName,
    !isDraft ? `signed by ${inspection.societyRepName ?? "no representative available"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
        subtitle={visitLine}
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
        <FinalizeInspectionForm
          inspectionId={inspection.id}
          defaultTotal={inspection.circuit?.representedLightCount ?? null}
        />
      ) : (
        <>
          <StatRow>
            <Stat label="Total lights checked" value={summary.totalLightsChecked} />
            <Stat
              label="Faulty lights"
              value={summary.faultyLightsCount}
              tone={summary.faultyLightsCount > 0 ? "warn" : "ok"}
            />
            <Stat label="Faulty %" value={`${summary.faultyPct.toFixed(1)}%`} />
          </StatRow>

          {inspection.notes && (
            <p className="mb-6 text-[13.5px]">
              <span className="lbl mr-1.5">Notes</span>
              {inspection.notes}
            </p>
          )}

          <Card className="p-4 sm:p-6">
            <CardTitle>Faulty or notable fixtures</CardTitle>
            {inspection.findings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No faults found on this visit.
              </p>
            ) : (
              <div className="space-y-2.5">
                {inspection.findings.map((f) => {
                  const meta = SENSOR_STATUS_META[f.sensorStatus];
                  return (
                    <div
                      key={f.id}
                      className="rounded-[var(--r-md)] border p-3"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0 truncate font-medium">
                          {f.srNo}. {f.location}
                        </span>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      </div>
                      {(f.physicalDamage || f.actionReplace || f.remarks) && (
                        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                          {[
                            f.physicalDamage ? "Physical damage" : null,
                            f.actionReplace ? "To be replaced" : null,
                            f.remarks,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
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
