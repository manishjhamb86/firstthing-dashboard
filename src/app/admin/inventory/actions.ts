"use server";

// Inventory & device lifecycle (2026-09-25) — docs/engineering/17-inventory-lifecycle.md.
// Thin shells around src/lib/inventory.ts. Field or pipeline staff record
// stock (receiving and moving it is their work); refusals are typed
// { error } and logged, the ledger is only ever appended to.

import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { resolveAdmin } from "@/lib/admin-permissions";
import { retailNameKey } from "@/lib/retail-customer";
import {
  MOVE_LABEL,
  batchCode,
  nextBatchSeq,
  nextState,
  refuseQuantityMove,
  balanceAt,
  unitCode,
  type MoveKind,
  type UnitStatus,
} from "@/lib/inventory";

type Result<T = object> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

async function requireStockStaff() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  return admin.permissions.includes("manage_survey") || admin.permissions.includes("manage_pipeline") ? admin : null;
}
const REFUSED = "Recording stock needs field or pipeline access.";

function day(s: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}
function notFuture(d: Date): boolean {
  const t = new Date();
  return d.getTime() <= Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

// ---------------------------------------------------------------------------
// Setup — offices, suppliers, item types
// ---------------------------------------------------------------------------

export async function createOffice(input: { name: string; address: string }): Promise<Result> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  if (!input.name.trim()) return { error: "Name the office." };
  const exists = await db.stockLocation.findFirst({ where: { kind: "office", name: { equals: input.name.trim(), mode: "insensitive" } } });
  if (exists) return { error: `An office named "${exists.name}" already exists.` };
  await db.stockLocation.create({ data: { kind: "office", name: input.name.trim(), address: input.address.trim() || null } });
  logger.info("inventory.office_created", { actorId: admin.id, name: input.name.trim() });
  revalidatePath("/admin/inventory/setup");
  return {};
}

export async function createSupplier(input: { name: string; gstin: string; contact: string; phone: string; email: string; address: string }): Promise<Result> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  const nameKey = retailNameKey(input.name);
  if (!nameKey) return { error: "Name the supplier." };
  const exists = await db.supplier.findUnique({ where: { nameKey } });
  if (exists) return { error: `A supplier named "${exists.name}" already exists.` };
  await db.supplier.create({
    data: {
      name: input.name.trim(),
      nameKey,
      gstin: input.gstin.trim().toUpperCase() || null,
      contact: input.contact.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      address: input.address.trim() || null,
    },
  });
  logger.info("inventory.supplier_created", { actorId: admin.id, name: input.name.trim() });
  revalidatePath("/admin/inventory/setup");
  return {};
}

export async function createItemType(input: {
  name: string;
  category: string;
  tracking: "serial" | "length" | "quantity";
  make: string;
  model: string;
  defaultWarrantyMonths: number | null;
}): Promise<Result> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  if (!input.name.trim()) return { error: "Name the item." };
  const exists = await db.inventoryItemType.findFirst({ where: { name: { equals: input.name.trim(), mode: "insensitive" } } });
  if (exists) return { error: `"${exists.name}" is already an item type.` };
  // The category comes from the managed list; a new one is added to it —
  // matched case-insensitively so "Light" and "light" stay one category.
  const catName = input.category.trim().toLowerCase();
  if (!catName) return { error: "Choose a category." };
  await db.inventoryCategory.upsert({ where: { name: catName }, create: { name: catName }, update: {} });
  input = { ...input, category: catName };
  // An item named after a light in the catalog is linked to it.
  const catalog = await db.deviceType.findFirst({ where: { name: { equals: input.name.trim(), mode: "insensitive" } }, select: { id: true } });
  await db.inventoryItemType.create({
    data: {
      name: input.name.trim(),
      category: input.category.trim() || "other",
      tracking: input.tracking,
      unit: input.tracking === "length" ? "m" : "pcs",
      make: input.make.trim() || null,
      model: input.model.trim() || null,
      defaultWarrantyMonths: input.defaultWarrantyMonths,
      deviceTypeId: catalog?.id ?? null,
    },
  });
  logger.info("inventory.item_type_created", { actorId: admin.id, name: input.name.trim(), tracking: input.tracking });
  revalidatePath("/admin/inventory/setup");
  return {};
}

// ---------------------------------------------------------------------------
// Receiving — a supplier invoice, its lines become batches, serial lines units
// ---------------------------------------------------------------------------

/** Presign a PUT for the supplier invoice PDF under the private Inventory/ prefix. */
export async function getSupplierInvoiceUploadUrl(fileName: string): Promise<Result<{ uploadUrl: string; key: string }>> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
  const key = `Inventory/Purchases/${new Date().toISOString().slice(0, 10)}/${Date.now()}_${safe}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: "application/pdf" }), { expiresIn: 300 });
  return { uploadUrl, key };
}

export type ReceiveLine = {
  itemTypeId: string;
  quantity: number;
  unitCost: number | null;
  supplierLot: string;
  manufacturedOn: string;
  warrantyMonths: number | null;
  warrantyBasis: "purchase" | "install";
  /** One per unit, in order, for serial items — optional (a SIM's ICCID, a meter id). */
  serialNumbers: string[];
};

export async function receiveDelivery(input: {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number | null;
  invoiceS3Key: string | null;
  invoiceFileName: string | null;
  receivedAtLocationId: string;
  receivedOn: string;
  notes: string;
  lines: ReceiveLine[];
}): Promise<Result<{ batchIds: string[] }>> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  const invoiceDate = day(input.invoiceDate);
  const receivedOn = day(input.receivedOn);
  if (!input.supplierId) return { error: "Choose the supplier." };
  if (!input.invoiceNumber.trim()) return { error: "Enter the supplier's invoice number." };
  if (!invoiceDate) return { error: "Enter the invoice date." };
  if (!receivedOn) return { error: "Enter the date it arrived." };
  if (!notFuture(receivedOn)) return { error: "The arrival date cannot be in the future." };
  if (receivedOn < invoiceDate) return { error: "It cannot have arrived before the invoice was raised." };
  if (input.lines.length === 0) return { error: "Add at least one item." };

  const office = await db.stockLocation.findUnique({ where: { id: input.receivedAtLocationId } });
  if (!office || office.kind !== "office") return { error: "Choose the office it arrived at." };
  const dup = await db.inventoryPurchase.findUnique({
    where: { supplierId_invoiceNumber: { supplierId: input.supplierId, invoiceNumber: input.invoiceNumber.trim() } },
  });
  if (dup) return { error: `Invoice ${input.invoiceNumber.trim()} from this supplier is already received.` };

  const types = await db.inventoryItemType.findMany({ where: { id: { in: input.lines.map((l) => l.itemTypeId) } } });
  for (const [i, l] of input.lines.entries()) {
    const t = types.find((x) => x.id === l.itemTypeId);
    if (!t) return { error: `Line ${i + 1}: choose the item.` };
    if (!(l.quantity > 0)) return { error: `Line ${i + 1}: enter how many ${t.unit} arrived.` };
    if (t.tracking !== "length" && !Number.isInteger(l.quantity)) return { error: `Line ${i + 1}: ${t.name} is counted in whole pieces.` };
    if (t.tracking === "serial" && l.quantity > 5000) return { error: `Line ${i + 1}: split a delivery of more than 5,000 units into batches.` };
    const serials = l.serialNumbers.map((s) => s.trim()).filter(Boolean);
    if (serials.length > 0 && serials.length !== l.quantity)
      return { error: `Line ${i + 1}: ${serials.length} manufacturer serials for ${l.quantity} units — give one per unit, or none.` };
  }

  // Batch codes: the next free numbers in the arrival month.
  const prefix = batchCode(receivedOn, 0).slice(0, 5); // "B2609"
  const monthCodes = (await db.inventoryBatch.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })).map((b) => b.code);
  let seq = nextBatchSeq(monthCodes);

  const batchIds = await db.$transaction(
    async (tx) => {
      const purchase = await tx.inventoryPurchase.create({
        data: {
          supplierId: input.supplierId,
          invoiceNumber: input.invoiceNumber.trim(),
          invoiceDate,
          total: input.total,
          invoiceS3Key: input.invoiceS3Key,
          invoiceFileName: input.invoiceFileName,
          notes: input.notes.trim() || null,
          createdById: admin.id,
        },
      });
      const ids: string[] = [];
      for (const l of input.lines) {
        const t = types.find((x) => x.id === l.itemTypeId)!;
        const code = batchCode(receivedOn, seq++);
        const batch = await tx.inventoryBatch.create({
          data: {
            code,
            itemTypeId: t.id,
            purchaseId: purchase.id,
            receivedAtLocationId: office.id,
            receivedOn,
            quantity: l.quantity,
            unitCost: l.unitCost,
            supplierLot: l.supplierLot.trim() || null,
            manufacturedOn: day(l.manufacturedOn),
            warrantyMonths: l.warrantyMonths ?? t.defaultWarrantyMonths,
            warrantyBasis: l.warrantyBasis,
            createdById: admin.id,
          },
        });
        ids.push(batch.id);
        if (t.tracking === "serial") {
          const serials = l.serialNumbers.map((s) => s.trim()).filter(Boolean);
          const units = Array.from({ length: l.quantity }, (_, i) => ({
            id: `${batch.id}-${i + 1}`,
            code: unitCode(code, i + 1),
            batchId: batch.id,
            itemTypeId: t.id,
            serialNumber: serials[i] ?? null,
            status: "in_stock" as const,
            locationId: office.id,
          }));
          await tx.inventoryUnit.createMany({ data: units });
          await tx.stockMovement.createMany({
            data: units.map((u) => ({
              kind: "receive" as const,
              on: receivedOn,
              itemTypeId: t.id,
              batchId: batch.id,
              unitId: u.id,
              quantity: 1,
              toLocationId: office.id,
              reason: `Received on invoice ${input.invoiceNumber.trim()}`,
              recordedById: admin.id,
            })),
          });
        } else {
          await tx.stockMovement.create({
            data: {
              kind: "receive",
              on: receivedOn,
              itemTypeId: t.id,
              batchId: batch.id,
              quantity: l.quantity,
              toLocationId: office.id,
              reason: `Received on invoice ${input.invoiceNumber.trim()}`,
              recordedById: admin.id,
            },
          });
        }
      }
      return ids;
    },
    { timeout: 60_000 },
  );
  logger.info("inventory.delivery_received", {
    actorId: admin.id,
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber.trim(),
    batches: batchIds.length,
    officeId: office.id,
  });
  revalidatePath("/admin/inventory");
  return { batchIds };
}

// ---------------------------------------------------------------------------
// Moving stock — the ledger
// ---------------------------------------------------------------------------

/** The site location for a society — created the first time anything is deployed there. */
async function siteFor(societyId: string): Promise<string | null> {
  const existing = await db.stockLocation.findUnique({ where: { societyId } });
  if (existing) return existing.id;
  const society = await db.society.findUnique({ where: { id: societyId }, select: { name: true, location: true } });
  if (!society) return null;
  const created = await db.stockLocation.create({ data: { kind: "site", name: society.name, address: society.location, societyId } });
  return created.id;
}

/** Where a move is going: an office, or a society's site. */
async function destination(kind: MoveKind, input: { toOfficeId: string; societyId: string }): Promise<{ id: string } | { error: string } | null> {
  if (kind === "deploy") {
    if (!input.societyId) return { error: "Choose the society it is deployed at." };
    const id = await siteFor(input.societyId);
    return id ? { id } : { error: "That society no longer exists." };
  }
  if (kind === "transfer" || kind === "return_to_office") {
    const office = input.toOfficeId ? await db.stockLocation.findUnique({ where: { id: input.toOfficeId } }) : null;
    if (!office || office.kind !== "office") return { error: "Choose the office." };
    return { id: office.id };
  }
  return null;
}

export type MoveResult = { done: number; failed: { code: string; error: string }[] };

/** Move serialized units — by code. Each unit is checked on its own; a refused one is named. */
export async function moveUnits(input: {
  codes: string[];
  kind: MoveKind;
  on: string;
  toOfficeId: string;
  societyId: string;
  circuitId: string;
  reason: string;
}): Promise<MoveResult> {
  const admin = await requireStockStaff();
  if (!admin) return { done: 0, failed: [{ code: "", error: REFUSED }] };
  const on = day(input.on);
  if (!on || !notFuture(on)) return { done: 0, failed: [{ code: "", error: "Enter the date it happened (not in the future)." }] };
  if (["mark_faulty", "scrap", "lost", "return_to_supplier"].includes(input.kind) && !input.reason.trim())
    return { done: 0, failed: [{ code: "", error: "Say why — it is kept with the record." }] };
  const dest = await destination(input.kind, input);
  if (dest && "error" in dest) return { done: 0, failed: [{ code: "", error: dest.error }] };

  const codes = [...new Set(input.codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const units = await db.inventoryUnit.findMany({ where: { code: { in: codes } }, include: { location: { select: { kind: true } } } });
  const failed: MoveResult["failed"] = codes.filter((c) => !units.some((u) => u.code === c)).map((c) => ({ code: c, error: "No unit has this code." }));
  let done = 0;
  for (const u of units) {
    const t = nextState(u.status as UnitStatus, input.kind);
    if ("error" in t) {
      failed.push({ code: u.code, error: t.error });
      continue;
    }
    const toId = t.to === "keep" ? u.locationId : t.to === "none" ? null : dest && "id" in dest ? dest.id : null;
    if (input.kind === "transfer" && toId === u.locationId) {
      failed.push({ code: u.code, error: "It is already at that office." });
      continue;
    }
    await db.$transaction([
      db.stockMovement.create({
        data: {
          kind: input.kind,
          on,
          itemTypeId: u.itemTypeId,
          batchId: u.batchId,
          unitId: u.id,
          quantity: 1,
          fromLocationId: t.to === "keep" ? null : u.locationId,
          toLocationId: t.to === "keep" ? null : toId,
          circuitId: input.kind === "deploy" ? input.circuitId || null : null,
          reason: input.reason.trim() || null,
          recordedById: admin.id,
        },
      }),
      db.inventoryUnit.update({
        where: { id: u.id },
        data: {
          status: t.status,
          locationId: toId,
          circuitId: input.kind === "deploy" ? input.circuitId || null : t.status === "deployed" ? u.circuitId : null,
          deployedOn: input.kind === "deploy" ? on : t.status === "deployed" || t.status === "faulty" ? u.deployedOn : null,
        },
      }),
    ]);
    done += 1;
  }
  logger.info("inventory.units_moved", { actorId: admin.id, kind: input.kind, requested: codes.length, done, failed: failed.length });
  revalidatePath("/admin/inventory");
  return { done, failed };
}

/** Move part of a quantity or length batch out of one location. */
export async function moveQuantity(input: {
  batchId: string;
  fromLocationId: string;
  kind: MoveKind;
  quantity: number;
  on: string;
  toOfficeId: string;
  societyId: string;
  circuitId: string;
  reason: string;
}): Promise<Result> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  const on = day(input.on);
  if (!on || !notFuture(on)) return { error: "Enter the date it happened (not in the future)." };
  if (!["transfer", "deploy", "return_to_office", "scrap", "lost", "return_to_supplier", "adjust"].includes(input.kind))
    return { error: `${MOVE_LABEL[input.kind]} applies to a single unit, not a quantity.` };
  if (["scrap", "lost", "return_to_supplier", "adjust"].includes(input.kind) && !input.reason.trim()) return { error: "Say why — it is kept with the record." };
  const batch = await db.inventoryBatch.findUnique({ where: { id: input.batchId }, include: { itemType: true } });
  if (!batch) return { error: "That batch no longer exists." };
  if (batch.itemType.tracking === "serial") return { error: "This batch is tracked by unit — move its units by code." };
  const movements = await db.stockMovement.findMany({ where: { batchId: batch.id }, select: { quantity: true, fromLocationId: true, toLocationId: true } });
  const available = balanceAt(movements, input.fromLocationId);
  const refusal = refuseQuantityMove(available, input.quantity, batch.itemType.unit);
  if (refusal) return { error: refusal };
  const dest = await destination(input.kind, input);
  if (dest && "error" in dest) return { error: dest.error };
  await db.stockMovement.create({
    data: {
      kind: input.kind,
      on,
      itemTypeId: batch.itemTypeId,
      batchId: batch.id,
      quantity: input.quantity,
      fromLocationId: input.fromLocationId,
      toLocationId: dest && "id" in dest ? dest.id : null,
      circuitId: input.kind === "deploy" ? input.circuitId || null : null,
      reason: input.reason.trim() || null,
      recordedById: admin.id,
    },
  });
  logger.info("inventory.quantity_moved", { actorId: admin.id, kind: input.kind, batchId: batch.id, quantity: input.quantity });
  revalidatePath("/admin/inventory");
  return {};
}
