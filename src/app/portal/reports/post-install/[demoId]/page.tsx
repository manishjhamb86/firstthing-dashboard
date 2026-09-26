import { notFound, redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { reportTitle } from "@/lib/report-title";
import { portalDemoFor } from "@/lib/portal-demo-reports";
import { loadCircuitReport } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/report-data";
import { PostInstallDoc } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/post-install-doc";

export const dynamic = "force-dynamic";

/**
 * The society's copy of a demo's Post-installation savings report.toLowerCase() (2026-09-27): the
 * same document the back office prints, built from the accepted days each
 * time it opens, shown once the demo is part of a shared demo report.
 */
export async function generateMetadata({ params }: { params: Promise<{ demoId: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { title: "FirsThing" };
  const { demoId } = await params;
  const d = await portalDemoFor(demoId, viewer.societyId);
  return { title: reportTitle("Post-installation savings report", d?.circuit.society.name, null) };
}

export default async function PortalPostInstallDocPage({ params }: { params: Promise<{ demoId: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "documents")) redirect("/portal");
  const { demoId } = await params;
  const demo = await portalDemoFor(demoId, viewer.societyId);
  if (!demo) notFound();
  const report = await loadCircuitReport(demo.circuitId, demo.id);
  if (!report || report.society.id !== viewer.societyId) notFound();
  if (!report.demo?.lightReplacementDate) notFound();
  return <PostInstallDoc report={report} backHref="/portal/documents" />;
}
