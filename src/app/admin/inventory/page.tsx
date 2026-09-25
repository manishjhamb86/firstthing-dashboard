import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { warrantyView } from "@/lib/inventory-warranty-view";
import { requireInventoryPage } from "./access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

/**
 * Inventory overview (2026-09-25): find any unit by its printed code, see
 * what is where in what quantity, and what is about to fall out of warranty.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireInventoryPage();
  const { code } = await searchParams;
  if (code?.trim()) {
    const c = code.trim().toUpperCase();
    const unit = await db.inventoryUnit.findFirst({ where: { OR: [{ code: c }, { serialNumber: { equals: code.trim(), mode: "insensitive" } }] }, select: { code: true } });
    if (unit) redirect(`/admin/inventory/units/${unit.code}`);
    const batch = await db.inventoryBatch.findUnique({ where: { code: c }, select: { id: true } });
    if (batch) redirect(`/admin/inventory/batches/${batch.id}`);
  }

  const [items, locations, unitGroups, qtyMoves, batches, statusCounts] = await Promise.all([
    db.inventoryItemType.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true, tracking: true } }),
    db.stockLocation.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
    db.inventoryUnit.groupBy({ by: ["locationId", "itemTypeId"], where: { locationId: { not: null } }, _count: { _all: true } }),
    db.stockMovement.findMany({ where: { unitId: null }, select: { itemTypeId: true, quantity: true, fromLocationId: true, toLocationId: true } }),
    db.inventoryBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { itemType: { select: { name: true, unit: true } }, purchase: { select: { invoiceDate: true, supplier: { select: { name: true } } } } },
    }),
    db.inventoryUnit.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // What is where: serial units counted, quantities summed from the ledger.
  const cell = new Map<string, number>();
  for (const g of unitGroups) cell.set(`${g.locationId}|${g.itemTypeId}`, g._count._all);
  for (const m of qtyMoves) {
    if (m.toLocationId) cell.set(`${m.toLocationId}|${m.itemTypeId}`, (cell.get(`${m.toLocationId}|${m.itemTypeId}`) ?? 0) + m.quantity);
    if (m.fromLocationId) cell.set(`${m.fromLocationId}|${m.itemTypeId}`, (cell.get(`${m.fromLocationId}|${m.itemTypeId}`) ?? 0) - m.quantity);
  }
  const usedItems = items.filter((i) => locations.some((l) => (cell.get(`${l.id}|${i.id}`) ?? 0) > 0));
  const usedLocations = locations.filter((l) => usedItems.some((i) => (cell.get(`${l.id}|${i.id}`) ?? 0) > 0));
  const count = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;

  // Warranty ending within 60 days, for units still in use.
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 86_400_000);
  const warrantyBatches = await db.inventoryBatch.findMany({
    where: { warrantyMonths: { not: null }, units: { some: { status: { in: ["in_stock", "deployed", "faulty"] } } } },
    include: { itemType: { select: { name: true } }, purchase: { select: { invoiceDate: true } }, _count: { select: { units: { where: { status: { in: ["in_stock", "deployed", "faulty"] } } } } } },
  });
  const expiring = warrantyBatches
    .filter((b) => b.warrantyBasis === "purchase")
    .map((b) => ({ b, w: warrantyView({ warrantyMonths: b.warrantyMonths, basis: "purchase", purchaseDate: b.purchase.invoiceDate, deployedOn: null, now }) }))
    .filter(({ w }) => w.until && w.until <= soon)
    .sort((a, z) => a.w.until!.getTime() - z.w.until!.getTime());

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Every device from purchase to where it is now. Scan or type a printed code to open it."
        action={
          <Link href="/admin/inventory/receive" className="btn-primary btn-sm">
            Receive stock
          </Link>
        }
      />
      <form className="mb-5 flex gap-2" action="/admin/inventory">
        <input name="code" defaultValue={code ?? ""} className="field" placeholder="Unit code, batch code or maker's serial — e.g. B2609-017-00042" aria-label="Find by code" autoFocus />
        <button type="submit" className="btn-secondary">
          Find
        </button>
      </form>
      {code?.trim() && <p className="-mt-3 mb-4 text-[13px]" style={{ color: "var(--warn-fg)" }}>Nothing has the code “{code.trim()}”.</p>}

      <StatRow>
        <Stat label="In stock" value={count("in_stock").toLocaleString("en-IN")} detail="units at offices" />
        <Stat label="Deployed" value={count("deployed").toLocaleString("en-IN")} detail="units at societies" />
        <Stat label="Faulty" value={count("faulty").toLocaleString("en-IN")} detail="awaiting repair or return" />
        <Stat label="Warranty ending ≤ 60 days" value={expiring.reduce((n, e) => n + e.b._count.units, 0).toLocaleString("en-IN")} detail="units still in use" />
      </StatRow>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="p-5 pb-2">
            <CardTitle>What is where</CardTitle>
          </div>
          {usedLocations.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No stock recorded yet">Receive a delivery against its supplier invoice to start.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl tbl-compact">
                <thead>
                  <tr>
                    <th>Location</th>
                    {usedItems.map((i) => (
                      <th key={i.id} className="text-right">
                        {i.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usedLocations.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="font-medium">{l.name}</span> <StatusChip tone={l.kind === "office" ? "info" : "neu"}>{l.kind === "office" ? "Office" : "Site"}</StatusChip>
                      </td>
                      {usedItems.map((i) => {
                        const n = Math.round((cell.get(`${l.id}|${i.id}`) ?? 0) * 1000) / 1000;
                        return (
                          <td key={i.id} className="num text-right">
                            {n > 0 ? `${n.toLocaleString("en-IN")}${i.unit === "m" ? " m" : ""}` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle>Warranty ending soon</CardTitle>
            {expiring.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Nothing ends in the next 60 days.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {expiring.map(({ b, w }) => (
                  <li key={b.id}>
                    <Link href={`/admin/inventory/batches/${b.id}`} className="font-mono font-semibold">
                      {b.code}
                    </Link>{" "}
                    · {b.itemType.name} · {b._count.units} units <StatusChip tone={w.tone}>{w.label}</StatusChip>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Warranties that run from installation are shown on each unit.
            </p>
          </Card>
          <Card className="p-5">
            <CardTitle>Recent batches</CardTitle>
            {batches.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>None yet.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {batches.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/inventory/batches/${b.id}`} className="font-mono font-semibold">
                      {b.code}
                    </Link>{" "}
                    · {b.itemType.name} · {b.quantity} {b.itemType.unit}
                    <span style={{ color: "var(--text-subtle)" }}>
                      {" "}
                      · {b.purchase.supplier.name}, {formatDate(b.receivedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
