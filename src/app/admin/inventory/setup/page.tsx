import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { requireInventoryPage } from "../access";
import { SetupForm } from "./setup-forms";
import { AddItemType } from "./item-type-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory set-up" };

const TRACKING: Record<string, string> = { serial: "One by one", length: "By length (m)", quantity: "By quantity" };

export default async function InventorySetupPage() {
  await requireInventoryPage();
  const [offices, suppliers, items, categories, catalog] = await Promise.all([
    db.stockLocation.findMany({ where: { kind: "office" }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.inventoryItemType.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.inventoryCategory.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    db.deviceType.findMany({ where: { role: "replacement", active: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const stocked = new Set(items.map((i) => i.name.toLowerCase()));
  return (
    <>
      <PageHeader
        backHref="/admin/inventory"
        title="Offices, suppliers & items"
        subtitle="What stock can be, where it can be kept, and who it comes from."
        action={
          <div className="flex flex-wrap gap-2">
            <SetupForm kind="office" />
            <SetupForm kind="supplier" />
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardTitle>Offices</CardTitle>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Where stock arrives and comes back to. Societies become sites automatically the first time something is deployed there.
          </p>
          {offices.length === 0 ? (
            <p className="mb-3 text-[13px]" style={{ color: "var(--warn-fg)" }}>No office yet — use Add office above before receiving stock.</p>
          ) : (
            <ul className="space-y-1 text-[13.5px]">
              {offices.map((o) => (
                <li key={o.id}>
                  <span className="font-semibold">{o.name}</span>
                  {o.address && <span style={{ color: "var(--text-subtle)" }}> · {o.address}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <CardTitle>Suppliers</CardTitle>
          {suppliers.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No supplier yet — use Add supplier above.</p>
          ) : (
            <ul className="space-y-1 text-[13.5px]">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <span className="font-semibold">{s.name}</span>
                  <span style={{ color: "var(--text-subtle)" }}>{[s.gstin, s.contact, s.phone].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="mb-0">Item types</CardTitle>
            <AddItemType categories={categories.map((c) => c.name)} catalogNames={catalog.map((c) => c.name).filter((n) => !stocked.has(n.toLowerCase()))} />
          </div>
          {/* Desktop/tablet table. Below sm, a stacked card per item type
              (2026-10-07, user-caught — Category/Tracked/Make-model/Warranty
              ran off a phone's right edge): the name leads, the tracking
              method stays a chip (it's the one fact that changes how this
              item behaves elsewhere), everything else is one muted line. */}
          <div className="mb-4 hidden overflow-x-auto sm:block">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Tracked</th>
                  <th>Make / model</th>
                  <th className="text-right">Warranty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.name}</td>
                    <td>{i.category}</td>
                    <td>
                      <StatusChip tone={i.tracking === "serial" ? "info" : "neu"}>{TRACKING[i.tracking]}</StatusChip>
                    </td>
                    <td>{[i.make, i.model].filter(Boolean).join(" ") || "—"}</td>
                    <td className="num text-right">{i.defaultWarrantyMonths ? `${i.defaultWarrantyMonths} mo` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mb-4 flex flex-col gap-2 sm:hidden">
            {items.map((i) => (
              <div key={i.id} className="rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium">{i.name}</span>
                  <StatusChip tone={i.tracking === "serial" ? "info" : "neu"}>{TRACKING[i.tracking]}</StatusChip>
                </div>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {i.category}
                  {[i.make, i.model].filter(Boolean).length > 0 ? ` · ${[i.make, i.model].filter(Boolean).join(" ")}` : ""}
                  {i.defaultWarrantyMonths ? ` · ${i.defaultWarrantyMonths} mo warranty` : ""}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
