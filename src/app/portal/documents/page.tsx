import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, EmptyState, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { publicS3Url } from "@/lib/s3";
import { monthName } from "../portal-widgets";
import { inspectionSummary } from "@/lib/inspection";
import { InspectionFindingsSummary } from "./inspection-findings";
import { FileText } from "lucide-react";

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
const VISIBLE: Record<string, { label: string; tone: ChipTone }> = {
  agreement: { label: "Agreement", tone: "info" },
  savingsReport: { label: "Savings report", tone: "info" },
  preDemoReport: { label: "Demo report (before)", tone: "neu" },
  postDemoReport: { label: "Demo report (after)", tone: "neu" },
  inspectionReport: { label: "Inspection report", tone: "ok" },
  // Invoices filed from intake (2026-09-25) — only once released to the
  // society; filing alone does not publish (see RELEASE_GATED below).
  invoiceCopy: { label: "Invoice", tone: "warn" },
  nonServiceInvoice: { label: "Invoice (other charges)", tone: "warn" },
};
/** Types that reach the society only once FirsThing has released them. */
const RELEASE_GATED = ["invoiceCopy", "nonServiceInvoice"];

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

  const docs = await db.storedDocument.findMany({
    where: {
      societyId,
      voidedAt: null,
      OR: [
        { docType: { in: Object.keys(VISIBLE).filter((t) => !RELEASE_GATED.includes(t)) } },
        { docType: { in: RELEASE_GATED }, releasedToSocietyAt: { not: null } },
      ],
    },
    orderBy: [{ period: "desc" }, { uploadedAt: "desc" }],
    select: {
      id: true,
      docType: true,
      period: true,
      version: true,
      fileName: true,
      byteSize: true,
      s3Key: true,
      uploadedAt: true,
    },
  });

  // Only the LATEST version of each slot: superseded versions are the back
  // office's history, not the society's downloads list.
  const latest = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    const slot = `${d.docType}|${d.period}`;
    if (!latest.has(slot)) latest.set(slot, d);
  }
  const all = [...latest.values()];

  // Monthly savings reports FirsThing has published (2026-09-24) — the
  // latest version of each circuit-month, rendered from its frozen snapshot.
  const published = await db.publishedSavingsReport.findMany({
    where: { societyId, voidedAt: null },
    orderBy: [{ period: "desc" }, { version: "desc" }],
    select: { id: true, circuitId: true, period: true, version: true, publishedAt: true, snapshot: true },
  });
  const latestReport = new Map<string, (typeof published)[number]>();
  for (const r of published) {
    const slot = `${r.circuitId}|${r.period}`;
    if (!latestReport.has(slot)) latestReport.set(slot, r);
  }

  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  type Row = { id: string; docType: string; period: string; title: string; detail: string; href: string; external: boolean };
  const agreement = all.find((d) => d.docType === "agreement");
  const rows: Row[] = [
    ...all
      .filter((d) => d.id !== agreement?.id)
      .map((d) => ({
        id: d.id,
        docType: d.docType,
        period: d.period,
        title: d.fileName,
        detail: `filed ${formatDate(d.uploadedAt)} · ${kb(d.byteSize)}${d.version > 1 ? ` · v${d.version}` : ""}`,
        href: publicS3Url(d.s3Key),
        external: true,
      })),
    ...[...latestReport.values()].map((r) => {
      const snap = r.snapshot as { circuitLabel?: string };
      return {
        id: r.id,
        docType: "savingsReport",
        period: r.period,
        title: `Monthly savings report — ${snap.circuitLabel ?? "circuit"}`,
        detail: `published ${formatDate(r.publishedAt)}${r.version > 1 ? ` · v${r.version}` : ""}`,
        href: `/portal/reports/savings/${r.id}`,
        external: false,
      };
    }),
  ];
  const typesPresent = [...new Set([...(agreement ? ["agreement"] : []), ...rows.map((d) => d.docType)])];
  const shown = activeType ? rows.filter((d) => d.docType === activeType) : rows;
  const byPeriod = new Map<string, Row[]>();
  for (const d of [...shown].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))) {
    if (!byPeriod.has(d.period)) byPeriod.set(d.period, []);
    byPeriod.get(d.period)!.push(d);
  }

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Everything on record for your society, ready to download."
      />

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
                      {agreement.fileName} · {kb(agreement.byteSize)}
                    </p>
                  </div>
                </div>
                <a
                  href={publicS3Url(agreement.s3Key)}
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
                      <a href={d.href} target="_blank" rel="noreferrer" className="btn-secondary">
                        Download
                      </a>
                    ) : (
                      <Link href={d.href} className="btn-secondary">
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
