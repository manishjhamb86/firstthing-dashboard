/**
 * Prateek Laurel's real installation (the user's record, 2026-11-27): 19 days,
 * entered after the old entries were cleared to start phase 1 fresh.
 * Each day is planned for what was installed, logged, and approved by the
 * society, with photos waived as recorded after the fact. Phase 1 is then
 * signed off through the app's own signPhaseAs — 14-Oct-2026, billing from
 * 15-Oct, on 2,000 lights (1,961 full installation + 39 demo), signed by
 * "Society AWA Member" as before. Phase 2 (24-Oct onward) stays in progress.
 *
 *   tsx scripts/enter-prateek-laurel-installation.ts --dry-run
 *   tsx scripts/enter-prateek-laurel-installation.ts
 */
import { db } from "@/lib/db";
import { logChange } from "@/lib/change-log";
import { signPhaseAs } from "@/lib/installation-core";
import { projectCircuitMonitoring } from "@/lib/monitoring-projection";

const dry = process.argv.includes("--dry-run");
const AREA = "—";
const DAYS: [string, number][] = [
  ["2026-09-03", 51], ["2026-09-04", 100], ["2026-09-05", 100], ["2026-09-06", 152], ["2026-09-07", 100],
  ["2026-09-09", 50], ["2026-09-13", 96], ["2026-09-14", 150], ["2026-09-15", 198], ["2026-09-16", 250],
  ["2026-09-18", 148], ["2026-09-30", 200], ["2026-10-01", 249], ["2026-10-02", 200], ["2026-10-13", 100],
  ["2026-10-14", 74],
  // Phase 2
  ["2026-10-24", 26], ["2026-11-19", 149], ["2026-11-20", 46],
];
const PHASE1_THROUGH = 16;

(async () => {
  const actor = await db.adminUser.findUniqueOrThrow({ where: { email: "yogesh@firsthing.earth" }, select: { id: true } });
  const society = await db.society.findFirstOrThrow({ where: { name: "Prateek Laurel" }, select: { id: true } });
  const project = await db.installationProject.findFirstOrThrow({
    where: { societyId: society.id },
    include: { plannedDays: true, batches: true, phases: true, certificate: true },
  });
  if (project.plannedDays.length || project.batches.length || project.phases.length || project.certificate) {
    throw new Error("Refusing: the project already has days, batches, phases or a certificate.");
  }
  // The society's office-bearer approves each day (the review is the society's act).
  const reviewer = await db.profile.findFirstOrThrow({
    where: { societyId: society.id, isActive: true, portalAuthority: "office_bearer" },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const total = DAYS.reduce((s, [, n]) => s + n, 0);
  const p1 = DAYS.slice(0, PHASE1_THROUGH).reduce((s, [, n]) => s + n, 0);
  console.log({ project: project.id, reviewer: reviewer.email, days: DAYS.length, total, phase1: p1, dry });
  if (dry) process.exit(0);

  await db.$transaction(async (tx) => {
    for (let i = 0; i < DAYS.length; i++) {
      const [date, count] = DAYS[i];
      const day = i + 1;
      const plannedDate = new Date(`${date}T00:00:00.000Z`);
      const pd = await tx.installationPlannedDay.create({
        data: {
          projectId: project.id,
          day,
          plannedDate,
          startAt: new Date(`${date}T03:30:00.000Z`), // 09:00 IST
          areaKey: AREA,
          plannedCount: count,
          onlookerId: reviewer.id,
        },
      });
      const batch = await tx.installationBatch.create({
        data: {
          projectId: project.id,
          plannedDayId: pd.id,
          day,
          areaKey: AREA,
          installedCount: count,
          photosWaivedReason: "Entered after the fact from the installation record (2026-11-27).",
          state: "approved",
          submittedById: actor.id,
          submittedAt: new Date(`${date}T12:30:00.000Z`),
        },
      });
      await tx.batchReview.create({
        data: { batchId: batch.id, decision: "approved", reviewedById: reviewer.id, reviewedAt: new Date(`${date}T14:30:00.000Z`), note: "Entered after the fact from the installation record." },
      });
    }
    await logChange(tx, {
      entity: "installation_project",
      entityId: project.id,
      kind: "installation_entered",
      newValue: { days: DAYS.length, total, phase1: p1 },
      reason: "Prateek Laurel: real installation entered from the user's record (2026-11-27).",
      actorId: actor.id,
    });
  }, { timeout: 60000 });

  const pipeline = await db.pipeline.findUniqueOrThrow({ where: { id: project.pipelineId }, select: { id: true } });
  const r = await signPhaseAs(actor, pipeline.id, {
    throughDay: PHASE1_THROUGH,
    signedAt: "2026-10-14",
    signatoryName: "Society AWA Member",
    signatoryRole: "Society AWA Member",
    lightsOverride: 1961,
    isFinal: false,
  });
  console.log("phase 1:", r);
  if ("error" in r) process.exit(1);

  // The deal's billing start is 15-Oct again; re-project its monitoring days.
  const circuits = await db.circuit.findMany({ where: { societyId: society.id, voidedAt: null }, select: { id: true } });
  for (const c of circuits) console.log("projection", c.id, await projectCircuitMonitoring(c.id, actor.id));
  process.exit(0);
})();
