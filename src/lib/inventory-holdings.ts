import { db } from "@/lib/db";
import { valueHoldings } from "@/lib/inventory";

/**
 * What is where: serial units counted, quantities summed from the ledger,
 * each location valued at its batches' cost. Shared by the Stock overview
 * (its value tile and summary card) and the full "What is where" page
 * (2026-11-20, moved off the overview at the user's request).
 * Units that left (scrapped, lost, returned) have no location and carry no value.
 */
export async function loadStockHoldings() {
  const [items, locations, unitGroups, qtyMoves, batchCosts] = await Promise.all([
    db.inventoryItemType.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, tracking: true } }),
    db.stockLocation.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
    db.inventoryUnit.groupBy({ by: ["locationId", "itemTypeId", "batchId"], where: { locationId: { not: null } }, _count: { _all: true } }),
    db.stockMovement.findMany({ where: { unitId: null }, select: { itemTypeId: true, batchId: true, quantity: true, fromLocationId: true, toLocationId: true } }),
    db.inventoryBatch.findMany({ select: { id: true, unitCost: true } }),
  ]);

  const cell = new Map<string, number>();
  for (const g of unitGroups) cell.set(`${g.locationId}|${g.itemTypeId}`, (cell.get(`${g.locationId}|${g.itemTypeId}`) ?? 0) + g._count._all);
  for (const m of qtyMoves) {
    if (m.toLocationId) cell.set(`${m.toLocationId}|${m.itemTypeId}`, (cell.get(`${m.toLocationId}|${m.itemTypeId}`) ?? 0) + m.quantity);
    if (m.fromLocationId) cell.set(`${m.fromLocationId}|${m.itemTypeId}`, (cell.get(`${m.fromLocationId}|${m.itemTypeId}`) ?? 0) - m.quantity);
  }

  const costs = new Map(batchCosts.map((b) => [b.id, b.unitCost]));
  const perBatch = new Map<string, number>();
  for (const g of unitGroups) perBatch.set(`${g.locationId}|${g.batchId}`, g._count._all);
  for (const m of qtyMoves) {
    if (!m.batchId) continue;
    if (m.toLocationId) perBatch.set(`${m.toLocationId}|${m.batchId}`, (perBatch.get(`${m.toLocationId}|${m.batchId}`) ?? 0) + m.quantity);
    if (m.fromLocationId) perBatch.set(`${m.fromLocationId}|${m.batchId}`, (perBatch.get(`${m.fromLocationId}|${m.batchId}`) ?? 0) - m.quantity);
  }
  const values = valueHoldings(
    [...perBatch.entries()].map(([k, quantity]) => {
      const [locationId, batchId] = k.split("|");
      return { locationId, quantity, unitCost: costs.get(batchId) ?? null };
    }),
  );

  const officeIds = new Set(locations.filter((l) => l.kind === "office").map((l) => l.id));
  const officeValue = [...values.entries()].filter(([id]) => officeIds.has(id)).reduce((n, [, v]) => n + v.value, 0);
  const totalValue = [...values.values()].reduce((n, v) => n + v.value, 0);
  const uncosted = [...values.values()].reduce((n, v) => n + v.uncosted, 0);
  const usedItems = items.filter((i) => locations.some((l) => (cell.get(`${l.id}|${i.id}`) ?? 0) > 0));
  const usedLocations = locations.filter((l) => usedItems.some((i) => (cell.get(`${l.id}|${i.id}`) ?? 0) > 0));
  const held = (locationId: string, itemTypeId: string) => Math.round((cell.get(`${locationId}|${itemTypeId}`) ?? 0) * 1000) / 1000;

  return { usedItems, usedLocations, values, held, officeValue, totalValue, uncosted };
}

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
