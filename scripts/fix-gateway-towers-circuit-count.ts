import "./load-env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logChange } from "@/lib/change-log";
import { rederiveInvoiceMonthsAfterRescale } from "@/lib/invoice-rederive";

const CIRCUIT_ID = "cmu5bji2s0aq2ioqsoapmfqi7";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const BAD_RESCALE_EVENT_ID = "cmv542mtt0004hwp7gedgilyu"; // the 01-Mar-2026, 55->52 entry
const CORRECT_REPRESENTED = 517; // demo(42) + full(517) = 559, the known-correct total
const DRY_RUN = process.env.DRY_RUN === "1";

async function voidBadRescaleEvent() {
  const event = await db.benchmarkRescaleEvent.findUnique({
    where: { id: BAD_RESCALE_EVENT_ID },
    include: { circuit: { select: { id: true, societyId: true, meteredLightCount: true } } },
  });
  if (!event) throw new Error("rescale event not found");
  if (event.circuitId !== CIRCUIT_ID) throw new Error("rescale event belongs to a different circuit");
  if (event.voidedAt) {
    console.log("rescale event already voided, nothing to do");
    return;
  }

  const survivors = await db.benchmarkRescaleEvent.findMany({
    where: { circuitId: event.circuitId, voidedAt: null, id: { not: BAD_RESCALE_EVENT_ID } },
    orderBy: { effectiveDate: "asc" },
  });
  const circuitForBaseline = await db.circuit.findUnique({ where: { id: event.circuitId }, select: { preInstallBaseline: true } });
  const restoredCount = survivors.length ? survivors[survivors.length - 1].newLightCount : event.previousLightCount;
  console.log("voiding rescale event, survivors:", survivors.map((s) => ({ id: s.id, effectiveDate: s.effectiveDate, newLightCount: s.newLightCount })));
  console.log("restoredCount will be:", restoredCount);

  if (DRY_RUN) {
    console.log("[dry run] would void rescale event and set meteredLightCount to", restoredCount);
    return;
  }

  await db.$transaction([
    db.benchmarkRescaleEvent.update({
      where: { id: BAD_RESCALE_EVENT_ID },
      data: {
        voidedAt: new Date(),
        voidedById: ACTOR_ID,
        voidReason:
          "Backdated to 01-Mar-2026, before the genuine 01-Sep-2026 recount it tried to reverse — created while troubleshooting the demo light-count issue, not a real field recount. Voided to restore the circuit's actual metered count (55, from the 01-Sep event).",
      },
    }),
    db.circuit.update({ where: { id: event.circuitId }, data: { meteredLightCount: restoredCount } }),
  ]);

  logger.info("circuit.rescale_voided", {
    actorId: ACTOR_ID,
    eventId: BAD_RESCALE_EVENT_ID,
    circuitId: event.circuitId,
    restoredCount,
    effectiveBaselineNow: survivors.length ? survivors[survivors.length - 1].rescaledBaseline : (circuitForBaseline?.preInstallBaseline ?? null),
  });

  const earliest = event.effectiveDate.toISOString().slice(0, 7);
  const r = await rederiveInvoiceMonthsAfterRescale(event.circuitId, earliest, ACTOR_ID);
  console.log("rederiveInvoiceMonthsAfterRescale result:", r);
}

async function fixRepresentedLightCount() {
  const circuit = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { representedLightCount: true, meteredLightCount: true } });
  if (!circuit) throw new Error("circuit not found");
  console.log("circuit state before fix:", circuit);
  const demo = await db.circuitDemo.findFirst({ where: { circuitId: CIRCUIT_ID, voidedAt: null }, orderBy: { sequence: "asc" }, select: { id: true, meteredLightCount: true } });
  console.log("initial demo:", demo);

  if (circuit.representedLightCount === CORRECT_REPRESENTED) {
    console.log("representedLightCount already correct, nothing to do");
    return;
  }

  if (DRY_RUN) {
    console.log("[dry run] would set representedLightCount", circuit.representedLightCount, "->", CORRECT_REPRESENTED);
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.circuit.update({ where: { id: CIRCUIT_ID }, data: { representedLightCount: CORRECT_REPRESENTED } });
    await logChange(tx, {
      entity: "circuit",
      entityId: CIRCUIT_ID,
      kind: "edit",
      field: "representedLightCount",
      circuitId: CIRCUIT_ID,
      demoId: demo?.id ?? null,
      oldValue: circuit.representedLightCount,
      newValue: CORRECT_REPRESENTED,
      reason:
        "The 05-Oct-2026 backfill (517 -> 507) was logged but never actually written to the database — the column stayed at 517, and the 12-Oct-2026 demo-count correction then computed its own adjustment from that stale 517, producing 527 and a total of 569. Restoring the correct value directly: demo (42) + full installation (517) = 559, the known-correct total installed.",
      actorId: ACTOR_ID,
    });
  });
  console.log("representedLightCount corrected to", CORRECT_REPRESENTED);
}

async function main() {
  console.log("DRY_RUN:", DRY_RUN);
  await voidBadRescaleEvent();
  await fixRepresentedLightCount();

  const after = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { meteredLightCount: true, representedLightCount: true } });
  const demoAfter = await db.circuitDemo.findFirst({ where: { circuitId: CIRCUIT_ID, voidedAt: null }, orderBy: { sequence: "asc" }, select: { meteredLightCount: true } });
  console.log("FINAL circuit state:", after);
  console.log("FINAL demo state:", demoAfter);
  console.log("total installed (demo + full):", (after?.representedLightCount ?? 0) + (demoAfter?.meteredLightCount ?? 0));
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
