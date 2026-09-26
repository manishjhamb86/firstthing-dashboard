import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, EmptyState, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { publicS3Url } from "@/lib/s3";
import { SOCIETY_DOC_TYPES, societyDocuments } from "@/lib/society-documents";
import { monthName } from "../portal-widgets";
import { inspectionSummary } from "@/lib/inspection";
import { InspectionFindingsSummary } from "./inspection-findings";
import { FileText } from "lucide-react";
import { circuitLabelOf } from "@/lib/circuit-label";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents" };

/**
 * The society's own paper, ready to download (customer-portal revamp,
 * 2026-08-29). Everything here is a StoredDocument row — the filing system
 * the back office already uses — filtered to the RESIDENT-FACING types.
 * The internal ones (meter exports, KYC files) are deliberately absent:
 * a GST certificate is the society's own document, but it was collected for
 * compliance, not published to the committee, and showing it here would be a
 * decision nobody made.
 *
 * Downloads are the stored object's public URL — the same public-read
 * Documents/ policy every admin surface uses (the user's standing S3 call).
 */
const VISIBLE = SOCIETY_DOC_TYPES;

// The icon bubble each document row wears — the design canvas's own row
// anatomy (Documents.dc.html: a colored icon circle, then title/subtitle,
// 2026-09-21), applied on top of the existing filter/group/download
// structure rather than replacing it.
const ROW_TINT: Record<ChipTone, { bg: string; fg: string }> = {
  info: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  ok: { bg: "var(--ok-bg)", fg: "var(--ok-fg)" },
  warn: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  bad: { bg: "var(--bad-bg)", fg: "var(--bad-fg)" },
  neu: { bg: "var(--neu-bg)", fg: "var(--neu-fg)" },
};
function DocIcon({ tone }: { tone: ChipTone }) {
  const { bg, fg } = ROW_TINT[tone];
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      <FileText size={16} strokeWidth={2.1} />
    </span>
  );
}

export default async function PortalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "documents")) redirect("/portal");
  const societyId = viewer.societyId;
  const { type } = await searchParams;
  const activeType = type && VISIBLE[type] ? type : null;

  const latestInspection = await db.inspection.findFirst({
    // Draft (not yet finalised) visits are the field team's own working
    // state — a resident should never see a visit as "current" before the
    // walk-through and its tally are actually done.
    where: { societyId, voidedAt: null, totalLightsChecked: { not: null } },
    orderBy: { inspectedAt: "desc" },
    include: { findings: { orderBy: { srNo: "asc" } } },
  });

  // One loader decides what a society can see and download — the back
  // office's society page lists the same set (society-documents.ts).
  const { agreement, rows } = await societyDocuments(societyId);
  const typesPresent = [...new Set([...(agreement ? ["agreement"] : []), ...rows.map((d) => d.docType)])];
  const shown = activeType ? rows.filter((d) => d.docType === activeType) : rows;
  const byPeriod = new Map<string, typeof rows>();
  for (const d of [...shown].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))) {
    if (!byPeriod.has(d.period)) byPeriod.set(d.period, []);
    byPeriod.get(d.period)!.push(d);
  }

  // Demo reports FirsThing has shared, and each demo's pre-/post-installation
  // report (2026-09-27, user-asked) — built from the accepted days each time
  // they open, so they are always current.
  const sharedReports = await db.demoReport.findMany({
    where: { status: "shared", pipeline: { societyId } },
    orderBy: { version: "desc" },
    select: { id: true, pipelineId: true, version: true, sharedAt: true, demoIds: true },
  });
  const latestShared = sharedReports.filter((r, i) => sharedReports.findIndex((x) => x.pipelineId === r.pipelineId) === i);
  const demos = await db.circuitDemo.findMany({
    where: { id: { in: [...new Set(latestShared.flatMap((r) => r.demoIds))] }, voidedAt: null, circuit: { societyId, voidedAt: null } },
    orderBy: { sequence: "asc" },
    select: { id: true, sequence: true, lightReplacementDate: true, circuit: { select: { location: true, lightType: true } } },
  });

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Everything on record for your society, ready to download."
      />

      {latestShared.length > 0 && (
        <Card className="mb-6 p-5">
          <p className="text-sm font-bold">Demo reports</p>
          <p className="mb-3 text-xs" style={{ color: "var(--text-subtle)" }}>
            The demo savings report, and for each demo the readings before and after the lights were replaced. They are built
            from the accepted readings each time you open them.
          </p>
          <ul className="flex flex-col gap-2">
            {latestShared.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-2">
                <Link href={`/portal/reports/demo/${r.id}`} className="btn-secondary btn-sm">
                  Demo savings report
                </Link>
                {demos
                  .filter((d) => r.demoIds.includes(d.id))
                  .map((d, _j, ds) => {
                    const which = ds.length > 1 ? ` — ${circuitLabelOf(d.circuit.location, d.circuit.lightType)}, demo ${d.sequence}` : "";
                    return (
                      <span key={d.id} className="contents">
                        <Link href={`/portal/reports/pre-install/${d.id}`} className="btn-secondary btn-sm">
                          Pre-installation report{which}
                        </Link>
                        {d.lightReplacementDate && (
                          <Link href={`/portal/reports/post-install/${d.id}`} className="btn-secondary btn-sm">
                            Post-installation savings report{which}
                          </Link>
                        )}
                      </span>
                    );
                  })}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {latestInspection && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Latest inspection</p>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                {latestInspection.area || "Whole society"} · {monthName(latestInspection.period)} ·{" "}
                inspected {formatDate(latestInspection.inspectedAt)} by {latestInspection.inspectorName}
              </p>
            </div>
            {(() => {
              const summary = inspectionSummary({
                // The query already filters to finalised (non-null) visits.
                totalLightsChecked: latestInspection.totalLightsChecked ?? 0,
                findingsCount: latestInspection.findings.length,
              });
              return summary.faultyLightsCount === 0 ? (
                <StatusChip tone="ok">
                  All {summary.totalLightsChecked} checked, none faulty
                </StatusChip>
              ) : (
                <StatusChip tone="warn">
                  {summary.faultyLightsCount} of {summary.totalLightsChecked} faulty
                </StatusChip>
              );
            })()}
          </div>
          <InspectionFindingsSummary
            findings={latestInspection.findings.map((f) => ({
              id: f.id,
              srNo: f.srNo,
              location: f.location,
              sensorStatus: f.sensorStatus,
              actionReplace: f.actionReplace,
              remarks: f.remarks,
            }))}
          />
          <p className="mt-3 text-[12.5px]">
            <Link href={`/portal/inspection/${latestInspection.id}`} className="font-semibold underline" style={{ color: "var(--accent)" }}>
              Download report
            </Link>
          </p>
          {latestInspection.evidencePhotoKey && (
            <p className="mt-4 text-[12.5px]">
              <a
                href={publicS3Url(latestInspection.evidencePhotoKey)}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
                style={{ color: "var(--accent)" }}
              >
                View the signed checklist
              </a>
            </p>
          )}
        </Card>
      )}

      {!agreement && rows.length === 0 ? (
        <EmptyState title="No documents filed yet">
          Savings reports, your agreement and inspection reports appear here as FirsThing files
          them.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Link
              href="/portal/documents"
              className="chip"
              style={
                activeType === null
                  ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                  : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
              }
            >
              All
            </Link>
            {typesPresent.map((t) => (
              <Link
                key={t}
                href={`/portal/documents?type=${t}`}
                className="chip"
                style={
                  activeType === t
                    ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                    : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
                }
              >
                {VISIBLE[t].label}
              </Link>
            ))}
          </div>

          {agreement && (activeType === null || activeType === "agreement") && (
            <Card className="mb-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <DocIcon tone="info" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">Signed agreement — the copy on record</p>
                    <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      {agreement.title} · {agreement.detail}
                    </p>
                  </div>
                </div>
                <a
                  href={agreement.portalHref}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  Download
                </a>
              </div>
            </Card>
          )}

          {[...byPeriod.entries()].map(([period, items]) => (
            <Card key={period} className="mb-5 p-5">
              <p className="lbl mb-2">{monthName(period)}</p>
              <div className="flex flex-col">
                {items.map((d, i) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    style={i < items.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <DocIcon tone={VISIBLE[d.docType].tone} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold" title={d.title}>
                          {d.title}
                        </p>
                        <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          <StatusChip tone={VISIBLE[d.docType].tone}>{VISIBLE[d.docType].label}</StatusChip> {d.detail}
                        </p>
                      </div>
                    </div>
                    {d.external ? (
                      <a href={d.portalHref} target="_blank" rel="noreferrer" className="btn-secondary">
                        Download
                      </a>
                    ) : (
                      <Link href={d.portalHref} className="btn-secondary">
                        Open &amp; download
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
