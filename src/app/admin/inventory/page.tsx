import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { loadStockHoldings, rupees } from "@/lib/inventory-holdings";
import { warrantyView } from "@/lib/inventory-warranty-view";
import { requireInventoryPage } from "./access";
import { normaliseInvoiceNumber } from "@/lib/invoice-number";

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
  // A supplier's invoice number finds the batches it brought (2026-11-18,
  // user-asked): one batch opens straight away, several are listed.
  let invoiceMatches: { invoiceNumber: string; supplier: string; batches: { id: string; code: string; quantity: number; item: string; unit: string }[] }[] = [];
  if (code?.trim()) {
    const want = normaliseInvoiceNumber(code);
    const purchases = await db.inventoryPurchase.findMany({
      select: { invoiceNumber: true, supplier: { select: { name: true } }, batches: { orderBy: { code: "asc" }, select: { id: true, code: true, quantity: true, itemType: { select: { name: true, unit: true } } } } },
    });
    invoiceMatches = purchases
      .filter((p) => want.length >= 3 && normaliseInvoiceNumber(p.invoiceNumber).includes(want))
      .map((p) => ({ invoiceNumber: p.invoiceNumber, supplier: p.supplier.name, batches: p.batches.map((b) => ({ id: b.id, code: b.code, quantity: b.quantity, item: b.itemType.name, unit: b.itemType.unit })) }));
    const all = invoiceMatches.flatMap((m) => m.batches);
    if (all.length === 1) redirect(`/admin/inventory/batches/${all[0].id}`);
  }

  const [holdings, batches, statusCounts] = await Promise.all([
    loadStockHoldings(),
    db.inventoryBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { itemType: { select: { name: true, unit: true } }, purchase: { select: { invoiceNumber: true, supplier: { select: { name: true } } } } },
    }),
    db.inventoryUnit.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const { usedLocations, values, officeValue, totalValue, uncosted } = holdings;
  const count = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;

  // Warranty ending within 60 days, for units still in use.
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 86_400_000);
  const warrantyBatches = await db.inventoryBatch.findMany({
    where: { warrantyMonths: { not: null }, units: { some: { status: { in: ["in_stock", "deployed", "faulty", "sent_for_repair"] } } } },
    include: { itemType: { select: { name: true } }, purchase: { select: { invoiceDate: true } }, _count: { select: { units: { where: { status: { in: ["in_stock", "deployed", "faulty", "sent_for_repair"] } } } } } },
  });
  const expiring = warrantyBatches
    .filter((b) => b.warrantyBasis === "purchase")
    .map((b) => ({ b, w: warrantyView({ warrantyMonths: b.warrantyMonths, basis: "purchase", purchaseDate: b.purchase?.invoiceDate ?? b.receivedOn, deployedOn: null, now }) }))
    .filter(({ w }) => w.until && w.until <= soon)
    .sort((a, z) => a.w.until!.getTime() - z.w.until!.getTime());

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Every device from purchase to where it is now. Scan or type a printed code to open it."
        action={
          <span className="inline-flex flex-wrap gap-2">
            <Link href="/admin/inventory/existing" className="btn-secondary btn-sm">
              Add existing inventory
            </Link>
            <Link href="/admin/inventory/receive" className="btn-primary btn-sm">
              Receive stock
            </Link>
          </span>
        }
      />
      <form className="mb-5 flex gap-2" action="/admin/inventory">
        <input name="code" defaultValue={code ?? ""} className="field" placeholder="Unit code, batch code, maker's serial or supplier invoice no. — e.g. B2609-017-00042, SQ262713" aria-label="Find by code or invoice number" autoFocus />
        <button type="submit" className="btn-secondary">
          Find
        </button>
      </form>
      {code?.trim() && invoiceMatches.length === 0 && <p className="-mt-3 mb-4 text-[13px]" style={{ color: "var(--warn-fg)" }}>Nothing has the code or invoice number “{code.trim()}”.</p>}
      {invoiceMatches.length > 0 && (
        <Card className="mb-5 p-5">
          <CardTitle>Batches on invoice “{code?.trim()}”</CardTitle>
          <ul className="space-y-3 text-[13.5px]">
            {invoiceMatches.map((m) => (
              <li key={m.invoiceNumber + m.supplier}>
                <p className="font-semibold">
                  {m.invoiceNumber} · {m.supplier}
                </p>
                {m.batches.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>No batches recorded on it.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {m.batches.map((b) => (
                      <li key={b.id}>
                        <Link href={`/admin/inventory/batches/${b.id}`} className="font-mono font-semibold">
                          {b.code}
                        </Link>{" "}
                        · {b.item} · {b.quantity} {b.unit}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <StatRow>
        <Stat label="In stock" value={count("in_stock").toLocaleString("en-IN")} detail="working, at offices" />
        <Stat label="Deployed" value={count("deployed").toLocaleString("en-IN")} detail="working, at societies" />
        <Stat label="Faulty" value={count("faulty").toLocaleString("en-IN")} detail="not working — ready to send for fixing" />
        <Stat label="Sent for repair" value={count("sent_for_repair").toLocaleString("en-IN")} detail="away on a warranty claim" />
        <Stat label="Stock value" value={rupees(officeValue)} detail={uncosted > 0 ? `at cost, held at offices · ${uncosted.toLocaleString("en-IN")} without a cost` : "at cost, held at offices"} />
        <Stat label="Warranty ending ≤ 60 days" value={expiring.reduce((n, e) => n + e.b._count.units, 0).toLocaleString("en-IN")} detail="units still in use" />
      </StatRow>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 p-5 pb-2">
            <CardTitle>Batches</CardTitle>
            <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {batches.length.toLocaleString("en-IN")} {batches.length === 1 ? "batch" : "batches"}, newest first
            </span>
          </div>
          {batches.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No batches yet">Receive a delivery against its supplier invoice to start.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl tbl-compact">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Item</th>
                    <th className="text-right">Quantity</th>
                    <th>Supplier · invoice</th>
                    <th>Received</th>
                    <th className="text-right">Cost each</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/admin/inventory/batches/${b.id}`} className="font-mono font-semibold">
                          {b.code}
                        </Link>
                      </td>
                      <td>
                        {b.itemType.name}
                        {b.historical && (
                          <>
                            {" "}
                            <StatusChip tone="neu">Pre-existing</StatusChip>
                          </>
                        )}
                      </td>
                      <td className="num text-right">
                        {b.quantity.toLocaleString("en-IN")} {b.itemType.unit}
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>{b.purchase ? `${b.purchase.supplier.name} · ${b.purchase.invoiceNumber}` : "Existing stock"}</td>
                      <td className="whitespace-nowrap">{formatDate(b.receivedOn)}</td>
                      <td className="num text-right">{b.unitCost != null ? `₹${b.unitCost.toLocaleString("en-IN")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <CardTitle>What is where</CardTitle>
            {usedLocations.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No stock held anywhere yet.</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {usedLocations.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3">
                    <span>{l.name}</span>
                    <span className="num">{rupees(values.get(l.id)?.value ?? 0)}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 border-t pt-1.5 font-semibold" style={{ borderColor: "var(--border)" }}>
                  <span>Total at cost</span>
                  <span className="num">{rupees(totalValue)}</span>
                </li>
              </ul>
            )}
            <Link href="/admin/inventory/where" className="btn-secondary btn-sm mt-4 inline-flex">
              See every item by location →
            </Link>
          </Card>
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
        </div>
      </div>
    </>
  );
}
