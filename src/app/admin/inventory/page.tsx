import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
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
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ code?: string; item?: string }> }) {
  await requireInventoryPage();
  const { code, item } = await searchParams;
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
      include: { itemType: { select: { id: true, name: true, unit: true, category: true } }, purchase: { select: { invoiceNumber: true, supplier: { select: { name: true } } } } },
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

  // The batch listing (2026-11-20 redesign): full width, one line per batch,
  // grouped by the month received, filterable by item.
  const chipMap = new Map<string, { id: string; name: string; n: number }>();
  for (const b of batches) {
    const c = chipMap.get(b.itemType.id) ?? { id: b.itemType.id, name: b.itemType.name, n: 0 };
    c.n++;
    chipMap.set(b.itemType.id, c);
  }
  const itemChips = [...chipMap.values()].sort((a, z) => z.n - a.n || a.name.localeCompare(z.name));
  const shown = item ? batches.filter((b) => b.itemType.id === item) : batches;
  const shownQty = shown.reduce((n, b) => n + b.quantity, 0);
  const shownValue = shown.reduce((n, b) => n + (b.unitCost ?? 0) * b.quantity, 0);
  const shownUnits = new Set(shown.map((b) => b.itemType.unit));
  const shownUnitLabel = shownUnits.size === 1 ? [...shownUnits][0] : "units";
  const groups: { month: string; label: string; rows: typeof shown; qty: number; value: number }[] = [];
  for (const b of [...shown].sort((a, z) => z.receivedOn.getTime() - a.receivedOn.getTime() || z.code.localeCompare(a.code))) {
    const month = b.receivedOn.toISOString().slice(0, 7);
    let g = groups.find((x) => x.month === month);
    if (!g) groups.push((g = { month, label: monthLabel(month), rows: [], qty: 0, value: 0 }));
    g.rows.push(b);
    g.qty += b.quantity;
    g.value += (b.unitCost ?? 0) * b.quantity;
  }
  const categoryLabel = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " ") : "Other");

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
        <Stat
          label="Faulty or in repair"
          value={(count("faulty") + count("sent_for_repair")).toLocaleString("en-IN")}
          detail={`${count("faulty").toLocaleString("en-IN")} faulty · ${count("sent_for_repair").toLocaleString("en-IN")} away on a claim`}
        />
        <Stat label="Stock value" value={rupees(officeValue)} detail={uncosted > 0 ? `at cost, before GST · ${uncosted.toLocaleString("en-IN")} without a cost` : "at cost, before GST, held at offices"} />
      </StatRow>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>What is where</CardTitle>
            <Link href="/admin/inventory/where" className="text-[13px] font-semibold">
              Every item by location →
            </Link>
          </div>
          {usedLocations.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No stock held anywhere yet.</p>
          ) : (
            <ul className="mt-1 space-y-3">
              {usedLocations.map((l) => {
                const v = values.get(l.id)?.value ?? 0;
                const units = holdings.usedItems.reduce((n, i) => n + holdings.held(l.id, i.id), 0);
                return (
                  <li key={l.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13.5px]">
                      <span className="font-medium">{l.name}</span>
                      <span className="num font-semibold">
                        {rupees(v)} <span className="font-normal" style={{ color: "var(--text-subtle)" }}>· {units.toLocaleString("en-IN")} units</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border-subtle)" }}>
                      <div className="h-full" style={{ width: `${totalValue > 0 ? Math.round((v / totalValue) * 100) : 0}%`, background: "var(--accent)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <CardTitle>Warranty ending soon</CardTitle>
          {expiring.length === 0 ? (
            <p className="text-[13.5px]" style={{ color: "var(--text-muted)" }}>Nothing ends in the next 60 days.</p>
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
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
            Warranties that run from installation are shown on each unit.
          </p>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <CardTitle>Batches</CardTitle>
            <span className="num text-[13px]" style={{ color: "var(--text-muted)" }}>
              {shown.length.toLocaleString("en-IN")} {shown.length === 1 ? "batch" : "batches"} · {shownQty.toLocaleString("en-IN")} {shownUnitLabel} · {rupees(shownValue)}
            </span>
          </div>
          {itemChips.length > 1 && (
            <nav className="flex flex-wrap gap-2" aria-label="Filter batches by item">
              <Link href="/admin/inventory" className={`chip-filter${!item ? " is-on" : ""}`} aria-current={!item ? "true" : undefined}>
                All items · {batches.length}
              </Link>
              {itemChips.map((c) => (
                <Link key={c.id} href={`/admin/inventory?item=${c.id}`} className={`chip-filter${item === c.id ? " is-on" : ""}`} aria-current={item === c.id ? "true" : undefined}>
                  {c.name} · {c.n}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {shown.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="No batches yet">Receive a delivery against its supplier invoice to start.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl batch-tbl">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Item</th>
                  <th>Supplier invoice</th>
                  <th>Received</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Cost each</th>
                  <th className="text-right">Value</th>
                  <th>Warranty</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.month}>
                    <tr className="batch-grp">
                      <td colSpan={8}>
                        <span className="font-semibold">{g.label}</span>{" "}
                        <span className="num" style={{ color: "var(--text-subtle)" }}>
                          · {g.rows.length} {g.rows.length === 1 ? "batch" : "batches"} · {g.qty.toLocaleString("en-IN")} {new Set(g.rows.map((r) => r.itemType.unit)).size === 1 ? g.rows[0].itemType.unit : "units"} · {rupees(g.value)}
                        </span>
                      </td>
                    </tr>
                    {g.rows.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <Link href={`/admin/inventory/batches/${b.id}`} className="font-mono font-semibold">
                            {b.code}
                          </Link>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <span className="font-medium">{b.itemType.name}</span>
                            <StatusChip tone={b.itemType.category === "light" ? "info" : "neu"}>{categoryLabel(b.itemType.category)}</StatusChip>
                            {b.historical && <StatusChip tone="neu">Pre-existing</StatusChip>}
                          </span>
                        </td>
                        <td>
                          {b.purchase ? (
                            <>
                              <span className="font-mono">{b.purchase.invoiceNumber}</span> <span style={{ color: "var(--text-subtle)" }}>· {b.purchase.supplier.name}</span>
                            </>
                          ) : (
                            <span style={{ color: "var(--text-subtle)" }}>Existing stock</span>
                          )}
                        </td>
                        <td className="num">{formatDate(b.receivedOn)}</td>
                        <td className="num text-right font-semibold">
                          {b.quantity.toLocaleString("en-IN")} <span className="font-normal" style={{ color: "var(--text-subtle)" }}>{b.itemType.unit}</span>
                        </td>
                        <td className="num text-right">{b.unitCost != null ? `₹${b.unitCost.toLocaleString("en-IN")}` : "—"}</td>
                        <td className="num text-right font-semibold">{b.unitCost != null ? rupees(b.unitCost * b.quantity) : "—"}</td>
                        <td style={{ color: b.warrantyMonths ? undefined : "var(--warn-fg)" }}>{b.warrantyMonths ? `${b.warrantyMonths} months` : "Not recorded"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
