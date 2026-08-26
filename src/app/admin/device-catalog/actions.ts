"use server";

// CON-45 — the predefined device catalog behind every inventory and
// replacement dropdown. Adding a manufacturer's new fixture is a row here,
// not a code change; the 1-5 compatible-replacement mapping is what the
// installer's dropdown reads, so a 20W tube light only ever offers its own
// compatible list.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";

const PATH = "/admin/device-catalog";

type Outcome = { error: string } | { ok: true };

// Catalog maintenance is configuration that every circuit's arithmetic then
// rests on — the ops-lead proxy (both permissions), same as every other
// PER-01 gate in this codebase.
async function requireCatalogEditor() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  const perms = admin.permissions as string[];
  if (!perms.includes("manage_survey") || !perms.includes("manage_pipeline")) return null;
  return admin;
}

export async function createDeviceType(input: {
  name: string;
  role: "original" | "replacement";
  defaultWattage: number | null;
}): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) {
    logger.warn("catalog.create_refused", { role: input.role, name: input.name });
    return { error: "Maintaining the device catalog is an operations-lead action." };
  }

  const name = input.name.trim();
  if (name.length < 2) return { error: "Name the device — that's what every dropdown shows." };
  if (
    input.defaultWattage !== null &&
    (!Number.isFinite(input.defaultWattage) || input.defaultWattage <= 0 || input.defaultWattage > 2000)
  ) {
    return { error: "Default wattage must be between 1 and 2000 W, or left blank." };
  }

  const existing = await db.deviceType.findUnique({ where: { name } });
  if (existing) return { error: `"${name}" is already in the catalog.` };

  await db.deviceType.create({
    data: { name, role: input.role, defaultWattage: input.defaultWattage },
  });
  logger.info("catalog.device_type_created", { actorId: admin.id, name, role: input.role });
  revalidatePath(PATH);
  return { ok: true };
}

export async function setDeviceTypeActive(id: string, active: boolean): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) return { error: "Maintaining the device catalog is an operations-lead action." };

  const type = await db.deviceType.findUnique({ where: { id } });
  if (!type) return { error: "That device type no longer exists." };

  // Deactivation only hides a type from new selections — existing circuit
  // line items keep pointing at it, which is why delete doesn't exist here.
  await db.deviceType.update({ where: { id }, data: { active } });
  logger.info("catalog.device_type_active", { actorId: admin.id, id, active });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Replaces an original type's compatible-replacement set. 1-5 entries — the
 * user's own bound: a dropdown with more than five options stops being a
 * mapping and becomes the whole catalog again.
 */
export async function setReplacementOptions(
  originalTypeId: string,
  replacementTypeIds: string[],
): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) return { error: "Maintaining the device catalog is an operations-lead action." };

  const unique = [...new Set(replacementTypeIds)];
  if (unique.length > 5) return { error: "A device maps to at most 5 compatible replacements." };

  const original = await db.deviceType.findUnique({ where: { id: originalTypeId } });
  if (!original) return { error: "That device type no longer exists." };
  if (original.role !== "original") {
    return { error: "Compatibility is mapped from an original device to its replacements, not the other way." };
  }

  const replacements = await db.deviceType.findMany({
    where: { id: { in: unique }, role: "replacement", deletedAt: null },
  });
  if (replacements.length !== unique.length) {
    return { error: "Every mapped entry must be an existing replacement-role device." };
  }

  await db.$transaction([
    db.deviceReplacementOption.deleteMany({ where: { originalTypeId } }),
    db.deviceReplacementOption.createMany({
      data: unique.map((replacementTypeId) => ({ originalTypeId, replacementTypeId })),
    }),
  ]);
  logger.info("catalog.replacement_mapping_set", {
    actorId: admin.id,
    originalTypeId,
    count: unique.length,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateDeviceType(input: {
  id: string;
  name: string;
  defaultWattage: number | null;
  active: boolean;
}): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) {
    logger.warn("catalog.update_refused", { id: input.id });
    return { error: "Maintaining the device catalog is an operations-lead action." };
  }

  const name = input.name.trim();
  if (name.length < 2) return { error: "Name the device — that's what every dropdown shows." };
  if (
    input.defaultWattage !== null &&
    (!Number.isFinite(input.defaultWattage) || input.defaultWattage <= 0 || input.defaultWattage > 2000)
  ) {
    return { error: "Default wattage must be between 1 and 2000 W, or left blank." };
  }

  // The name is the unique key and every dropdown's label, so a rename must
  // not silently collide with another row.
  const clash = await db.deviceType.findFirst({ where: { name, id: { not: input.id } } });
  if (clash) return { error: `"${name}" is already in the catalog.` };

  // The ROLE is deliberately not editable. Flipping an original to a
  // replacement (or back) would strand every mapping and every recorded
  // inventory line that was made under the old meaning — remove it and add
  // the right one instead, which leaves both facts on the record.
  await db.deviceType.update({
    where: { id: input.id },
    data: { name, defaultWattage: input.defaultWattage, active: input.active },
  });
  logger.info("catalog.device_type_updated", { actorId: admin.id, id: input.id, name });
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteDeviceType(id: string): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) {
    logger.warn("catalog.delete_refused", { id });
    return { error: "Maintaining the device catalog is an operations-lead action." };
  }

  const target = await db.deviceType.findUnique({
    where: { id },
    include: { _count: { select: { circuitDevices: true, circuitReplacements: true } } },
  });
  if (!target) return { error: "That device is no longer in the catalog." };
  if (target.deletedAt) return { error: "That device has already been removed." };

  // Soft delete only. Every CircuitDevice line recorded against this type
  // helped produce a theoretical figure that a baseline was judged against;
  // the row has to stay for those to keep meaning anything. Removal takes it
  // out of the pickers, which is the whole point of removing it.
  await db.deviceType.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: admin.id, active: false },
  });
  logger.info("catalog.device_type_removed", {
    actorId: admin.id,
    id,
    inventoryLines: target._count.circuitDevices,
    replacementLines: target._count.circuitReplacements,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function restoreDeviceType(id: string): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) return { error: "Maintaining the device catalog is an operations-lead action." };
  const target = await db.deviceType.findUnique({ where: { id } });
  if (!target?.deletedAt) return { error: "That device has not been removed." };

  // Comes back inactive, so putting it in front of a surveyor again is a
  // separate, deliberate act.
  await db.deviceType.update({
    where: { id },
    data: { deletedAt: null, deletedById: null, active: false },
  });
  logger.info("catalog.device_type_restored", { actorId: admin.id, id });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * A surveyor on site meets a fixture the catalog does not have.
 *
 * They can add it themselves — waiting on an ops lead while standing in a
 * basement is how a survey ends up recorded from memory afterwards — but it
 * arrives PROPOSED. Its wattage feeds the theoretical figure a baseline is
 * judged against, and from there a benchmark a society is billed on, so a
 * number only the person who typed it has seen must not reach that. It is
 * usable on the circuit that proposed it once operations approves.
 */
export async function proposeDeviceType(input: {
  name: string;
  role: "original" | "replacement";
  defaultWattage: number | null;
  note?: string;
}): Promise<{ error: string } | { ok: true; id: string; name: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!(admin.permissions as string[]).includes("manage_survey")) {
    return { error: "Proposing a device needs field-survey access." };
  }

  const name = input.name.trim();
  if (name.length < 2) return { error: "Name the device — that's what every dropdown shows." };
  if (
    input.defaultWattage !== null &&
    (!Number.isFinite(input.defaultWattage) || input.defaultWattage <= 0 || input.defaultWattage > 2000)
  ) {
    return { error: "Wattage must be between 1 and 2000 W." };
  }

  const existing = await db.deviceType.findUnique({ where: { name } });
  if (existing) {
    // Including a rejected one: re-proposing under the same name would erase
    // the decision that rejected it.
    return {
      error:
        existing.status === "rejected"
          ? `"${name}" was proposed before and rejected${existing.rejectionReason ? ` — ${existing.rejectionReason}` : ""}.`
          : `"${name}" is already in the catalog.`,
    };
  }

  const created = await db.deviceType.create({
    data: {
      name,
      role: input.role,
      defaultWattage: input.defaultWattage,
      status: "proposed",
      // Not offered to anyone else until somebody decides it should be.
      inCatalog: false,
      proposedById: admin.id,
      proposedNote: input.note?.trim() || null,
    },
  });
  logger.info("catalog.device_type_proposed", {
    actorId: admin.id,
    name,
    role: input.role,
    wattage: input.defaultWattage,
  });
  revalidatePath(PATH);
  return { ok: true, id: created.id, name: created.name };
}

/**
 * Operations decides. Approving makes the figure usable; listing it is a
 * SECOND decision, because a one-off fixture in one basement is not
 * necessarily something every surveyor should be offered from now on.
 */
export async function decideDeviceTypeProposal(input: {
  id: string;
  approve: boolean;
  /** Only meaningful when approving. */
  addToCatalog?: boolean;
  /** Required when rejecting — a refusal with no reason cannot be acted on. */
  reason?: string;
}): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) {
    logger.warn("catalog.proposal_decision_refused", { deviceTypeId: input.id });
    return { error: "Deciding a proposed device is an operations-lead action." };
  }

  const type = await db.deviceType.findUnique({ where: { id: input.id } });
  if (!type) return { error: "That device is no longer on record." };
  if (type.status !== "proposed") return { error: `"${type.name}" has already been decided.` };

  if (!input.approve) {
    const reason = input.reason?.trim();
    if (!reason) return { error: "Say why it is being rejected — the surveyor has to know what to record instead." };
    await db.deviceType.update({
      where: { id: type.id },
      data: { status: "rejected", rejectionReason: reason, approvedById: admin.id, approvedAt: new Date() },
    });
    logger.info("catalog.device_type_rejected", { actorId: admin.id, name: type.name, reason });
    revalidatePath(PATH);
    return { ok: true };
  }

  await db.deviceType.update({
    where: { id: type.id },
    data: {
      status: "approved",
      approvedById: admin.id,
      approvedAt: new Date(),
      inCatalog: input.addToCatalog ?? false,
    },
  });
  logger.info("catalog.device_type_approved", {
    actorId: admin.id,
    name: type.name,
    addedToCatalog: input.addToCatalog ?? false,
  });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * This proposed device is one the catalog already has.
 *
 * Confirm/Reject was the whole choice, and neither fits a duplicate: rejecting
 * leaves the circuit pointing at a device nobody will approve, and confirming
 * puts a second entry for one fixture in the catalog — two answers to what
 * that circuit should be drawing (user-reported 2026-08-26).
 *
 * Merging moves every inventory line onto the existing device and closes the
 * proposal as merged. The proposal row survives, saying what it became: a
 * device that silently disappeared would leave the surveyor who added it
 * wondering whether it was ever seen.
 */
export async function mergeDeviceTypeProposal(input: { id: string; intoId: string }): Promise<Outcome> {
  const admin = await requireCatalogEditor();
  if (!admin) return { error: "Deciding a proposed device is an operations-lead action." };
  if (input.id === input.intoId) return { error: "Choose a different device to merge it into." };

  const [proposal, target] = await Promise.all([
    db.deviceType.findUnique({ where: { id: input.id } }),
    db.deviceType.findUnique({ where: { id: input.intoId } }),
  ]);
  if (!proposal || !target) return { error: "That device is no longer on record." };
  if (proposal.status !== "proposed") return { error: `"${proposal.name}" has already been decided.` };
  if (target.status !== "approved") return { error: `"${target.name}" is not a confirmed device.` };
  if (target.role !== proposal.role) return { error: "A device can only be merged into one of the same kind." };

  const moved = await db.$transaction(async (tx) => {
    // The inventory lines keep their own wattage and hours — those were read
    // from the document and are the circuit's own record. Only which
    // catalogued device they point at changes.
    const r = await tx.circuitDevice.updateMany({
      where: { deviceTypeId: proposal.id },
      data: { deviceTypeId: target.id },
    });
    await tx.circuitDevice.updateMany({
      where: { replacementTypeId: proposal.id },
      data: { replacementTypeId: target.id },
    });
    await tx.deviceType.update({
      where: { id: proposal.id },
      data: {
        status: "rejected",
        rejectionReason: `Merged into "${target.name}" — the same fixture under another name.`,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    return r.count;
  });

  logger.info("catalog.device_type_merged", {
    actorId: admin.id,
    from: proposal.name,
    into: target.name,
    linesMoved: moved,
  });
  revalidatePath(PATH);
  return { ok: true };
}
