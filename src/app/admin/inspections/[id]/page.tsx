import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DEMO_LIGHTS_SELECT, demoLightsInstalled, totalLights } from "@/lib/light-population";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { Card, CardTitle, PageHeader, PageRibbon, StatusChip } from "@/components/ui";
import { formatDateTime, monthLabel } from "@/lib/format-date";
import { inspectionSummary } from "@/lib/inspection";
import { publicS3Url } from "@/lib/s3";
import { VoidInspectionButton } from "./void-button";
import { InspectionReportSteps } from "@/components/inspection-report-steps";
import { attachSignedInspection, getInspectionEvidenceUploadUrl } from "../actions";
import { DiscardDraftButton } from "./discard-draft-button";
import { FinalizeInspectionForm } from "./finalize-inspection-form";
import { FinishDraftForm } from "./finish-draft-form";
import { AddFindingRow, FindingRow } from "./finding-row";
import { refuseDiscardDraft } from "@/lib/inspection";
import { timeAgo } from "@/lib/format-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspection" };

export default async function InspectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; done?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_survey")) redirect("/admin");

  const { id } = await params;
  const { edit, done } = await searchParams;
  const inspection = await db.inspection.findUnique({
    where: { id },
    include: {
      society: { select: { name: true, location: true } },
      circuit: { select: { representedLightCount: true, ...DEMO_LIGHTS_SELECT } },
      voidedBy: { select: { name: true, email: true } },
      findings: { orderBy: { srNo: "asc" }, include: { addedBy: { select: { name: true, email: true } } } },
    },
  });
  if (!inspection) notFound();

  const isDraft = inspection.totalLightsChecked === null && !inspection.voidedAt;

  // Collaborative drafts (2026-10-06, user-asked): who else has added a
  // finding here, and when they last did — derived straight from the rows,
  // no separate presence/collaborator table. Not live/real-time (this app
  // has no websocket layer) — it is as fresh as the last page load, which
  // for two people both saving as they go is close enough to be useful.
  const contributors = new Map<string, { name: string; lastAddedAt: Date }>();
  for (const f of inspection.findings) {
    const label = f.addedBy.name ?? f.addedBy.email;
    const existingContributor = contributors.get(f.addedById);
    if (!existingContributor || f.addedAt > existingContributor.lastAddedAt) {
      contributors.set(f.addedById, { name: label, lastAddedAt: f.addedAt });
    }
  }
  const otherContributors = [...contributors.entries()].filter(([aid]) => aid !== actor.id).map(([, c]) => c);
  const canDiscardDraft =
    isDraft &&
    refuseDiscardDraft({ alreadyFinalized: false, alreadyVoided: false, distinctContributors: contributors.size }) === null;
  // A finalised inspection stays editable (user's call 2026-09-16): `?edit=1`
  // reopens the same form prefilled — a step you open, with a Cancel that
  // drops the parameter, the same shape as every other correction here.
  const isEditing = edit === "1" && inspection.totalLightsChecked !== null && !inspection.voidedAt;

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

  // A note that names a number of lights not working, against a different
  // count of recorded faults, is worth a second look (2026-11-28).
  const noted = /(\d+)\s*(?:lights?|fixtures?)?\s*(?:are\s+|is\s+)?(?:not\s+working|faulty|fused|not\s+glowing|off)/i.exec(inspection.notes ?? "");
  const notedCount = noted ? Number(noted[1]) : null;
  const noteMismatch =
    notedCount !== null && notedCount > 0 && notedCount !== summary.faultyLightsCount
      ? `The note mentions ${notedCount} light${notedCount === 1 ? "" : "s"} not working, but ${summary.faultyLightsCount === 0 ? "no faulty fixtures are" : `${summary.faultyLightsCount} ${summary.faultyLightsCount === 1 ? "is" : "are"}`} recorded below.`
      : null;

  // Every light installed on the circuit's type: full installation + demo lights (2026-09-27).
  const lightsToCheck = inspection.circuit ? totalLights(inspection.circuit.representedLightCount, demoLightsInstalled(inspection.circuit)) : null;
  return (
    <>
      {inspection.voidedAt && (
        <PageRibbon tone="bad">
          This inspection was voided by {inspection.voidedBy?.name ?? inspection.voidedBy?.email ?? "—"} on{" "}
          <span className="num">{formatDateTime(inspection.voidedAt)}</span> — {inspection.voidReason}. The
          record is kept for history but no longer counts as the society&apos;s inspection for this month.
        </PageRibbon>
      )}

      {done === "1" && !isDraft && !inspection.voidedAt && (
        <PageRibbon tone="ok">
          Visit saved. Its report is ready — download it, have the society representative sign it, then upload the signed copy below.
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
        action={
          !inspection.voidedAt && (inspection.totalLightsChecked !== null && !isEditing || isOperations(actor.team)) ? (
            <div className="flex flex-wrap items-center gap-2">
              {inspection.totalLightsChecked !== null && !isEditing && (
                <Link href={`/admin/inspections/${inspection.id}?edit=1`} className="btn-secondary btn-sm">
                  Edit inspection
                </Link>
              )}
              {isOperations(actor.team) && <VoidInspectionButton id={inspection.id} />}
            </div>
          ) : undefined
        }
      />

      {isDraft ? (
        <div className="flex flex-col gap-4">
          {otherContributors.length > 0 && (
            <PageRibbon tone="info">
              Also working on this inspection:{" "}
              {otherContributors.map((c) => `${c.name} (last added ${timeAgo(c.lastAddedAt)})`).join(" · ")}
            </PageRibbon>
          )}
          <Card className="p-4 sm:p-6">
            <CardTitle>Faulty or notable fixtures</CardTitle>
            <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Only a problem light is listed — each saves the moment you add it.
            </p>
            {/* The add/edit form leads (2026-10-07, user-caught: "the actual
                form starts where the page ends... requires scrolling for
                each line item addition") — on a phone, reaching it used to
                mean scrolling past every fixture already recorded. It stays
                open and resets itself for the next fixture after a save, so
                walking a visit is tap-location-tap-save, never
                tap-scroll-tap. Already-recorded fixtures are the compact,
                closed reference list below it. */}
            <AddFindingRow inspectionId={inspection.id} nextSrNo={inspection.findings.length + 1} draft />
            {inspection.findings.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="lbl" style={{ color: "var(--text-subtle)" }}>
                  Already recorded ({inspection.findings.length})
                </p>
                {inspection.findings.map((f) => (
                  <FindingRow
                    key={f.id}
                    inspectionId={inspection.id}
                    canEdit
                    draft
                    finding={{
                      id: f.id,
                      srNo: f.srNo,
                      location: f.location,
                      sensorStatus: f.sensorStatus,
                      physicalDamage: f.physicalDamage,
                      actionReplace: f.actionReplace,
                      remarks: f.remarks ?? "",
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
          <FinishDraftForm inspectionId={inspection.id} defaultTotal={lightsToCheck} findingsSoFar={inspection.findings.length} />
          <DiscardDraftButton id={inspection.id} canDiscard={canDiscardDraft} />
        </div>
      ) : isEditing ? (
        <FinalizeInspectionForm
          inspectionId={inspection.id}
          defaultTotal={lightsToCheck}
          cancelHref={`/admin/inspections/${inspection.id}`}
          initial={{
            totalLightsChecked: inspection.totalLightsChecked ?? 0,
            societyRepName: inspection.societyRepName ?? "",
            notes: inspection.notes ?? "",
            hasPhoto: !!inspection.evidencePhotoKey,
            findings: inspection.findings.map((f) => ({
              location: f.location,
              sensorStatus: f.sensorStatus,
              physicalDamage: f.physicalDamage,
              actionReplace: f.actionReplace,
              remarks: f.remarks ?? "",
            })),
          }}
        />
      ) : (
        <>
          <section className="card mb-6 grid grid-cols-2 overflow-hidden sm:grid-cols-4">
            <div className="border-[var(--border-subtle)] px-5 py-4 sm:border-r">
              <p className="lbl">Lights checked</p>
              <p className="num mt-1.5 text-[24px] font-bold leading-none">{summary.totalLightsChecked.toLocaleString("en-IN")}</p>
            </div>
            <div className="border-l border-[var(--border-subtle)] px-5 py-4 sm:border-l-0 sm:border-r">
              <p className="lbl">Faulty</p>
              <p className="num mt-1.5 text-[24px] font-bold leading-none" style={summary.faultyLightsCount > 0 ? { color: "var(--warn-fg)" } : undefined}>
                {summary.faultyLightsCount}
                <span className="ml-1.5 font-sans text-[14px] font-medium text-[var(--text-subtle)]">· {summary.faultyPct.toFixed(1)}%</span>
              </p>
            </div>
            <div className="col-span-2 border-t border-[var(--border-subtle)] px-5 py-4 sm:border-t-0">
              <p className="lbl">Inspector&apos;s note</p>
              <p className="mt-1.5 text-[14px] leading-relaxed">{inspection.notes || <span className="text-[var(--text-subtle)]">No note.</span>}</p>
              {noteMismatch && (
                <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--warn-fg)" }}>
                  {noteMismatch}
                </p>
              )}
            </div>
          </section>

          {!inspection.voidedAt && (
            <Card className="mb-6 p-4 sm:p-5">
              <CardTitle>Report</CardTitle>
              <InspectionReportSteps
                inspectionId={inspection.id}
                downloadHref={`/api/inspections/${inspection.id}/pdf`}
                signedHref={inspection.evidencePhotoKey ? publicS3Url(inspection.evidencePhotoKey) : null}
                signedIsPdf={!!inspection.evidencePhotoKey?.toLowerCase().endsWith(".pdf")}
                presign={getInspectionEvidenceUploadUrl}
                attach={attachSignedInspection}
              />
            </Card>
          )}

          <Card className="p-4 sm:p-6">
            <CardTitle>Faulty or notable fixtures</CardTitle>
            {inspection.findings.length === 0 ? (
              <p className="rounded-[var(--r-sm)] border border-dashed border-[var(--border)] px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                No faults recorded on this visit.
              </p>
            ) : (
              <div className="space-y-2.5">
                {inspection.findings.map((f) => (
                  <FindingRow
                    key={f.id}
                    inspectionId={inspection.id}
                    canEdit={!inspection.voidedAt}
                    finding={{
                      id: f.id,
                      srNo: f.srNo,
                      location: f.location,
                      sensorStatus: f.sensorStatus,
                      physicalDamage: f.physicalDamage,
                      actionReplace: f.actionReplace,
                      remarks: f.remarks ?? "",
                    }}
                  />
                ))}
              </div>
            )}
            {!inspection.voidedAt && (
              <div className="mt-3">
                <AddFindingRow inspectionId={inspection.id} nextSrNo={inspection.findings.length + 1} />
              </div>
            )}
          </Card>
        </>
      )}


    </>
  );
}
