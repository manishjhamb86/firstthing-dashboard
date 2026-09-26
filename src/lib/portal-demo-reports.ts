import { db } from "@/lib/db";

/**
 * A demo's pre-/post-installation report is the society's to read once it is
 * part of a demo report FirsThing has SHARED with them (2026-09-27, user-
 * asked: "there should be both documents, pre-install and post-install") —
 * the same line the portal's demo report already draws: a draft is
 * FirsThing's working state. Scoped to the viewer's own society (INV-05).
 */
export async function sharedDemoIdsFor(societyId: string): Promise<Set<string>> {
  const reports = await db.demoReport.findMany({
    where: { status: "shared", pipeline: { societyId } },
    select: { demoIds: true },
  });
  return new Set(reports.flatMap((r) => r.demoIds));
}

export async function portalDemoFor(demoId: string, societyId: string) {
  const shared = await sharedDemoIdsFor(societyId);
  if (!shared.has(demoId)) return null;
  return db.circuitDemo.findFirst({
    where: { id: demoId, voidedAt: null, circuit: { societyId, voidedAt: null } },
    select: { id: true, circuitId: true, sequence: true, lightReplacementDate: true, circuit: { select: { location: true, lightType: true, society: { select: { name: true } } } } },
  });
}
