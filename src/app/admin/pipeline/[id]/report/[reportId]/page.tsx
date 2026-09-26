import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { BackButton } from "@/components/back-button";
import { DemoReportDocument } from "@/components/demo-report-document";
import { reportTitle } from "@/lib/report-title";
import { PrintInspectionButton } from "@/app/portal/inspection/[id]/print-button";

export const dynamic = "force-dynamic";

async function load(pipelineId: string, reportId: string) {
  return db.demoReport.findFirst({
    where: { id: reportId, pipelineId },
    include: { pipeline: { select: { serviceLine: true, dealScope: true, society: { select: { name: true, location: true } } } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params;
  const r = await load(id, reportId);
  return { title: reportTitle("Demo savings report", r?.pipeline.society.name, null) };
}

/**
 * The back office's printable copy of a demo savings report — any version,
 * draft or shared (2026-09-26, user-asked: the back office had no way to
 * print or download it). The same document the society prints, on the
 * letterhead; Print → "Save as PDF".
 */
export default async function AdminDemoReportPrintPage({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");
  const { id, reportId } = await params;
  const report = await load(id, reportId);
  if (!report) notFound();

  return (
    <div className="print-doc mx-auto max-w-[1100px]">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref={`/admin/pipeline/${id}/report`} />
        <div className="flex-1" />
        <PrintInspectionButton />
      </div>
      <DemoReportDocument report={report} />
    </div>
  );
}
