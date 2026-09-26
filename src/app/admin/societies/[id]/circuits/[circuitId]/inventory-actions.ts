"use server";

// CON-45 — the circuit's load inventory: what physically hangs off this
// circuit, line by line. Σ(count × wattage × hours) ÷ 1000 is the
// theoretical daily kWh every pre-install reading is judged against, so
// these rows are billing-relevant data, not free-form notes.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isDemoMode } from "@/lib/demo-mode";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logChange } from "@/lib/change-log";
import { demoLockState } from "@/lib/demo-lock";
import { planCountCorrection } from "@/lib/count-correction";
import { resyncCircuitFigures } from "@/lib/circuit-figures";

type Outcome = { error: string } | { ok: true };

function circuitPath(societyId: string, circuitId: string) {
  return `/admin/societies/${societyId}/circuits/${circuitId}`;
}

// Inventory capture is PER-04's field data — manage_survey, same gate as
// load validation and the commissioning readings.
async function requireSurveyor() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  if (!(admin.permissions as string[]).includes("manage_survey")) return null;
  return admin;
}

/**
 * A line item is editable until the lights are replaced. After that the
 * inventory is what the replacement was recorded against — editing it would
 * silently detach the recorded replacements and the theoretical figure from
 * what was actually on the wall. Same shape as the FEAT-040 guard on
 * meteredLightCount once a baseline exists.
 */
type EditableGate =
  | { error: string; circuit?: never }
  | { error?: never; circuit: { id: string; societyId: string } };

async function editableCircuit(circuitId: string, historical = false): Promise<EditableGate> {
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      societyId: true,
      voidedAt: true,
      demos: { where: { voidedAt: null, rejected: false, meterInstalledAt: { not: null } }, select: { id: true }, take: 1 },
    },
  });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };

  // The lock moved earlier, to meter install: from that point the theoretical
  // figure is what every pre-install reading is judged against. The UI hides
  // the controls, but this is the enforcement — a hidden button is not a gate.
  if (circuit.demos.length > 0 && !historical && !(await isDemoMode())) {
    return {
      error:
        "The meter is installed — the load inventory is locked, because the pre-install readings are judged against it. An operations lead can correct a count that was typed wrong.",
    };
  }
  // The freeze still holds for ordinary edits — after replacement the
  // inventory IS the record the replacement was judged against. What it must
  // not do is block backfilling a circuit that was commissioned before this
  // system existed: there, the record does not exist yet and the freeze is
  // protecting nothing. Such a line comes through explicitly marked
  // historical, so the reconstruction is visible in the data rather than
  // indistinguishable from a line captured on site.
  if (historical && !(await isDemoMode())) {
    return {
      error:
        "Backfilling a past record is only available in demo mode. An operations lead can correct a count that was typed wrong.",
    };
  }
  return { circuit: { id: circuit.id, societyId: circuit.societyId } };
}

function validateLine(input: { count: number; wattage: number; hoursPerDay: number }) {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 5000) {
    return "Count must be a whole number between 1 and 5000.";
  }
  if (!Number.isFinite(input.wattage) || input.wattage <= 0 || input.wattage > 2000) {
    return "Per-unit wattage must be between 1 and 2000 W.";
  }
  if (!Number.isFinite(input.hoursPerDay) || input.hoursPerDay <= 0 || input.hoursPerDay > 24) {
    return "Hours per day must be between 1 and 24.";
  }
  return null;
}

export async function addCircuitDevice(input: {
  circuitId: string;
  deviceTypeId: string;
  count: number;
  wattage: number;
  hoursPerDay: number;
  note?: string;
  /** entered after the fact for a circuit commissioned before this system */
  historical?: boolean;
  historicalNote?: string;
}): Promise<Outcome> {
  const admin = await requireSurveyor();
  if (!admin) {
    logger.warn("inventory.add_refused", { circuitId: input.circuitId });
    return { error: "Recording the load inventory is a field-survey action." };
  }

  const gate = await editableCircuit(input.circuitId, input.historical === true);
  if (gate.error !== undefined) return { error: gate.error };

  const type = await db.deviceType.findUnique({ where: { id: input.deviceTypeId } });
  if (!type || !type.active || type.role !== "original") {
    return { error: "Pick a device from the catalog — if it's missing, ops can add it there." };
  }
  const invalid = validateLine(input);
  if (invalid) return { error: invalid };

  await db.circuitDevice.create({
    data: {
      circuitId: gate.circuit.id,
      deviceTypeId: type.id,
      count: input.count,
      wattage: input.wattage,
      hoursPerDay: input.hoursPerDay,
      note: input.note?.trim() || null,
      historical: input.historical === true,
      historicalNote: input.historical === true ? input.historicalNote?.trim() || null : null,
      recordedById: admin.id,
    },
  });
  logger.info("inventory.line_added", {
    actorId: admin.id,
    circuitId: gate.circuit.id,
    deviceTypeId: type.id,
    count: input.count,
    wattage: input.wattage,
    hoursPerDay: input.hoursPerDay,
    historical: input.historical === true,
  });
  revalidatePath(circuitPath(gate.circuit.societyId, gate.circuit.id));
  return { ok: true };
}

export async function updateCircuitDevice(input: {
  lineId: string;
  count: number;
  wattage: number;
  hoursPerDay: number;
  note?: string;
}): Promise<Outcome> {
  const admin = await requireSurveyor();
  if (!admin) return { error: "Recording the load inventory is a field-survey action." };

  const line = await db.circuitDevice.findUnique({ where: { id: input.lineId } });
  if (!line) return { error: "That line item no longer exists." };
  // A line already marked historical stays editable after the freeze — a
  // reconstruction gets corrected as the paper record is checked, which is
  // exactly the workflow the flag exists to support.
  const gate = await editableCircuit(line.circuitId, line.historical);
  if (gate.error !== undefined) return { error: gate.error };

  const invalid = validateLine(input);
  if (invalid) return { error: invalid };

  await db.circuitDevice.update({
    where: { id: line.id },
    data: {
      count: input.count,
      wattage: input.wattage,
      hoursPerDay: input.hoursPerDay,
      note: input.note?.trim() || null,
    },
  });
  logger.info("inventory.line_updated", { actorId: admin.id, lineId: line.id, circuitId: line.circuitId });
  revalidatePath(circuitPath(gate.circuit.societyId, gate.circuit.id));
  return { ok: true };
}

export async function removeCircuitDevice(lineId: string): Promise<Outcome> {
  const admin = await requireSurveyor();
  if (!admin) return { error: "Recording the load inventory is a field-survey action." };

  const line = await db.circuitDevice.findUnique({ where: { id: lineId } });
  if (!line) return { error: "That line item no longer exists." };
  const gate = await editableCircuit(line.circuitId, line.historical);
  if (gate.error !== undefined) return { error: gate.error };

  await db.circuitDevice.delete({ where: { id: line.id } });
  logger.info("inventory.line_removed", { actorId: admin.id, lineId, circuitId: line.circuitId });
  revalidatePath(circuitPath(gate.circuit.societyId, gate.circuit.id));
  return { ok: true };
}

/**
 * Correct a count that was typed wrong on a LOCKED inventory (2026-09-26,
 * user-asked). The lock stops the inventory being edited as though the
 * lights changed; a typo is not a change in the lights, and the locked
 * notice used to send the operator to "an administrator" with no route to
 * one. Operations only, a reason required, every value it moves recorded
 * with its old figure. A real change in lights is still a light-count change.
 */
export async function correctLockedCount(input: { lineId: string; count: number; reason: string }): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const p = admin.permissions as string[];
  if (!(p.includes("manage_survey") && p.includes("manage_pipeline"))) {
    logger.warn("inventory.count_correction_refused", { actorId: admin.id, lineId: input.lineId, reason: "not_ops" });
    return { error: "Correcting a locked count is an operations lead action." };
  }
  const reason = input.reason?.trim() ?? "";
  if (!reason) return { error: "Say what was wrong — a correction with no stated reason cannot be reviewed later." };

  const line = await db.circuitDevice.findUnique({ where: { id: input.lineId }, select: { circuitId: true } });
  if (!line) return { error: "That inventory line is no longer on record." };
  const circuit = await db.circuit.findUnique({
    where: { id: line.circuitId },
    select: {
      id: true,
      societyId: true,
      voidedAt: true,
      meteredLightCount: true,
      siteSurvey: { select: { pipelineId: true } },
      devices: { select: { id: true, count: true, replacementCount: true } },
      demos: { where: { voidedAt: null }, select: { id: true, sequence: true, meteredLightCount: true, unlockedUntil: true } },
    },
  });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." };

  const plan = planCountCorrection({
    lines: circuit.devices,
    lineId: input.lineId,
    newCount: input.count,
    circuitMeteredCount: circuit.meteredLightCount,
    demos: circuit.demos,
  });
  if ("error" in plan) return { error: plan.error };

  // A demo the society has seen in a shared report is locked: correcting it
  // changes what they were shown, so it is unlocked first, as for any edit.
  const pipelineId = circuit.siteSurvey?.pipelineId;
  const demoMode = await isDemoMode();
  if (pipelineId && !demoMode) {
    const shared = new Set(
      (await db.demoReport.findMany({ where: { pipelineId, status: "shared" }, select: { demoIds: true } })).flatMap((r) => r.demoIds),
    );
    const locked = circuit.demos.filter(
      (d) => plan.demoIds.includes(d.id) && !demoLockState({ sharedInReport: shared.has(d.id), unlockedUntil: d.unlockedUntil, demoMode, now: new Date() }).editable,
    );
    if (locked.length > 0) {
      logger.warn("inventory.count_correction_refused", { actorId: admin.id, lineId: input.lineId, reason: "demo_locked" });
      return { error: `Demo ${locked.map((d) => d.sequence).join(", ")} carries this count and is in a report shared with the society — unlock it for correction first.` };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.circuitDevice.update({
      where: { id: input.lineId },
      data: { count: plan.newCount, ...(plan.replacementCount !== "unchanged" ? { replacementCount: plan.replacementCount } : {}) },
    });
    await logChange(tx, { entity: "circuit_device", entityId: input.lineId, kind: "edit", field: "count", circuitId: circuit.id, oldValue: plan.oldCount, newValue: plan.newCount, reason, actorId: admin.id });
    if (plan.circuitMeteredCount !== null) {
      await tx.circuit.update({ where: { id: circuit.id }, data: { meteredLightCount: plan.circuitMeteredCount } });
      await logChange(tx, { entity: "circuit", entityId: circuit.id, kind: "edit", field: "meteredLightCount", circuitId: circuit.id, oldValue: plan.totalOld, newValue: plan.circuitMeteredCount, reason, actorId: admin.id });
    }
    for (const demoId of plan.demoIds) {
      await tx.circuitDemo.update({ where: { id: demoId }, data: { meteredLightCount: plan.totalNew } });
      await logChange(tx, { entity: "circuit_demo", entityId: demoId, kind: "edit", field: "meteredLightCount", circuitId: circuit.id, demoId, oldValue: plan.totalOld, newValue: plan.totalNew, reason, actorId: admin.id });
    }
    await resyncCircuitFigures(tx, circuit.id, admin.id);
  });
  logger.info("inventory.count_corrected", {
    actorId: admin.id,
    circuitId: circuit.id,
    lineId: input.lineId,
    from: plan.oldCount,
    to: plan.newCount,
    circuitMetered: plan.circuitMeteredCount,
    demos: plan.demoIds.length,
    reason,
  });
  revalidatePath(circuitPath(circuit.societyId, circuit.id));
  return { ok: true };
}
