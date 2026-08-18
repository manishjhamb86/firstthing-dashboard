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
