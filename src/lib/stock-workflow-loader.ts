// Server-side reads for the stock workflow (2026-11-23): procurement
// planning, who holds what, an employee's own stock, and what is installed at
// a society. The rules are in stock-plan.ts.

import { db } from "@/lib/db";
import {
  allocatePlan,
  daysLate,
  dealLightRequirements,
  receivedPerLine,
  requiredFor,
  slipOutstanding,
  slipState,
  type DealCircuit,
  type DealTerm,
  type PlanNeed,
  type SlipState,
} from "@/lib/stock-plan";
import type { Purpose } from "@/lib/stock-workflow";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

type ItemLite = { id: string; name: string; unit: string; tracking: string; category: string; deviceTypeId: string | null };

/** Every location's holding per item, from units and the quantity ledger. */
async function holdingsByLocationKind() {
  const [locations, unitGroups, qtyMoves] = await Promise.all([
    db.stockLocation.findMany({ select: { id: true, kind: true, societyId: true, adminUserId: true } }),
    db.inventoryUnit.groupBy({ by: ["locationId", "itemTypeId"], where: { locationId: { not: null }, status: { in: ["in_stock", "deployed", "faulty"] } }, _count: { _all: true } }),
    db.stockMovement.findMany({ where: { unitId: null }, select: { itemTypeId: true, quantity: true, fromLocationId: true, toLocationId: true } }),
  ]);
  const freeUnits = await db.inventoryUnit.groupBy({ by: ["locationId", "itemTypeId"], where: { status: "in_stock", location: { kind: "office" } }, _count: { _all: true } });
  const at = new Map<string, number>(); // `${locationId}|${itemTypeId}` → all units and quantities there
  for (const g of unitGroups) at.set(`${g.locationId}|${g.itemTypeId}`, (at.get(`${g.locationId}|${g.itemTypeId}`) ?? 0) + g._count._all);
  for (const m of qtyMoves) {
    if (m.toLocationId) at.set(`${m.toLocationId}|${m.itemTypeId}`, (at.get(`${m.toLocationId}|${m.itemTypeId}`) ?? 0) + m.quantity);
    if (m.fromLocationId) at.set(`${m.fromLocationId}|${m.itemTypeId}`, (at.get(`${m.fromLocationId}|${m.itemTypeId}`) ?? 0) - m.quantity);
  }
  // Free at offices: in-stock units (never faulty ones) plus quantities.
  const officeIds = new Set(locations.filter((l) => l.kind === "office").map((l) => l.id));
  const free = new Map<string, number>();
  for (const g of freeUnits) free.set(g.itemTypeId, (free.get(g.itemTypeId) ?? 0) + g._count._all);
  for (const m of qtyMoves) {
    if (m.toLocationId && officeIds.has(m.toLocationId)) free.set(m.itemTypeId, (free.get(m.itemTypeId) ?? 0) + m.quantity);
    if (m.fromLocationId && officeIds.has(m.fromLocationId)) free.set(m.itemTypeId, (free.get(m.itemTypeId) ?? 0) - m.quantity);
  }
  const siteOf = new Map(locations.filter((l) => l.societyId).map((l) => [l.societyId!, l.id]));
  return { at, free, siteOf, officeIds };
}

/** Open issue slips with what is still held on each. */
export async function loadOpenSlips(where: { employeeId?: string; societyId?: string } = {}) {
  const slips = await db.issueSlip.findMany({
    where: { closedAt: null, ...where },
    orderBy: [{ dueOn: "asc" }, { code: "asc" }],
    include: {
      society: { select: { id: true, name: true } },
      movements: { select: { kind: true, itemTypeId: true, quantity: true, fromLocationId: true, toLocationId: true } },
    },
  });
  if (slips.length === 0) return [];
  const [custody, people, items, offices] = await Promise.all([
    db.stockLocation.findMany({ where: { adminUserId: { in: [...new Set(slips.map((s) => s.employeeId))] } }, select: { id: true, adminUserId: true } }),
    db.adminUser.findMany({ where: { id: { in: [...new Set(slips.map((s) => s.employeeId))] } }, select: { id: true, name: true, email: true, team: true } }),
    db.inventoryItemType.findMany({ select: { id: true, name: true, unit: true, tracking: true } }),
    db.stockLocation.findMany({ where: { id: { in: [...new Set(slips.map((s) => s.fromLocationId))] } }, select: { id: true, name: true } }),
  ]);
  const custodyOf = new Map(custody.map((c) => [c.adminUserId!, c.id]));
  const now = new Date();
  return slips.map((s) => {
    const out = slipOutstanding(s.movements, custodyOf.get(s.employeeId) ?? "");
    const lines = [...out.entries()]
      .map(([itemTypeId, r]) => ({ ...r, itemTypeId, item: items.find((i) => i.id === itemTypeId)! }))
      .filter((l) => l.item)
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
    const held = lines.reduce((n, l) => n + l.held, 0);
    const person = people.find((p) => p.id === s.employeeId);
    return {
      id: s.id,
      code: s.code,
      employeeId: s.employeeId,
      employee: person?.name || person?.email || "Unknown",
      team: person?.team ?? null,
      society: s.society,
      purpose: s.purpose as Purpose,
      issuedOn: s.issuedOn,
      dueOn: s.dueOn,
      note: s.note,
      fromOffice: offices.find((o) => o.id === s.fromLocationId)?.name ?? "",
      fromOfficeId: s.fromLocationId,
      lines,
      held: r3(held),
      state: slipState(s.dueOn, held, now) as SlipState,
      daysLate: daysLate(s.dueOn, now),
    };
  });
}
export type OpenSlip = Awaited<ReturnType<typeof loadOpenSlips>>[number];

/**
 * Procurement planning: for every society with work ahead, each item it
 * needs against what is installed, held by crews for it, on order for it, and
 * free at the offices — shared oldest deal first.
 */
export async function loadPlanning() {
  const [items, pipelines, typed, slips, prs] = await Promise.all([
    db.inventoryItemType.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, tracking: true, category: true, deviceTypeId: true } }),
    db.pipeline.findMany({
      where: { stage: { in: ["offered", "agreed", "installation"] }, offers: { some: { status: "accepted" } } },
      select: {
        id: true,
        societyId: true,
        serviceLine: true,
        dealScope: true,
        stage: true,
        society: { select: { name: true, closedAt: true } },
        offers: { where: { status: "accepted" }, orderBy: { version: "desc" }, take: 1, select: { circuitTerms: true, respondedAt: true } },
        installationProject: { select: { state: true } },
      },
    }),
    db.stockRequirement.findMany({ select: { societyId: true, itemTypeId: true, quantity: true, note: true, society: { select: { name: true } } } }),
    loadOpenSlips(),
    db.purchaseRequirement.findMany({
      where: { status: { in: ["draft", "sent", "partly_received"] } },
      select: { id: true, code: true, status: true, lines: { select: { id: true, itemTypeId: true, societyId: true, quantity: true } }, batches: { select: { itemTypeId: true, quantity: true } } },
    }),
  ]);

  const live = pipelines.filter((p) => !p.society.closedAt && p.installationProject?.state !== "complete" && p.offers[0]);
  const terms = live.flatMap((p) => ((p.offers[0]!.circuitTerms as DealTerm[] | null) ?? []).map((t) => ({ ...t, societyId: p.societyId })));
  const circuitRows = await db.circuit.findMany({
    where: { id: { in: terms.map((t) => t.circuitId) } },
    select: { id: true, meteredLightCount: true, devices: { select: { count: true, replacementTypeId: true, excludedFromCalculation: true } } },
  });
  const circuits = new Map<string, DealCircuit>(
    circuitRows.map((c) => [c.id, { id: c.id, meteredLightCount: c.meteredLightCount, lines: c.devices.map((d) => ({ count: d.count, replacementDeviceTypeId: d.replacementTypeId, excluded: d.excludedFromCalculation })) }]),
  );
  const itemByDeviceType = new Map(items.filter((i) => i.deviceTypeId).map((i) => [i.deviceTypeId!, i.id]));

  // Deal figure per society per item, plus circuits whose light model is not a stock item.
  const deal = new Map<string, Map<string, number>>();
  const unmapped = new Map<string, number>();
  for (const sid of new Set(live.map((p) => p.societyId))) {
    const r = dealLightRequirements(terms.filter((t) => t.societyId === sid), circuits, itemByDeviceType);
    deal.set(sid, r.byItem);
    if (r.unmapped.length) unmapped.set(sid, r.unmapped.length);
  }

  const { at, free, siteOf } = await holdingsByLocationKind();

  // With crews / on order, per society and item.
  const crews = new Map<string, number>();
  for (const s of slips) for (const l of s.lines) crews.set(`${s.society.id}|${l.itemTypeId}`, (crews.get(`${s.society.id}|${l.itemTypeId}`) ?? 0) + l.held);
  const onOrder = new Map<string, number>();
  for (const pr of prs) {
    const got = new Map<string, number>();
    for (const b of pr.batches) got.set(b.itemTypeId, (got.get(b.itemTypeId) ?? 0) + b.quantity);
    const per = receivedPerLine(pr.lines, got);
    for (const l of pr.lines) {
      if (!l.societyId) continue;
      const k = `${l.societyId}|${l.itemTypeId}`;
      onOrder.set(k, (onOrder.get(k) ?? 0) + Math.max(0, l.quantity - (per.get(l.id) ?? 0)));
    }
  }

  // Societies: oldest accepted deal first; typed-only societies after.
  const firstDeal = new Map<string, number>();
  for (const p of live) {
    const t = p.offers[0]!.respondedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    firstDeal.set(p.societyId, Math.min(firstDeal.get(p.societyId) ?? Number.MAX_SAFE_INTEGER, t));
  }
  const societyIds = [...new Set([...live.map((p) => p.societyId), ...typed.map((t) => t.societyId)])];
  const order = societyIds.sort((a, b) => (firstDeal.get(a) ?? Number.MAX_SAFE_INTEGER) - (firstDeal.get(b) ?? Number.MAX_SAFE_INTEGER));

  const needs: (PlanNeed & { source: "typed" | "deal"; note: string | null })[] = [];
  for (const sid of order) {
    const typedHere = typed.filter((t) => t.societyId === sid);
    const itemIds = new Set([...(deal.get(sid)?.keys() ?? []), ...typedHere.map((t) => t.itemTypeId)]);
    for (const itemTypeId of itemIds) {
      const t = typedHere.find((x) => x.itemTypeId === itemTypeId);
      const req = requiredFor(deal.get(sid)?.get(itemTypeId), t?.quantity);
      if (req.source === "none") continue;
      const site = siteOf.get(sid);
      needs.push({
        societyId: sid,
        itemTypeId,
        required: req.quantity,
        installed: site ? Math.max(0, r3(at.get(`${site}|${itemTypeId}`) ?? 0)) : 0,
        withCrews: r3(crews.get(`${sid}|${itemTypeId}`) ?? 0),
        onOrder: r3(onOrder.get(`${sid}|${itemTypeId}`) ?? 0),
        source: req.source,
        note: t?.note ?? null,
      });
    }
  }
  const rows = allocatePlan(needs, free, order).map((r, i) => ({ ...r, source: needs[i]!.source, note: needs[i]!.note }));

  const names = new Map<string, string>();
  for (const p of live) names.set(p.societyId, p.society.name);
  for (const t of typed) names.set(t.societyId, t.society.name);
  const stageOf = new Map<string, string>();
  for (const p of live) stageOf.set(p.societyId, p.stage === "installation" ? "Installing" : p.stage === "agreed" ? "Agreement signed" : "Offer accepted");

  // Last cost per item, to put a rupee figure on what to buy.
  const lastCosts = await db.inventoryBatch.findMany({ where: { unitCost: { not: null } }, orderBy: { receivedOn: "desc" }, select: { itemTypeId: true, unitCost: true } });
  const lastCost = new Map<string, number>();
  for (const b of lastCosts) if (!lastCost.has(b.itemTypeId)) lastCost.set(b.itemTypeId, b.unitCost!);

  const societies = order.map((id) => {
    const mine = rows.filter((r) => r.societyId === id);
    return {
      id,
      name: names.get(id) ?? "",
      stage: stageOf.get(id) ?? "Typed requirements",
      short: mine.filter((r) => r.toBuy > 0).length,
      unmappedCircuits: unmapped.get(id) ?? 0,
      rows: mine.map((r) => ({ ...r, item: items.find((i) => i.id === r.itemTypeId)! })).filter((r) => r.item),
      toBuyValue: mine.reduce((s, r) => s + r.toBuy * (lastCost.get(r.itemTypeId) ?? 0), 0),
      uncosted: mine.filter((r) => r.toBuy > 0 && !lastCost.has(r.itemTypeId)).length,
    };
  });
  return { societies, items: items as ItemLite[], openPrCount: prs.length, lastCost };
}
export type Planning = Awaited<ReturnType<typeof loadPlanning>>;

/** A purchase requirement with what has arrived on each line. */
export async function loadPurchaseRequirement(id: string) {
  const pr = await db.purchaseRequirement.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { orderBy: { id: "asc" }, include: { itemType: { select: { id: true, name: true, unit: true, tracking: true } }, society: { select: { id: true, name: true } } } },
      batches: { orderBy: { receivedOn: "asc" }, select: { id: true, code: true, itemTypeId: true, quantity: true, receivedOn: true } },
    },
  });
  if (!pr) return null;
  const got = new Map<string, number>();
  for (const b of pr.batches) got.set(b.itemTypeId, (got.get(b.itemTypeId) ?? 0) + b.quantity);
  const per = receivedPerLine(pr.lines, got);
  return { ...pr, lines: pr.lines.map((l) => ({ ...l, received: per.get(l.id) ?? 0 })) };
}

/**
 * What FirsThing has installed at a society, per stock item — read from the
 * ledger at the society's site. Lights are listed separately by the portal
 * from the installation record (the figure the bill uses).
 */
export async function loadSiteStock(societyId: string) {
  const site = await db.stockLocation.findUnique({ where: { societyId }, select: { id: true } });
  const items = await db.inventoryItemType.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, tracking: true, category: true, deviceTypeId: true, active: true } });
  if (!site) return items.map((i) => ({ item: i, installed: 0 }));
  const [units, qty] = await Promise.all([
    db.inventoryUnit.groupBy({ by: ["itemTypeId"], where: { locationId: site.id, status: { in: ["deployed", "faulty"] } }, _count: { _all: true } }),
    db.stockMovement.findMany({ where: { unitId: null, OR: [{ toLocationId: site.id }, { fromLocationId: site.id }] }, select: { itemTypeId: true, quantity: true, toLocationId: true } }),
  ]);
  const n = new Map<string, number>();
  for (const g of units) n.set(g.itemTypeId, g._count._all);
  for (const m of qty) n.set(m.itemTypeId, (n.get(m.itemTypeId) ?? 0) + (m.toLocationId === site.id ? m.quantity : -m.quantity));
  return items.map((i) => ({ item: i, installed: Math.max(0, r3(n.get(i.id) ?? 0)) }));
}

/** Free stock at each office per item: in-stock units (never faulty) plus quantities. Keyed `${officeId}|${itemTypeId}`. */
export async function loadOfficeFree(): Promise<Record<string, number>> {
  const offices = await db.stockLocation.findMany({ where: { kind: "office" }, select: { id: true } });
  const ids = offices.map((o) => o.id);
  const [units, moves] = await Promise.all([
    db.inventoryUnit.groupBy({ by: ["locationId", "itemTypeId"], where: { status: "in_stock", locationId: { in: ids } }, _count: { _all: true } }),
    db.stockMovement.findMany({ where: { unitId: null, OR: [{ toLocationId: { in: ids } }, { fromLocationId: { in: ids } }] }, select: { itemTypeId: true, quantity: true, fromLocationId: true, toLocationId: true } }),
  ]);
  const out: Record<string, number> = {};
  const add = (k: string, n: number) => (out[k] = r3((out[k] ?? 0) + n));
  for (const g of units) add(`${g.locationId}|${g.itemTypeId}`, g._count._all);
  for (const m of moves) {
    if (m.toLocationId && ids.includes(m.toLocationId)) add(`${m.toLocationId}|${m.itemTypeId}`, m.quantity);
    if (m.fromLocationId && ids.includes(m.fromLocationId)) add(`${m.fromLocationId}|${m.itemTypeId}`, -m.quantity);
  }
  return out;
}

/** People stock can be issued to: active accounts with field access. */
export async function loadIssueableEmployees() {
  const rows = await db.adminUser.findMany({
    where: { isActive: true, deletedAt: null, permissions: { has: "manage_survey" } },
    select: { id: true, name: true, email: true, team: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name || r.email, team: r.team }));
}
