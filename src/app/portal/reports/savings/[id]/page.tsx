import { notFound, redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { db } from "@/lib/db";
import { BackButton } from "@/components/back-button";
import { MonthlySavingsSheet } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/monthly-sheet";
import type { SavingsReportSnapshot } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/report-data";
import { PrintInspectionButton as PrintButton } from "@/app/portal/inspection/[id]/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Savings report" };

/**
 * A published monthly savings report, exactly as FirsThing published it —
 * rendered from the frozen snapshot, not recomputed, so what the society
 * reads and saves as PDF is what was published. INV-05: scoped by the
 * viewer's own societyId in the query.
 */
export default async function PortalSavingsReportPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "documents")) redirect("/portal");
  const { id } = await params;

  const report = await db.publishedSavingsReport.findFirst({
    where: { id, societyId: viewer.societyId, voidedAt: null },
    select: { snapshot: true },
  });
  if (!report) notFound();

  return (
    <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref="/portal/documents" />
        <div className="flex-1" />
        <PrintButton />
      </div>
      <MonthlySavingsSheet s={report.snapshot as unknown as SavingsReportSnapshot} />
    </div>
  );
}
