import "./load-env";
import { db } from "@/lib/db";
import { logChange } from "@/lib/change-log";

const CIRCUIT_ID = "cmu5bji2s0aq2ioqsoapmfqi7";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  const circuit = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { lightCountAtDemoLock: true } });
  console.log("lightCountAtDemoLock before:", circuit?.lightCountAtDemoLock);
  if (circuit?.lightCountAtDemoLock === 42) {
    console.log("already correct, nothing to do");
    return;
  }
  if (DRY_RUN) {
    console.log("[dry run] would set lightCountAtDemoLock", circuit?.lightCountAtDemoLock, "-> 42");
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.circuit.update({ where: { id: CIRCUIT_ID }, data: { lightCountAtDemoLock: 42 } });
    await logChange(tx, {
      entity: "circuit",
      entityId: CIRCUIT_ID,
      kind: "edit",
      field: "lightCountAtDemoLock",
      circuitId: CIRCUIT_ID,
      oldValue: circuit?.lightCountAtDemoLock ?? null,
      newValue: 42,
      reason: "One-off: this snapshot was frozen before setDemoLightCount followed corrections into it — applying the same rule retroactively for this circuit's already-corrected demo.",
      actorId: ACTOR_ID,
    });
  });
  const after = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { lightCountAtDemoLock: true } });
  console.log("lightCountAtDemoLock after:", after?.lightCountAtDemoLock);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
