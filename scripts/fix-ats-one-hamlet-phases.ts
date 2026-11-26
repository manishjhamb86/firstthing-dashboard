/**
 * ATS One Hamlet (Basement Parking) was installed in two phases (2026-11-26,
 * the user's account): phase 1 signed off 14-Nov-2026 by AMAN (Estate
 * manager) on 850 lights, billing from 15-Nov; the full installation signed
 * off 23-Nov-2026 by AMAN, billing from 24-Nov. The phase migration turned its
 * single 23-Nov certificate into one final phase; this splits it, moves the
 * deal's first billing day back to 15-Nov, and re-derives what follows from it.
 *
 *   tsx scripts/fix-ats-one-hamlet-phases.ts --dry-run
 *   tsx scripts/fix-ats-one-hamlet-phases.ts
 */
import { db } from "@/lib/db";
import { prorateFirstMonth } from "@/lib/billing-start";
import { logChange } from "@/lib/change-log";
import { loggedThrough } from "@/lib/installation-phases";
import { projectCircuitMonitoring } from "@/lib/monitoring-projection";
import { rederiveInvoiceMonthsAfterRescale } from "@/lib/invoice-rederive";

const PROJECT = "cmvz96v5821tu1sp78c8zbzk7";
const dry = process.argv.includes("--dry-run");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const REASON = "Installed in two phases (user, 2026-11-26): phase 1 signed off 14-Nov-2026 on 850 lights, full installation 23-Nov-2026.";

(async () => {
  const actor = await db.adminUser.findUniqueOrThrow({ where: { email: "yogesh@firsthing.earth" }, select: { id: true } });
  const project = await db.installationProject.findUniqueOrThrow({
    where: { id: PROJECT },
    include: { certificate: true, phases: true, batches: true, pipeline: { select: { society: { select: { name: true } }, siteSurvey: { select: { id: true } } } } },
  });
  const cert = project.certificate!;
  const circuits = await db.circuit.findMany({ where: { siteSurveyId: project.pipeline.siteSurvey!.id, voidedAt: null }, select: { id: true, representedLightCount: true } });
  const days = project.batches.filter((b) => b.submittedAt && b.state !== "draft").map((b) => ({ day: b.day, installedCount: b.installedCount, workedOn: b.submittedAt }));
  const p1 = prorateFirstMonth(d("2026-11-14"));
  const p2 = prorateFirstMonth(d("2026-11-23"));
  const fullCount = loggedThrough(days, 10);
  console.log({
    society: project.pipeline.society.name,
    phasesNow: project.phases.map((p) => `${p.number}:${p.throughDay}:${p.isFinal}:${p.signedAt.toISOString().slice(0, 10)}`),
    certNow: `${cert.signedAt.toISOString().slice(0, 10)} billing ${cert.billingStartDate.toISOString().slice(0, 10)}`,
    circuits: circuits.map((c) => `${c.id}=${c.representedLightCount}`),
    loggedThroughDay9: loggedThrough(days, 9),
    loggedThroughDay10: fullCount,
    phase1Billing: p1.billingStart.toISOString().slice(0, 10), phase2Billing: p2.billingStart.toISOString().slice(0, 10),
  });
  if (circuits.length !== 1) throw new Error("Expected one circuit");
  if (project.phases.length !== 1 || !project.phases[0].isFinal) throw new Error("Expected the single final phase the migration created");
  if (dry) return process.exit(0);

  const oldStart = cert.billingStartDate;
  await db.$transaction(async (tx) => {
    await tx.installationPhase.update({
      where: { id: project.phases[0].id },
      data: { throughDay: 9, signedAt: d("2026-11-14"), lightsOverride: 850, isFinal: false, billingStartDate: p1.billingStart, proratedDays: p1.proratedDays, daysInMonth: p1.daysInMonth },
    });
    await tx.installationPhase.create({
      data: {
        projectId: PROJECT, number: 2, throughDay: 10, signedAt: d("2026-11-23"), signatoryName: cert.signatoryName, signatoryRole: cert.signatoryRole,
        lightsOverride: null, isFinal: true, billingStartDate: p2.billingStart, proratedDays: p2.proratedDays, daysInMonth: p2.daysInMonth, recordedById: actor.id,
      },
    });
    await tx.completionCertificate.update({
      where: { id: cert.id },
      data: {
        signedAt: d("2026-11-14"), billingStartDate: p1.billingStart, proratedDays: p1.proratedDays, daysInMonth: p1.daysInMonth,
        totalInstalledCount: 850, isPartial: true, partialReason: "Installed in phases", completedAt: d("2026-11-23"), completedById: actor.id,
      },
    });
    await logChange(tx, {
      entity: "completion_certificate", entityId: cert.id, kind: "edit", field: "phases",
      oldValue: { signedAt: cert.signedAt, billingStartDate: oldStart, totalInstalledCount: cert.totalInstalledCount },
      newValue: { phase1: { signedAt: "2026-11-14", lights: 850, billingStart: p1.billingStart }, phase2: { signedAt: "2026-11-23", lights: fullCount, billingStart: p2.billingStart } },
      reason: REASON, actorId: actor.id,
    });
    const c = circuits[0];
    if (c.representedLightCount !== fullCount) {
      await tx.circuit.update({ where: { id: c.id }, data: { representedLightCount: fullCount } });
      await tx.representedCountChange.create({
        data: { circuitId: c.id, previousCount: c.representedLightCount, nextCount: fullCount, effectiveFrom: "2026-11", reason: REASON, recordedById: actor.id },
      });
    }
  });
  await projectCircuitMonitoring(circuits[0].id, actor.id);
  await rederiveInvoiceMonthsAfterRescale(circuits[0].id, "2026-11", actor.id);
  const after = await db.installationPhase.findMany({ where: { projectId: PROJECT }, orderBy: { number: "asc" } });
  console.log("done", after.map((p) => `${p.number}:${p.throughDay}:${p.lightsOverride ?? "logged"}:${p.isFinal}:${p.billingStartDate.toISOString().slice(0, 10)}`));
  process.exit(0);
})();
