"use server";

// Inventory & device lifecycle (2026-09-25) — docs/engineering/17-inventory-lifecycle.md.
// Thin shells around src/lib/inventory.ts. Field or pipeline staff record
// stock (receiving and moving it is their work); refusals are typed
// { error } and logged, the ledger is only ever appended to.

import { revalidatePath } from "next/cache";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { resolveAdmin } from "@/lib/admin-permissions";
import { retailNameKey } from "@/lib/retail-customer";
import { applyUnitMove, moveDestination, siteFor, type MoveResult as UnitMoveResult } from "@/lib/inventory-move";
import {
  MOVE_LABEL,
  batchCode,
  nextBatchSeq,
  refuseQuantityMove,
  balanceAt,
  unitCode,
  type MoveKind,
  refuseUnitCost,
} from "@/lib/inventory";
import { friendlySupplierExtractionError, readSupplierInvoiceWithRetry } from "@/lib/supplier-invoice-extract";
import { proposeItemType, proposeSupplier } from "@/lib/supplier-invoice-match";

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

export type SupplierInvoiceProposedLine = {
  itemTypeId: string | null;
  itemLabel: string | null;
  description: string;
  quantity: number | null;
  unitCost: number | null;
  supplierLot: string;
};

export type SupplierInvoiceProposal = {
  supplierId: string | null;
  sellerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number | null;
  lines: SupplierInvoiceProposedLine[];
  notes: string;
};

/**
 * Read the already-uploaded supplier invoice PDF back and propose the
 * Receive stock form's fields (2026-10-14, user-asked: "Stock lines should
 * auto populate on invoice upload"). Never writes anything — the operator
 * still reviews and submits through `receiveDelivery` exactly as before;
 * this only saves them re-typing what the PDF already says.
 */
export async function extractSupplierInvoiceForm(key: string): Promise<Result<{ proposal: SupplierInvoiceProposal }>> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };

  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    return { error: "The uploaded file could not be read back from storage. Choose it again." };
  }

  let extraction;
  try {
    extraction = await readSupplierInvoiceWithRetry(bytes);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    logger.warn("inventory.invoice_extraction_failed", { actorId: admin.id, key, message: raw.slice(0, 300) });
    return { error: friendlySupplierExtractionError(raw) };
  }

  const [suppliers, items] = await Promise.all([
    db.supplier.findMany({ select: { id: true, name: true } }),
    db.inventoryItemType.findMany({ where: { active: true }, select: { id: true, name: true, make: true, model: true } }),
  ]);
  const supplier = proposeSupplier(extraction.sellerName.value, suppliers);
  const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(extraction.invoiceDate.value) ? extraction.invoiceDate.value : "";

  const lines: SupplierInvoiceProposedLine[] = extraction.lines.map((l) => {
    const match = proposeItemType(l.description.value, items);
    return {
      itemTypeId: match?.itemTypeId ?? null,
      itemLabel: match ? (items.find((i) => i.id === match.itemTypeId)?.name ?? null) : null,
      description: l.description.value,
      quantity: l.qty.value,
      unitCost: l.rate.value,
      supplierLot: l.supplierLot.value,
    };
  });

  logger.info("inventory.invoice_extracted", { actorId: admin.id, key, lines: lines.length, matchedSupplier: !!supplier });
  return {
    proposal: {
      supplierId: supplier?.id ?? null,
      sellerName: extraction.sellerName.value,
      invoiceNumber: extraction.invoiceNumber.value,
      invoiceDate,
      total: extraction.total.value,
      lines,
      notes: extraction.notes,
    },
  };
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
    const costRefusal = refuseUnitCost(l.unitCost);
    if (costRefusal) return { error: `Line ${i + 1}: ${costRefusal}` };
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
/** Where a move is going: an office, or a society's site. */
async function destination(kind: MoveKind, input: { toOfficeId: string; societyId: string }): Promise<{ id: string } | { error: string } | null> {
  return moveDestination(db, kind, input);
}

export type MoveResult = UnitMoveResult;

/**
 * Move serialized units — by code. Each unit is checked on its own; a refused
 * one is named. The rules live in src/lib/inventory-move.ts, shared with the
 * field app's queued move; the whole move is one transaction.
 */
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
  const r = await db.$transaction((tx) => applyUnitMove(tx, admin.id, input));
  if ("error" in r) return { done: 0, failed: [{ code: "", error: r.error }] };
  logger.info("inventory.units_moved", { actorId: admin.id, kind: input.kind, requested: input.codes.length, done: r.done, failed: r.failed.length });
  revalidatePath("/admin/inventory");
  return r;
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

/** What a list of scanned codes are, for the scan screen's running list. */
export async function lookupScanned(codes: string[]): Promise<Array<{ code: string; found: boolean; item?: string; status?: string; location?: string | null }>> {
  const admin = await requireStockStaff();
  if (!admin) return [];
  const wanted = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, 500);
  const units = await db.inventoryUnit.findMany({
    where: { code: { in: wanted } },
    select: { code: true, status: true, itemType: { select: { name: true } }, location: { select: { name: true } } },
  });
  const by = new Map(units.map((u) => [u.code, u]));
  return wanted.map((code) => {
    const u = by.get(code);
    return u ? { code, found: true, item: u.itemType.name, status: u.status, location: u.location?.name ?? null } : { code, found: false };
  });
}

/**
 * Add or correct a batch's cost per piece or metre (2026-09-25) — for stock
 * received before cost was known, or a mistyped rate. The cost is what values
 * the stock; it never changes a count or a movement.
 */
export async function setBatchCost(batchId: string, unitCost: number | null): Promise<Result> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  const refusal = refuseUnitCost(unitCost);
  if (refusal) return { error: refusal };
  const b = await db.inventoryBatch.findUnique({ where: { id: batchId }, select: { unitCost: true, code: true } });
  if (!b) return { error: "That batch no longer exists." };
  await db.inventoryBatch.update({ where: { id: batchId }, data: { unitCost } });
  logger.info("inventory.batch_cost_set", { actorId: admin.id, batchId, code: b.code, from: b.unitCost, to: unitCost });
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/batches/${batchId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Existing inventory (2026-10-12, user-asked) — stock that was already in
// place before this system existed, with no supplier invoice or batch
// number to trace it to. A real batch and (for a serial-tracked item) real,
// printable unit codes are still generated, exactly as a normal receipt
// gets — only the supplier invoice is skipped, since there genuinely isn't
// one. `InventoryBatch.historical` is the one fact that distinguishes it
// from a real delivery everywhere a batch is shown.
// ---------------------------------------------------------------------------

export async function receiveHistoricalStock(input: {
  itemTypeId: string;
  count: number;
  since: string;
  locationKind: "office" | "society";
  officeId: string;
  societyId: string;
  notes: string;
}): Promise<Result<{ batchId: string }>> {
  const admin = await requireStockStaff();
  if (!admin) return { error: REFUSED };
  const since = day(input.since);
  if (!since) return { error: "Enter when this stock was already in place." };
  if (!notFuture(since)) return { error: "That date cannot be in the future." };

  const type = await db.inventoryItemType.findUnique({ where: { id: input.itemTypeId } });
  if (!type) return { error: "Choose the item." };
  if (!(input.count > 0)) return { error: `Enter how many ${type.unit} there already are.` };
  if (type.tracking !== "length" && !Number.isInteger(input.count)) return { error: `${type.name} is counted in whole pieces.` };
  if (type.tracking === "serial" && input.count > 5000) return { error: "Split a count of more than 5,000 units into separate entries." };

  let locationId: string;
  let deploy = false;
  if (input.locationKind === "society") {
    if (!input.societyId) return { error: "Choose the society it is already at." };
    const site = await siteFor(db, input.societyId);
    if (!site) return { error: "That society no longer exists." };
    locationId = site;
    deploy = true;
  } else {
    const office = input.officeId ? await db.stockLocation.findUnique({ where: { id: input.officeId } }) : null;
    if (!office || office.kind !== "office") return { error: "Choose the office it is already at." };
    locationId = office.id;
  }

  const prefix = batchCode(since, 0).slice(0, 5);
  const monthCodes = (await db.inventoryBatch.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })).map((b) => b.code);
  const seq = nextBatchSeq(monthCodes);
  const code = batchCode(since, seq);
  const reason = input.notes.trim() || "Existing inventory — already in place before FirsThing, no supplier invoice on record.";

  const batchId = await db.$transaction(
    async (tx) => {
      const batch = await tx.inventoryBatch.create({
        data: {
          code,
          itemTypeId: type.id,
          purchaseId: null,
          historical: true,
          receivedAtLocationId: locationId,
          receivedOn: since,
          quantity: input.count,
          unitCost: null,
          warrantyMonths: null,
          warrantyBasis: "install",
          notes: reason,
          createdById: admin.id,
        },
      });
      if (type.tracking === "serial") {
        const status: "deployed" | "in_stock" = deploy ? "deployed" : "in_stock";
        const units = Array.from({ length: input.count }, (_, i) => ({
          id: `${batch.id}-${i + 1}`,
          code: unitCode(code, i + 1),
          batchId: batch.id,
          itemTypeId: type.id,
          status,
          locationId,
          deployedOn: deploy ? since : null,
        }));
        await tx.inventoryUnit.createMany({ data: units });
        await tx.stockMovement.createMany({
          data: units.map((u) => ({
            kind: "receive" as const,
            on: since,
            itemTypeId: type.id,
            batchId: batch.id,
            unitId: u.id,
            quantity: 1,
            toLocationId: locationId,
            reason,
            recordedById: admin.id,
          })),
        });
      } else {
        await tx.stockMovement.create({
          data: {
            kind: "receive",
            on: since,
            itemTypeId: type.id,
            batchId: batch.id,
            quantity: input.count,
            toLocationId: locationId,
            reason,
            recordedById: admin.id,
          },
        });
      }
      return batch.id;
    },
    { timeout: 60_000 },
  );
  logger.info("inventory.historical_received", { actorId: admin.id, batchId, itemTypeId: type.id, count: input.count, locationId, deployed: deploy });
  revalidatePath("/admin/inventory");
  return { batchId };
}
