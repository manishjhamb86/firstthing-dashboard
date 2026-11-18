"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { isSignedCopyType, presignInspectionEvidence } from "@/lib/inspection-file";

/**
 * The society uploading the signed copy of its own inspection report
 * (2026-11-18, user-asked) — the representative signs the printed PDF and the
 * society can attach the photo or scan itself, not only the inspector.
 * Scoped to the viewer's own society from their row (INV-05) and to the
 * documents grant, the same gate the report page itself has.
 */
async function viewerInspection(id: string) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session is no longer valid. Sign in again." } as const;
  if (!hasGrant(viewer, "documents")) {
    logger.warn("inspection.signed_copy_refused", { viewerId: viewer.id, inspectionId: id, reason: "no_documents_grant", via: "portal" });
    return { error: "Your account cannot see this society's documents." } as const;
  }
  const inspection = await db.inspection.findFirst({
    where: { id, societyId: viewer.societyId, voidedAt: null, totalLightsChecked: { not: null } },
    select: { id: true, period: true, society: { select: { name: true } } },
  });
  if (!inspection) return { error: "That inspection report is not available." } as const;
  return { viewer, inspection } as const;
}

export async function getPortalSignedCopyUploadUrl(input: {
  inspectionId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const found = await viewerInspection(input.inspectionId);
  if ("error" in found) return { error: found.error! };
  if (!isSignedCopyType(input.contentType)) return { error: "Upload a photo or a PDF scan of the signed report." };
  const presigned = await presignInspectionEvidence({
    inspectionId: found.inspection.id,
    societyName: found.inspection.society.name,
    period: found.inspection.period,
    fileName: input.fileName,
    contentType: input.contentType,
  });
  logger.info("inspection.evidence_presigned", { viewerId: found.viewer.id, inspectionId: input.inspectionId, key: presigned.key, via: "portal" });
  return presigned;
}

export async function attachPortalSignedCopy(input: { id: string; key: string }): Promise<{ error?: string }> {
  const found = await viewerInspection(input.id);
  if ("error" in found) return { error: found.error };
  if (!input.key.startsWith("Documents/") || !input.key.includes(input.id)) {
    logger.warn("inspection.signed_copy_refused", { viewerId: found.viewer.id, inspectionId: input.id, reason: "foreign_key", via: "portal" });
    return { error: "That upload does not belong to this inspection — upload it again." };
  }
  await db.inspection.update({ where: { id: input.id }, data: { evidencePhotoKey: input.key } });
  logger.info("inspection.signed_copy_attached", { viewerId: found.viewer.id, inspectionId: input.id, key: input.key, via: "portal" });
  revalidatePath(`/portal/inspection/${input.id}`);
  revalidatePath("/portal/documents");
  return {};
}
