import { db } from "@/lib/db";

/**
 * The full installation as INSTALLED, per circuit (2026-11-28, user-caught:
 * Prateek Laurel's inventory read 2,000 — the billed count after phase 1 —
 * while 2,439 lights were logged on the installation days).
 *
 * A circuit's `representedLightCount` is what the bill uses, and a phased
 * installation bills only the lights signed off so far. What is installed is
 * the installation record: the lights logged on the deal's installation
 * days. So wherever a deal has logged days, its circuits' installed full
 * installation is that total; a deal with no installation record (one that
 * predates the system) keeps the represented count.
 *
 * Applied only when the deal's circuits stand for one location (one circuit,
 * or a redone demo of the same area): a deal whose circuits cover different
 * areas cannot split one logged total between them, so it keeps its counts.
 */
export async function installedFullByCircuit(
  circuits: Array<{ id: string; siteSurveyId: string | null; location: string | null }>,
): Promise<Map<string, number>> {
  const surveyIds = [...new Set(circuits.map((c) => c.siteSurveyId).filter((v): v is string => !!v))];
  if (surveyIds.length === 0) return new Map();
  const surveys = await db.siteSurvey.findMany({
    where: { id: { in: surveyIds } },
    select: {
      id: true,
      pipeline: {
        select: {
          installationProject: { select: { batches: { where: { state: { not: "draft" } }, select: { installedCount: true } } } },
        },
      },
    },
  });
  const out = new Map<string, number>();
  for (const s of surveys) {
    const batches = s.pipeline.installationProject?.batches ?? [];
    if (batches.length === 0) continue;
    const logged = batches.reduce((n, b) => n + b.installedCount, 0);
    const members = circuits.filter((c) => c.siteSurveyId === s.id);
    const places = new Set(members.map((c) => (c.location ?? "").trim().toLowerCase()));
    if (places.size > 1) continue;
    for (const c of members) out.set(c.id, logged);
  }
  return out;
}
