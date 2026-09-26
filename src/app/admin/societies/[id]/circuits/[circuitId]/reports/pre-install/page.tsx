import { PreInstallDoc } from "../pre-install-doc";
import { db } from "@/lib/db";
import { resolveAdmin, requireAdminPage } from "@/lib/admin-permissions";
import { reportTitle } from "@/lib/report-title";
import { notFound, redirect } from "next/navigation";
import { loadCircuitReport } from "../report-data";

export const dynamic = "force-dynamic";

// CON-45 — the pre-installation consumption report: the devices on the
// circuit, the theoretical figure they add to, every recorded day against
// it, and the finding. Renders straight from the store, so the paper and
// the database cannot disagree. Formatted on the shared report system
// (2026-08-31) — sheet, result first, columned days, a legend that states
// each band's numeric range.
export async function generateMetadata({ params }: { params: Promise<{ id: string; circuitId: string }> }) {
  // Titles only for a signed-in admin; the page itself does the real gating.
  if (!(await resolveAdmin())) return { title: "FirsThing" };
  const { id, circuitId } = await params;
  const c = await db.circuit.findFirst({ where: { id: circuitId, societyId: id }, select: { society: { select: { name: true } } } });
  return { title: reportTitle("Pre-installation consumption report", c?.society.name) };
}

export default async function PreInstallReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; circuitId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  if (!perms.includes("manage_survey") && !perms.includes("manage_pipeline")) redirect("/admin");

  const { id, circuitId } = await params;
  const { demo: demoParam } = await searchParams;
  const report = await loadCircuitReport(circuitId, demoParam ?? null);
  if (!report || report.society.id !== id) notFound();
return <PreInstallDoc report={report} backHref={`/admin/societies/${id}/circuits/${circuitId}`} canInvestigate />;
}
