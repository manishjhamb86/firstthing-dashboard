import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { buildInspectionPdf, inspectionPdfFileName } from "@/lib/inspection-pdf";

/**
 * The inspection report as a PDF, generated on demand from the filed record
 * (2026-11-18) — so it always says what the inspection says, and nothing is
 * stored that could fall out of step with it.
 *
 * Under /api, which proxy.ts does not cover, so the gate is here: any active
 * admin (back office, or the inspector on the field app), or a portal member
 * of THIS society holding the documents grant (INV-05 — the society comes
 * from the viewer's own row, never from the request). Only a finished,
 * unvoided inspection has a report.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await resolveAdmin();
  let societyScope: string | null = null;
  let actor: string;
  if (admin) {
    actor = admin.id;
  } else {
    const viewer = await resolvePortalViewer();
    if (!viewer?.societyId || !hasGrant(viewer, "documents")) {
      logger.warn("inspection.pdf_refused", { inspectionId: id, reason: viewer ? "no_documents_grant" : "not_signed_in" });
      return new Response("Not found", { status: 404 });
    }
    societyScope = viewer.societyId;
    actor = viewer.id;
  }

  const inspection = await db.inspection.findFirst({
    where: { id, voidedAt: null, totalLightsChecked: { not: null }, ...(societyScope ? { societyId: societyScope } : {}) },
    include: { society: { select: { name: true, location: true } }, findings: { orderBy: { srNo: "asc" } } },
  });
  if (!inspection) return new Response("Not found", { status: 404 });

  const bytes = await buildInspectionPdf({
    id: inspection.id,
    societyName: inspection.society.name,
    societyLocation: inspection.society.location,
    area: inspection.area,
    period: inspection.period,
    inspectedAt: inspection.inspectedAt,
    inspectorName: inspection.inspectorName,
    inspectorContact: inspection.inspectorContact,
    totalLightsChecked: inspection.totalLightsChecked!,
    societyRepName: inspection.societyRepName,
    notes: inspection.notes,
    findings: inspection.findings,
    generatedAt: new Date(),
  });
  logger.info("inspection.pdf_downloaded", { inspectionId: id, actorId: actor, via: admin ? "admin" : "portal" });
  const fileName = inspectionPdfFileName(inspection.society.name, inspection.period, inspection.id);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
