"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { docCode, refusePrLines } from "@/lib/stock-plan";
import { loadPlanning } from "@/lib/stock-workflow-loader";
import {
  installFromSlipAs,
  issueStockAs,
  moveSlipDueAs,
  returnFromSlipAs,
  setInstalledCountAs,
  type IssueInput,
  type SlipActionResult,
  type SlipLine,
} from "@/lib/stock-workflow";

// The stock workflow's back-office acts (2026-11-23). Every refusal is a
// typed `{ error }` and a log line; nothing throws to the browser.

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
const REFUSED = "Stock work needs field or pipeline access.";

async function staff() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  return admin.permissions.includes("manage_survey") || admin.permissions.includes("manage_pipeline") ? admin : null;
}

const day = (s: string): Date | null => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

function refresh() {
  revalidatePath("/admin/inventory", "layout");
}

// ---------------------------------------------------------------------------
// Typed requirements
// ---------------------------------------------------------------------------

/** Set (or clear, with null) a society's typed requirement for an item. */
export async function setStockRequirement(input: { societyId: string; itemTypeId: string; quantity: number | null; note: string }): Promise<Result> {
  const admin = await staff();
  if (!admin) {
    logger.warn("stock.requirement_refused", { reason: "permission" });
    return { error: REFUSED };
  }
  const item = await db.inventoryItemType.findUnique({ where: { id: input.itemTypeId } });
  if (!item) return { error: "Choose the item." };
  const society = await db.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
  if (!society) return { error: "Choose the society." };
  if (input.quantity === null) {
    await db.stockRequirement.deleteMany({ where: { societyId: society.id, itemTypeId: item.id } });
    logger.info("stock.requirement_cleared", { actorId: admin.id, societyId: society.id, itemTypeId: item.id });
    refresh();
    return {};
  }
  if (!(input.quantity >= 0) || !Number.isFinite(input.quantity)) return { error: `Enter how many ${item.unit} are needed.` };
  if (item.tracking !== "length" && !Number.isInteger(input.quantity)) return { error: `${item.name} is counted in whole pieces.` };
  await db.stockRequirement.upsert({
    where: { societyId_itemTypeId: { societyId: society.id, itemTypeId: item.id } },
    create: { societyId: society.id, itemTypeId: item.id, quantity: input.quantity, note: input.note.trim() || null, updatedById: admin.id },
    update: { quantity: input.quantity, note: input.note.trim() || null, updatedById: admin.id },
  });
  logger.info("stock.requirement_set", { actorId: admin.id, societyId: society.id, itemTypeId: item.id, quantity: input.quantity });
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Purchase requirements
// ---------------------------------------------------------------------------

/** Generate a draft requirement from a society's shortfall (what planning says to buy). */
export async function generatePurchaseRequirement(societyId: string): Promise<Result<{ id: string }>> {
  const admin = await staff();
  if (!admin) return { error: REFUSED };
  const plan = await loadPlanning();
  const s = plan.societies.find((x) => x.id === societyId);
  const lines = (s?.rows ?? []).filter((r) => r.toBuy > 0);
  if (lines.length === 0) return { error: "Nothing is short for this society — there is nothing to buy." };
  const on = new Date();
  const existing = (await db.purchaseRequirement.findMany({ where: { code: { startsWith: docCode("PR", on, []).slice(0, 8) } }, select: { code: true } })).map((p) => p.code);
  const pr = await db.purchaseRequirement.create({
    data: {
      code: docCode("PR", on, existing),
      createdById: admin.id,
      lines: { create: lines.map((r) => ({ itemTypeId: r.itemTypeId, societyId, shortfall: r.toBuy, quantity: r.toBuy })) },
    },
  });
  logger.info("stock.pr_generated", { actorId: admin.id, prId: pr.id, societyId, lines: lines.length });
  refresh();
  return { id: pr.id };
}

/** Add another society's shortfall to a draft requirement — one order to the supplier. */
export async function addShortfallToPurchaseRequirement(prId: string, societyId: string): Promise<Result<{ added: number }>> {
  const admin = await staff();
  if (!admin) return { error: REFUSED };
  const pr = await db.purchaseRequirement.findUnique({ where: { id: prId }, select: { status: true, lines: { select: { societyId: true } } } });
  if (!pr) return { error: "That requirement is no longer on record." };
  if (pr.status !== "draft") return { error: "Only a draft can be added to." };
  if (pr.lines.some((l) => l.societyId === societyId)) return { error: "That society's shortfall is already on this requirement." };
  const plan = await loadPlanning();
  const lines = (plan.societies.find((x) => x.id === societyId)?.rows ?? []).filter((r) => r.toBuy > 0);
  if (lines.length === 0) return { error: "Nothing is short for that society." };
  await db.purchaseRequirementLine.createMany({ data: lines.map((r) => ({ purchaseRequirementId: prId, itemTypeId: r.itemTypeId, societyId, shortfall: r.toBuy, quantity: r.toBuy })) });
  logger.info("stock.pr_society_added", { actorId: admin.id, prId, societyId, lines: lines.length });
  refresh();
  return { added: lines.length };
}

/** Change how much a draft orders. Less than the shortfall needs a reason, kept in the notes. */
export async function updatePurchaseRequirementLines(prId: string, quantities: Array<{ lineId: string; quantity: number }>, reason: string): Promise<Result> {
  const admin = await staff();
  if (!admin) return { error: REFUSED };
  const pr = await db.purchaseRequirement.findUnique({ where: { id: prId }, include: { lines: { include: { itemType: true } } } });
  if (!pr) return { error: "That requirement is no longer on record." };
  if (pr.status !== "draft") return { error: "Only a draft can be changed — it has gone to the supplier." };
  const next = pr.lines.map((l) => ({ line: l, quantity: quantities.find((q) => q.lineId === l.id)?.quantity ?? l.quantity }));
  const refusal = refusePrLines(
    next.map((n) => ({ quantity: n.quantity, shortfall: n.line.shortfall, unit: n.line.itemType.unit, name: n.line.itemType.name, whole: n.line.itemType.tracking !== "length" })),
    reason,
  );
  if (refusal) return { error: refusal };
  await db.$transaction([
    ...next.map((n) => db.purchaseRequirementLine.update({ where: { id: n.line.id }, data: { quantity: n.quantity } })),
    ...(reason.trim() ? [db.purchaseRequirement.update({ where: { id: prId }, data: { notes: reason.trim() } })] : []),
  ]);
  logger.info("stock.pr_lines_updated", { actorId: admin.id, prId });
  refresh();
  return {};
}

/** Remove one line from a draft. */
export async function removePurchaseRequirementLine(lineId: string): Promise<Result> {
  const admin = await staff();
  if (!admin) return { error: REFUSED };
  const line = await db.purchaseRequirementLine.findUnique({ where: { id: lineId }, select: { purchaseRequirement: { select: { id: true, status: true, _count: { select: { lines: true } } } } } });
  if (!line) return { error: "That line is no longer on record." };
  if (line.purchaseRequirement.status !== "draft") return { error: "Only a draft can be changed." };
  if (line.purchaseRequirement._count.lines <= 1) return { error: "A requirement needs at least one line — cancel it instead." };
  await db.purchaseRequirementLine.delete({ where: { id: lineId } });
  refresh();
  return {};
}

/** Record that the requirement went to a supplier. */
export async function markPurchaseRequirementSent(prId: string, input: { supplierId: string; sentOn: string; poNumber: string }): Promise<Result> {
  const admin = await staff();
  if (!admin) return { error: REFUSED };
  const pr = await db.purchaseRequirement.findUnique({ where: { id: prId }, select: { status: true } });
  if (!pr) return { error: "That requirement is no longer on record." };
  if (pr.status !== "draft") return { error: "It has already been sent." };
  const supplier = input.supplierId ? await db.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } }) : null;
  if (!supplier) return { error: "Choose the supplier it was sent to." };
  const sentOn = day(input.sentOn);
  const now = new Date();
  if (!sentOn || sentOn.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return { error: "Enter the day it was sent (not in the future)." };
  await db.purchaseRequirement.update({ where: { id: prId }, data: { status: "sent", supplierId: supplier.id, sentOn, poNumber: input.poNumber.trim() || null } });
  logger.info("stock.pr_sent", { actorId: admin.id, prId, supplierId: supplier.id });
  refresh();
  return {};
}

/** Cancel a requirement that will not be filled. Anything already received stays received. */
export async function cancelPurchaseRequirement(prId: string, reason: string): Promise<Result> {
  const admin = await staff();
  if (!admin) return { error: REFUSED };
  if (!reason.trim()) return { error: "Say why it is cancelled." };
  const pr = await db.purchaseRequirement.findUnique({ where: { id: prId }, select: { status: true } });
  if (!pr) return { error: "That requirement is no longer on record." };
  if (pr.status === "received" || pr.status === "cancelled") return { error: `It is already ${pr.status}.` };
  await db.purchaseRequirement.update({ where: { id: prId }, data: { status: "cancelled", cancelReason: reason.trim() } });
  logger.info("stock.pr_cancelled", { actorId: admin.id, prId });
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Issue slips
// ---------------------------------------------------------------------------

export async function issueStock(input: IssueInput): Promise<Result<{ slipId: string; code: string; items: number }>> {
  const admin = await resolveAdmin();
  if (!admin) return { error: REFUSED };
  const r = await db.$transaction((tx) => issueStockAs(tx, admin, input), { timeout: 60_000 });
  if ("error" in r) {
    logger.warn("stock.issue_refused", { actorId: admin.id, reason: r.error });
    return r;
  }
  logger.info("stock.issued", { actorId: admin.id, slipId: r.slipId, code: r.code, employeeId: input.employeeId, societyId: input.societyId, items: r.items });
  refresh();
  return r;
}

export async function installFromSlip(input: { slipId: string; on: string; circuitId: string; lines: SlipLine[] }): Promise<Result<SlipActionResult>> {
  const admin = await resolveAdmin();
  if (!admin) return { error: REFUSED };
  const r = await db.$transaction((tx) => installFromSlipAs(tx, admin, input), { timeout: 60_000 });
  if ("error" in r) {
    logger.warn("stock.install_refused", { actorId: admin.id, slipId: input.slipId, reason: r.error });
    return r;
  }
  logger.info("stock.installed", { actorId: admin.id, slipId: input.slipId, done: r.done, failed: r.failed.length, held: r.held });
  refresh();
  return r;
}

export async function returnFromSlip(input: { slipId: string; on: string; toOfficeId: string; lines: SlipLine[]; faulty: Array<{ code: string; reason: string }> }): Promise<Result<SlipActionResult>> {
  const admin = await resolveAdmin();
  if (!admin) return { error: REFUSED };
  const r = await db.$transaction((tx) => returnFromSlipAs(tx, admin, input), { timeout: 60_000 });
  if ("error" in r) {
    logger.warn("stock.return_refused", { actorId: admin.id, slipId: input.slipId, reason: r.error });
    return r;
  }
  logger.info("stock.returned", { actorId: admin.id, slipId: input.slipId, done: r.done, failed: r.failed.length, held: r.held });
  refresh();
  return r;
}

export async function moveSlipDue(slipId: string, dueOn: string): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin) return { error: REFUSED };
  const r = await moveSlipDueAs(db, admin, slipId, dueOn);
  if (r.error) {
    logger.warn("stock.slip_due_refused", { actorId: admin.id, slipId, reason: r.error });
    return { error: r.error };
  }
  logger.info("stock.slip_due_moved", { actorId: admin.id, slipId, dueOn });
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Installed stock at a society (societies installed before the stock flow)
// ---------------------------------------------------------------------------

export async function setInstalledCount(input: { societyId: string; itemTypeId: string; count: number; since: string; reason: string }): Promise<Result<{ added: number; removed: number }>> {
  const admin = await resolveAdmin();
  if (!admin) return { error: REFUSED };
  const r = await db.$transaction((tx) => setInstalledCountAs(tx, admin, input), { timeout: 60_000 });
  if ("error" in r) {
    logger.warn("stock.installed_count_refused", { actorId: admin.id, societyId: input.societyId, itemTypeId: input.itemTypeId, reason: r.error });
    return r;
  }
  logger.info("stock.installed_count_set", { actorId: admin.id, societyId: input.societyId, itemTypeId: input.itemTypeId, count: input.count, ...r });
  revalidatePath(`/admin/societies/${input.societyId}`);
  refresh();
  return r;
}
