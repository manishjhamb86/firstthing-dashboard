import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Letterhead } from "@/components/letterhead";
import { BackButton } from "@/components/back-button";
import { DemoReportView } from "@/components/demo-report-view";
import { formatDate } from "@/lib/format-date";
import { reportTitle } from "@/lib/report-title";
import { dealLabel } from "@/lib/deal-scope";
import { PrintInspectionButton } from "../../../inspection/[id]/print-button";

export const dynamic = "force-dynamic";

/**
 * A shared demo savings report, to read and download (2026-09-26, user-asked):
 * once FirsThing shares it, it sits in the society's Documents like every
 * other report. Print → "Save as PDF", the same pattern as the other reports.
 * Scoped to the viewer's own society in the query (INV-05), and only a SHARED
 * report — a draft is FirsThing's working state.
 */
async function load(id: string, societyId: string) {
  return db.demoReport.findFirst({
    where: { id, status: "shared", pipeline: { societyId } },
    include: { pipeline: { select: { serviceLine: true, dealScope: true, society: { select: { name: true, location: true } } } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { title: "FirsThing" };
  const { id } = await params;
  const r = await load(id, viewer.societyId);
  return { title: reportTitle("Demo savings report", r?.pipeline.society.name, null) };
}

export default async function PortalDemoReportPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "documents")) redirect("/portal");
  const { id } = await params;
  const report = await load(id, viewer.societyId);
  if (!report) notFound();

  return (
    <div className="print-doc mx-auto max-w-[1100px] p-4 sm:p-8">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref="/portal/documents" />
        <div className="flex-1" />
        <PrintInspectionButton />
      </div>
      <Letterhead>
        <article className="report-sheet">
          <header className="report-masthead">
            <div className="min-w-0 flex-1">
              <p className="lbl" style={{ color: "var(--accent)" }}>
                FirsThing · Demo savings report
              </p>
              <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{report.pipeline.society.name}</h1>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                {report.pipeline.society.location}
                <br />
                {dealLabel(report.pipeline.serviceLine, report.pipeline.dealScope)} · measured on the demo circuits, extrapolated society-wide
              </p>
            </div>
            <div className="report-period">
              <p className="text-[20px] font-bold tracking-[-0.01em]">Version {report.version}</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Shared <span className="num">{formatDate(report.sharedAt ?? report.generatedAt)}</span>
              </p>
            </div>
          </header>
          <div className="px-6 pb-8 pt-6 sm:px-8">
            <DemoReportView report={report} />
          </div>
        </article>
      </Letterhead>
    </div>
  );
}
