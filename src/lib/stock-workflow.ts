import type { Prisma, PrismaClient } from "@prisma/client";
import { batchCode, nextBatchSeq, unitCode } from "./inventory";
import { siteFor } from "./inventory-move";
import { PURPOSE_LABEL, type Purpose } from "./stock-workflow-labels";
import { docCode, drawFifo, installedCountChange, prStatusFrom, receivedPerLine, refuseIssue, slipOutstanding } from "./stock-plan";

/**
 * Issue → install → return (2026-11-23). The back office's actions and the
 * field app's queued items both run these, so a crew member recording an
 * install from a basement obeys exactly the rules the back office does. Each
 * takes a client so it can run inside a caller's transaction.
 *
 * A unit in an employee's custody stays `in_stock` — it is still FirsThing's
 * free-to-install stock, just not on a shelf — with its location set to the
 * employee's own custody location. Quantity items move per batch, oldest first.
 */

type Client = Prisma.TransactionClient | PrismaClient;
type Actor = { id: string; name?: string | null; email: string; permissions: string[] };

export { PURPOSE_LABEL, type Purpose };

const day = (s: string): Date | null => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const isStockStaff = (a: Actor) => a.permissions.includes("manage_survey") || a.permissions.includes("manage_pipeline");

/** An employee's custody location, created the first time they are issued anything. */
export async function employeeLocation(client: Client, adminUserId: string): Promise<string | null> {
  const existing = await client.stockLocation.findUnique({ where: { adminUserId } });
  if (existing) return existing.id;
  const user = await client.adminUser.findUnique({ where: { id: adminUserId }, select: { name: true, email: true, isActive: true } });
  if (!user || !user.isActive) return null;
  const created = await client.stockLocation.create({ data: { kind: "employee", name: user.name || user.email, adminUserId } });
  return created.id;
}

/** Per-batch quantity at a location for one item, oldest batch first. */
async function quantityByBatch(client: Client, locationId: string, itemTypeId: string, issueSlipId?: string) {
  const moves = await client.stockMovement.findMany({
    where: {
      itemTypeId,
      unitId: null,
      ...(issueSlipId ? { issueSlipId } : {}),
      OR: [{ toLocationId: locationId }, { fromLocationId: locationId }],
    },
    select: { batchId: true, quantity: true, fromLocationId: true, toLocationId: true, batch: { select: { receivedOn: true } } },
  });
  const by = new Map<string, { available: number; receivedOn: Date }>();
  for (const m of moves) {
    if (!m.batchId) continue;
    const r = by.get(m.batchId) ?? { available: 0, receivedOn: m.batch?.receivedOn ?? new Date(0) };
    if (m.toLocationId === locationId) r.available += m.quantity;
    if (m.fromLocationId === locationId) r.available -= m.quantity;
    by.set(m.batchId, r);
  }
  return [...by.entries()]
    .map(([batchId, r]) => ({ batchId, available: Math.round(r.available * 1000) / 1000, receivedOn: r.receivedOn }))
    .filter((b) => b.available > 1e-9)
    .sort((a, b) => a.receivedOn.getTime() - b.receivedOn.getTime());
}

export type IssueLine = { itemTypeId: string; quantity: number; codes: string[] };
export type IssueInput = {
  employeeId: string;
  fromOfficeId: string;
  societyId: string;
  purpose: Purpose;
  issuedOn: string;
  dueOn: string;
  note: string;
  lines: IssueLine[];
};

/**
 * Issue stock to an employee for one society's job. All or nothing: a line
 * the office cannot cover refuses the whole slip, naming the line.
 */
export async function issueStockAs(client: Client, actor: Actor, input: IssueInput): Promise<{ slipId: string; code: string; items: number } | { error: string }> {
  if (!isStockStaff(actor)) return { error: "Issuing stock needs field or pipeline access." };
  const issuedOn = day(input.issuedOn);
  const dueOn = day(input.dueOn);
  const lines = input.lines.filter((l) => l.quantity > 0 || l.codes.some((c) => c.trim()));
  const refusal = refuseIssue({ employeeId: input.employeeId, societyId: input.societyId, issuedOn, dueOn, lines: lines.length }, new Date());
  if (refusal) return { error: refusal };
  if (!(input.purpose in PURPOSE_LABEL)) return { error: "Choose what it is for." };

  const office = await client.stockLocation.findUnique({ where: { id: input.fromOfficeId } });
  if (!office || office.kind !== "office") return { error: "Choose the office it leaves from." };
  const society = await client.society.findUnique({ where: { id: input.societyId }, select: { id: true, closedAt: true } });
  if (!society || society.closedAt) return { error: "That society is not open for work." };
  const employee = await client.adminUser.findUnique({ where: { id: input.employeeId }, select: { isActive: true, permissions: true } });
  if (!employee?.isActive) return { error: "Choose an active employee." };
  if (!employee.permissions.includes("manage_survey")) return { error: "Stock can only be issued to someone with field access — they record the install from the field app." };
  const custody = await employeeLocation(client, input.employeeId);
  if (!custody) return { error: "Choose an active employee." };

  const types = await client.inventoryItemType.findMany({ where: { id: { in: lines.map((l) => l.itemTypeId) } } });
  type Planned = { itemTypeId: string; unitIds?: { id: string; batchId: string }[]; draws?: { batchId: string; quantity: number }[] };
  const planned: Planned[] = [];
  for (const l of lines) {
    const t = types.find((x) => x.id === l.itemTypeId);
    if (!t) return { error: "Choose the item on every line." };
    if (t.tracking === "serial") {
      const codes = [...new Set(l.codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
      if (codes.length > 0) {
        const units = await client.inventoryUnit.findMany({ where: { code: { in: codes } } });
        for (const c of codes) {
          const u = units.find((x) => x.code === c);
          if (!u) return { error: `${t.name}: no unit has the code ${c}.` };
          if (u.itemTypeId !== t.id) return { error: `${c} is not a ${t.name}.` };
          if (u.status !== "in_stock" || u.locationId !== office.id) return { error: `${c} is not free at ${office.name}.` };
        }
        planned.push({ itemTypeId: t.id, unitIds: units.map((u) => ({ id: u.id, batchId: u.batchId })) });
      } else {
        if (!Number.isInteger(l.quantity) || l.quantity <= 0) return { error: `${t.name}: enter how many, or scan the units.` };
        const units = await client.inventoryUnit.findMany({
          where: { itemTypeId: t.id, status: "in_stock", locationId: office.id },
          orderBy: [{ batch: { receivedOn: "asc" } }, { code: "asc" }],
          take: l.quantity,
          select: { id: true, batchId: true },
        });
        if (units.length < l.quantity) return { error: `${t.name}: only ${units.length} free at ${office.name}.` };
        planned.push({ itemTypeId: t.id, unitIds: units });
      }
    } else {
      if (t.tracking === "quantity" && !Number.isInteger(l.quantity)) return { error: `${t.name} is counted in whole pieces.` };
      const batches = await quantityByBatch(client, office.id, t.id);
      const fifo = drawFifo(batches, l.quantity);
      if ("short" in fifo) return { error: `${t.name}: only ${batches.reduce((s, b) => s + b.available, 0)} ${t.unit} free at ${office.name}.` };
      planned.push({ itemTypeId: t.id, draws: fifo.draws });
    }
  }

  const existing = (await client.issueSlip.findMany({ where: { code: { startsWith: docCode("IS", issuedOn!, []).slice(0, 8) } }, select: { code: true } })).map((s) => s.code);
  const code = docCode("IS", issuedOn!, existing);
  const slip = await client.issueSlip.create({
    data: {
      code,
      employeeId: input.employeeId,
      fromLocationId: office.id,
      societyId: society.id,
      purpose: input.purpose,
      issuedOn: issuedOn!,
      dueOn: dueOn!,
      note: input.note.trim() || null,
      createdById: actor.id,
    },
  });
  let items = 0;
  for (const p of planned) {
    for (const u of p.unitIds ?? []) {
      await client.stockMovement.create({
        data: { kind: "issue", on: issuedOn!, itemTypeId: p.itemTypeId, batchId: u.batchId, unitId: u.id, quantity: 1, fromLocationId: office.id, toLocationId: custody, issueSlipId: slip.id, recordedById: actor.id },
      });
      await client.inventoryUnit.update({ where: { id: u.id }, data: { locationId: custody } });
      items += 1;
    }
    for (const d of p.draws ?? []) {
      await client.stockMovement.create({
        data: { kind: "issue", on: issuedOn!, itemTypeId: p.itemTypeId, batchId: d.batchId, quantity: d.quantity, fromLocationId: office.id, toLocationId: custody, issueSlipId: slip.id, recordedById: actor.id },
      });
      items += d.quantity;
    }
  }
  return { slipId: slip.id, code, items };
}

/** Load a slip the actor may act on: the employee it was issued to, or stock staff. */
async function slipFor(client: Client, actor: Actor, slipId: string) {
  const slip = await client.issueSlip.findUnique({ where: { id: slipId } });
  if (!slip) return { error: "That slip is no longer on record." } as const;
  if (slip.employeeId !== actor.id && !isStockStaff(actor)) return { error: "This stock was issued to someone else." } as const;
  const custody = await client.stockLocation.findUnique({ where: { adminUserId: slip.employeeId } });
  if (!custody) return { error: "That slip is no longer on record." } as const;
  return { slip, custodyId: custody.id } as const;
}

/** Units of an item still held on this slip (issued on it, not since moved on). */
async function heldUnitsOnSlip(client: Client, slipId: string, custodyId: string, itemTypeId?: string) {
  const issued = await client.stockMovement.findMany({
    where: { issueSlipId: slipId, kind: "issue", unitId: { not: null }, ...(itemTypeId ? { itemTypeId } : {}) },
    select: { unitId: true },
  });
  return client.inventoryUnit.findMany({
    where: { id: { in: issued.map((m) => m.unitId!) }, locationId: custodyId, status: "in_stock" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, batchId: true, itemTypeId: true },
  });
}

async function closeIfDone(client: Client, slipId: string, custodyId: string) {
  const moves = await client.stockMovement.findMany({ where: { issueSlipId: slipId }, select: { kind: true, itemTypeId: true, quantity: true, fromLocationId: true, toLocationId: true } });
  const held = [...slipOutstanding(moves, custodyId).values()].reduce((s, r) => s + r.held, 0);
  await client.issueSlip.update({ where: { id: slipId }, data: { closedAt: held <= 1e-9 ? new Date() : null } });
  return held;
}

export type SlipLine = { itemTypeId: string; quantity: number; codes: string[] };

export type SlipActionResult = { done: number; failed: { code: string; error: string }[]; held: number };

/**
 * Install stock from a slip at the slip's society. A code that is not held
 * on this slip is named and set aside; the rest are installed.
 */
export async function installFromSlipAs(
  client: Client,
  actor: Actor,
  input: { slipId: string; on: string; circuitId: string; lines: SlipLine[] },
): Promise<SlipActionResult | { error: string }> {
  const found = await slipFor(client, actor, input.slipId);
  if ("error" in found) return { error: found.error as string };
  const { slip, custodyId } = found;
  const on = day(input.on);
  const now = new Date();
  if (!on || on.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return { error: "Enter the day it was installed (not in the future)." };
  if (on < slip.issuedOn) return { error: "It cannot have been installed before it was issued." };
  const site = await siteFor(client, slip.societyId);
  if (!site) return { error: "That society no longer exists." };
  if (input.circuitId) {
    const c = await client.circuit.findUnique({ where: { id: input.circuitId }, select: { societyId: true } });
    if (!c || c.societyId !== slip.societyId) return { error: "That circuit is not at this society." };
  }
  return moveOffSlip(client, actor, { slipId: slip.id, custodyId, to: site, kind: "deploy", on, circuitId: input.circuitId || null, lines: input.lines, faulty: new Map(), reason: null });
}

/**
 * Return what is left on a slip to an office — unused, or faulty with what is
 * wrong. A faulty unit arrives marked faulty and cannot be issued again until
 * it is repaired.
 */
export async function returnFromSlipAs(
  client: Client,
  actor: Actor,
  input: { slipId: string; on: string; toOfficeId: string; lines: SlipLine[]; faulty: Array<{ code: string; reason: string }> },
): Promise<SlipActionResult | { error: string }> {
  const found = await slipFor(client, actor, input.slipId);
  if ("error" in found) return { error: found.error as string };
  const { slip, custodyId } = found;
  const on = day(input.on);
  const now = new Date();
  if (!on || on.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return { error: "Enter the day it was returned (not in the future)." };
  if (on < slip.issuedOn) return { error: "It cannot have been returned before it was issued." };
  const office = await client.stockLocation.findUnique({ where: { id: input.toOfficeId } });
  if (!office || office.kind !== "office") return { error: "Choose the office it goes back to." };
  const faulty = new Map<string, string>();
  for (const f of input.faulty) {
    const code = f.code.trim().toUpperCase();
    if (!code) continue;
    if (!f.reason.trim()) return { error: `${code}: say what is wrong with it.` };
    faulty.set(code, f.reason.trim());
  }
  return moveOffSlip(client, actor, { slipId: slip.id, custodyId, to: office.id, kind: "return_to_office", on, circuitId: null, lines: input.lines, faulty, reason: null });
}

async function moveOffSlip(
  client: Client,
  actor: Actor,
  m: { slipId: string; custodyId: string; to: string; kind: "deploy" | "return_to_office"; on: Date; circuitId: string | null; lines: SlipLine[]; faulty: Map<string, string>; reason: string | null },
): Promise<SlipActionResult | { error: string }> {
  const lines = m.lines.filter((l) => l.quantity > 0 || l.codes.some((c) => c.trim()));
  if (lines.length === 0 && m.faulty.size === 0) return { error: m.kind === "deploy" ? "Scan or count what was installed." : "Enter what is coming back." };
  const types = await client.inventoryItemType.findMany({ where: { id: { in: lines.map((l) => l.itemTypeId) } } });
  const failed: SlipActionResult["failed"] = [];
  let done = 0;

  // Faulty units named on a return are a serial-only thing: they ride along
  // even if no line lists them.
  const faultyCodes = [...m.faulty.keys()];
  const extraLine: SlipLine[] = faultyCodes.length ? [{ itemTypeId: "", quantity: 0, codes: faultyCodes }] : [];

  for (const l of [...lines, ...extraLine]) {
    const t = types.find((x) => x.id === l.itemTypeId);
    if (l.itemTypeId && !t) return { error: "Choose the item on every line." };
    if (!t || t.tracking === "serial") {
      const held = await heldUnitsOnSlip(client, m.slipId, m.custodyId, t?.id);
      // The extra pass takes whichever faulty codes no line has already moved.
      const codes = l.itemTypeId === "" ? [...m.faulty.keys()] : [...new Set(l.codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
      let pick: typeof held;
      if (codes.length > 0) {
        pick = [];
        for (const c of codes) {
          const u = held.find((x) => x.code === c);
          if (!u) failed.push({ code: c, error: "Not held on this slip." });
          else if (!pick.includes(u)) pick.push(u);
        }
      } else {
        if (!t) continue;
        if (!Number.isInteger(l.quantity)) return { error: `${t.name} is counted in whole pieces.` };
        if (l.quantity > held.length) return { error: `${t.name}: only ${held.length} still held on this slip.` };
        pick = held.filter((u) => !m.faulty.has(u.code)).slice(0, l.quantity);
      }
      for (const u of pick) {
        const isFaulty = m.kind === "return_to_office" && m.faulty.has(u.code);
        await client.stockMovement.create({
          data: {
            kind: m.kind,
            on: m.on,
            itemTypeId: u.itemTypeId,
            batchId: u.batchId,
            unitId: u.id,
            quantity: 1,
            fromLocationId: m.custodyId,
            toLocationId: m.to,
            circuitId: m.circuitId,
            reason: isFaulty ? m.faulty.get(u.code)! : m.reason,
            issueSlipId: m.slipId,
            recordedById: actor.id,
          },
        });
        if (isFaulty) {
          await client.stockMovement.create({
            data: { kind: "mark_faulty", on: m.on, itemTypeId: u.itemTypeId, batchId: u.batchId, unitId: u.id, quantity: 1, reason: m.faulty.get(u.code)!, recordedById: actor.id },
          });
        }
        await client.inventoryUnit.update({
          where: { id: u.id },
          data: {
            locationId: m.to,
            status: m.kind === "deploy" ? "deployed" : isFaulty ? "faulty" : "in_stock",
            circuitId: m.kind === "deploy" ? m.circuitId : null,
            deployedOn: m.kind === "deploy" ? m.on : null,
          },
        });
        // Every faulty code was planned against this unit — keep it off the extra pass.
        if (isFaulty) m.faulty.delete(u.code);
        done += 1;
      }
    } else {
      const batches = await quantityByBatch(client, m.custodyId, t.id, m.slipId);
      const fifo = drawFifo(batches, l.quantity);
      if ("short" in fifo) return { error: `${t.name}: only ${batches.reduce((s, b) => s + b.available, 0)} ${t.unit} still held on this slip.` };
      for (const d of fifo.draws) {
        await client.stockMovement.create({
          data: { kind: m.kind, on: m.on, itemTypeId: t.id, batchId: d.batchId, quantity: d.quantity, fromLocationId: m.custodyId, toLocationId: m.to, circuitId: m.circuitId, issueSlipId: m.slipId, recordedById: actor.id },
        });
      }
      done += l.quantity;
    }
  }
  const held = await closeIfDone(client, m.slipId, m.custodyId);
  return { done, failed, held };
}

/** Move a slip's expected installation date (back office). */
export async function moveSlipDueAs(client: Client, actor: Actor, slipId: string, dueOn: string): Promise<{ error?: string }> {
  if (!isStockStaff(actor)) return { error: "Changing a slip needs field or pipeline access." };
  const slip = await client.issueSlip.findUnique({ where: { id: slipId } });
  const due = day(dueOn);
  if (!slip) return { error: "That slip is no longer on record." };
  if (!due || due < slip.issuedOn) return { error: "The installation date cannot be before the issue date." };
  await client.issueSlip.update({ where: { id: slipId }, data: { dueOn: due } });
  return {};
}

// ---------------------------------------------------------------------------
// Pre-existing stock and installed-count corrections
// ---------------------------------------------------------------------------

/**
 * A batch for stock already in place before this system existed — no
 * supplier invoice. Serial items still get real printable unit codes. Shared
 * by "Add existing inventory" and a society's installed-stock update.
 */
export async function recordHistoricalBatch(
  client: Client,
  actorId: string,
  a: { itemTypeId: string; tracking: string; count: number; since: Date; locationId: string; deploy: boolean; reason: string },
): Promise<string> {
  const prefix = batchCode(a.since, 0).slice(0, 5);
  const monthCodes = (await client.inventoryBatch.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })).map((b) => b.code);
  const code = batchCode(a.since, nextBatchSeq(monthCodes));
  const batch = await client.inventoryBatch.create({
    data: {
      code,
      itemTypeId: a.itemTypeId,
      purchaseId: null,
      historical: true,
      receivedAtLocationId: a.locationId,
      receivedOn: a.since,
      quantity: a.count,
      unitCost: null,
      warrantyMonths: null,
      warrantyBasis: "install",
      notes: a.reason,
      createdById: actorId,
    },
  });
  if (a.tracking === "serial") {
    const units = Array.from({ length: a.count }, (_, i) => ({
      id: `${batch.id}-${i + 1}`,
      code: unitCode(code, i + 1),
      batchId: batch.id,
      itemTypeId: a.itemTypeId,
      status: (a.deploy ? "deployed" : "in_stock") as "deployed" | "in_stock",
      locationId: a.locationId,
      deployedOn: a.deploy ? a.since : null,
    }));
    await client.inventoryUnit.createMany({ data: units });
    await client.stockMovement.createMany({
      data: units.map((u) => ({ kind: "receive" as const, on: a.since, itemTypeId: a.itemTypeId, batchId: batch.id, unitId: u.id, quantity: 1, toLocationId: a.locationId, reason: a.reason, recordedById: actorId })),
    });
  } else {
    await client.stockMovement.create({
      data: { kind: "receive", on: a.since, itemTypeId: a.itemTypeId, batchId: batch.id, quantity: a.count, toLocationId: a.locationId, reason: a.reason, recordedById: actorId },
    });
  }
  return batch.id;
}

/** How much of an item is installed at a society's site, from the ledger. */
export async function installedAtSite(client: Client, siteId: string, itemTypeId: string, tracking: string): Promise<number> {
  if (tracking === "serial") return client.inventoryUnit.count({ where: { locationId: siteId, itemTypeId, status: { in: ["deployed", "faulty"] } } });
  const batches = await quantityByBatch(client, siteId, itemTypeId);
  return Math.round(batches.reduce((s, b) => s + b.available, 0) * 1000) / 1000;
}

/**
 * Set how many of an item are installed at a society — for societies
 * installed before the stock flow existed (2026-11-23, user-asked). Raising it
 * records the difference as pre-existing stock installed there; lowering it
 * takes the difference off as a correction, newest first, with the reason.
 * Nothing is deleted.
 */
export async function setInstalledCountAs(
  client: Client,
  actor: Actor,
  input: { societyId: string; itemTypeId: string; count: number; since: string; reason: string },
): Promise<{ added: number; removed: number } | { error: string }> {
  if (!isStockStaff(actor)) return { error: "Updating installed stock needs field or pipeline access." };
  const type = await client.inventoryItemType.findUnique({ where: { id: input.itemTypeId } });
  if (!type) return { error: "Choose the item." };
  if (!(input.count >= 0) || !Number.isFinite(input.count)) return { error: `Enter how many ${type.unit} are installed.` };
  if (type.tracking !== "length" && !Number.isInteger(input.count)) return { error: `${type.name} is counted in whole pieces.` };
  const site = await siteFor(client, input.societyId);
  if (!site) return { error: "That society no longer exists." };
  const current = await installedAtSite(client, site, type.id, type.tracking);
  const { add, remove } = installedCountChange(current, input.count);
  if (add === 0 && remove === 0) return { error: `${type.name} is already at ${current}.` };
  if (remove > 0 && !input.reason.trim()) return { error: "Lowering the count needs a reason — it is kept with the record." };
  if (type.tracking === "serial" && add > 5000) return { error: "Split more than 5,000 units into separate updates." };
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = day(input.since);
  if (add > 0 && (!since || since.getTime() > today)) return { error: "Enter since when they have been installed (not in the future)." };

  if (add > 0) {
    await recordHistoricalBatch(client, actor.id, {
      itemTypeId: type.id,
      tracking: type.tracking,
      count: add,
      since: since!,
      locationId: site,
      deploy: true,
      reason: input.reason.trim() || "Installed before FirsThing tracked stock — count entered from the society's records.",
    });
  } else {
    const on = new Date(today);
    const reason = `Installed count corrected: ${input.reason.trim()}`;
    if (type.tracking === "serial") {
      const units = await client.inventoryUnit.findMany({
        where: { locationId: site, itemTypeId: type.id, status: { in: ["deployed", "faulty"] } },
        orderBy: [{ createdAt: "desc" }, { code: "desc" }],
        take: remove,
      });
      for (const u of units) {
        await client.stockMovement.create({ data: { kind: "adjust", on, itemTypeId: type.id, batchId: u.batchId, unitId: u.id, quantity: 1, fromLocationId: site, reason, recordedById: actor.id } });
        await client.inventoryUnit.update({ where: { id: u.id }, data: { status: "written_off", locationId: null, circuitId: null } });
      }
    } else {
      const batches = (await quantityByBatch(client, site, type.id)).reverse();
      const fifo = drawFifo(batches, remove);
      if ("short" in fifo) return { error: "The count changed while you were editing — reload and try again." };
      for (const d of fifo.draws) {
        await client.stockMovement.create({ data: { kind: "adjust", on, itemTypeId: type.id, batchId: d.batchId, quantity: d.quantity, fromLocationId: site, reason, recordedById: actor.id } });
      }
    }
  }
  return { added: add, removed: remove };
}

/** A purchase requirement's status from the deliveries received against it. */
export async function refreshPrStatus(client: Client, prId: string): Promise<void> {
  const pr = await client.purchaseRequirement.findUnique({
    where: { id: prId },
    select: { status: true, lines: { select: { id: true, itemTypeId: true, quantity: true } }, batches: { select: { itemTypeId: true, quantity: true } } },
  });
  if (!pr) return;
  const got = new Map<string, number>();
  for (const b of pr.batches) got.set(b.itemTypeId, (got.get(b.itemTypeId) ?? 0) + b.quantity);
  const next = prStatusFrom(pr.status, pr.lines, receivedPerLine(pr.lines, got));
  if (next !== pr.status) await client.purchaseRequirement.update({ where: { id: prId }, data: { status: next } });
}
