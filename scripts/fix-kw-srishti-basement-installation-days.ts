/**
 * KW Srishti — Basement Parking installation days (2026-11-18, user-specified).
 *
 * The Basement deal's installation recorded 2,700 lights over four days, two
 * of them marked "lift lobby" — but the lift lobby is its own deal, with its
 * own installation (3 × 156 + 49 demo = 517). Only 2,208 − 49 demo = 2,159
 * lights went into the basement. The user's chosen correction:
 *   day 1: 500, dated 11-Aug-2026 (was 11-Sep, after the 14-Aug certificate)
 *   day 2: 1,000 (unchanged)
 *   day 3: 659, basement (was 1,000 "lift lobby")
 *   day 4: removed (was 200 "lift lobby")
 * the project's stored survey copy 2,700 → 2,208 (the survey as it stands), and
 * the completion certificate's total installed 2,700 → 2,159 (the sum of the
 * logged days, as it is computed at signing — lift lobby's reads 468).
 * Every change writes a ChangeLog row with its old value.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/fix-kw-srishti-basement-installation-days.ts --dry-run
 */
import { db } from "../src/lib/db";
import { logChange } from "../src/lib/change-log";

const PROJECT = "cmu81i2dg001t8uqsnnfa4e11";
const REASON = "Corrected at the user's instruction: only 2,208 − 49 demo = 2,159 lights went into the basement; the lift lobby is its own deal and installation.";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const project = await db.installationProject.findUnique({
    where: { id: PROJECT },
    include: { certificate: true, plannedDays: { orderBy: { day: "asc" } }, batches: { orderBy: { day: "asc" }, include: { review: true } }, pipeline: { select: { dealScope: true, societyId: true } } },
  });
  if (!project || project.pipeline.societyId !== "soc-kw-srishti" || project.pipeline.dealScope !== "Basement Parking") throw new Error("Not KW Srishti's Basement installation — stopping.");
  const day = (n: number) => project.plannedDays.find((d) => d.day === n);
  const batch = (n: number) => project.batches.find((b) => b.day === n);
  const [d1, d3, d4] = [day(1), day(3), day(4)];
  const [b3, b4] = [batch(3), batch(4)];
  if (!d1 || !d3 || !d4 || !b3 || !b4) throw new Error("Days are not as expected — stopping.");
  if (d3.areaKey !== "lift lobby" || d3.plannedCount !== 1000 || d4.plannedCount !== 200 || b3.installedCount !== 1000 || b4.installedCount !== 200) {
    throw new Error("Already corrected or changed since — stopping.");
  }
  const admin = await db.adminUser.findUnique({ where: { email: "yogesh@firsthing.earth" }, select: { id: true } });
  const shift = (d: Date) => new Date(Date.UTC(2026, 7, 11, d.getUTCHours(), d.getUTCMinutes()));

  console.log({ day1: [d1.plannedDate, d1.startAt], day3: [d3.areaKey, d3.plannedCount, b3.installedCount], day4: [d4.plannedCount, b4.installedCount], surveyed: project.surveyedLightCount, certificate: project.certificate?.totalInstalledCount });
  if (dryRun) return console.log("dry run — nothing written");

  await db.$transaction(async (tx) => {
    const actorId = admin?.id ?? null;
    const log = (entity: string, entityId: string, field: string, oldValue: unknown, newValue: unknown) =>
      logChange(tx, { entity, entityId, kind: "installation_correction", field, oldValue, newValue, reason: REASON, actorId });

    await tx.installationPlannedDay.update({ where: { id: d1.id }, data: { plannedDate: new Date(Date.UTC(2026, 7, 11)), startAt: shift(d1.startAt) } });
    await log("InstallationPlannedDay", d1.id, "plannedDate", d1.plannedDate, "2026-08-11");

    await tx.installationPlannedDay.update({ where: { id: d3.id }, data: { areaKey: "basement", plannedCount: 659 } });
    await log("InstallationPlannedDay", d3.id, "areaKey,plannedCount", { areaKey: d3.areaKey, plannedCount: d3.plannedCount }, { areaKey: "basement", plannedCount: 659 });
    await tx.installationBatch.update({ where: { id: b3.id }, data: { areaKey: "basement", installedCount: 659 } });
    await log("InstallationBatch", b3.id, "areaKey,installedCount", { areaKey: b3.areaKey, installedCount: b3.installedCount }, { areaKey: "basement", installedCount: 659 });

    await log("InstallationBatch", b4.id, "deleted", b4, null);
    await tx.installationBatch.delete({ where: { id: b4.id } });
    await log("InstallationPlannedDay", d4.id, "deleted", d4, null);
    await tx.installationPlannedDay.delete({ where: { id: d4.id } });

    await tx.installationProject.update({ where: { id: PROJECT }, data: { surveyedLightCount: 2208 } });
    await log("InstallationProject", PROJECT, "surveyedLightCount", project.surveyedLightCount, 2208);
    if (project.certificate) {
      await tx.completionCertificate.update({ where: { id: project.certificate.id }, data: { totalInstalledCount: 2159 } });
      await log("CompletionCertificate", project.certificate.id, "totalInstalledCount", project.certificate.totalInstalledCount, 2159);
    }
  });
  const after = await db.installationBatch.aggregate({ where: { projectId: PROJECT }, _sum: { installedCount: true } });
  console.log("done — basement now logs", after._sum.installedCount, "lights");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
