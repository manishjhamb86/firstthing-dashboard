import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { loadStockHoldings, rupees } from "@/lib/inventory-holdings";
import { requireInventoryPage } from "../access";

export const dynamic = "force-dynamic";
export const metadata = { title: "What is where" };

/** Every location's holdings of every item, and its value at cost. */
export default async function WhatIsWherePage() {
  await requireInventoryPage();
  const { usedItems, usedLocations, values, held, totalValue } = await loadStockHoldings();

  return (
    <>
      <PageHeader
        title="What is where"
        subtitle="Every office and society holding stock, by item, valued at cost."
        action={
          <Link href="/admin/inventory" className="btn-secondary btn-sm">
            Back to stock
          </Link>
        }
      />
      <Card className="overflow-hidden">
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
                  <th className="text-right">Value at cost</th>
                </tr>
              </thead>
              <tbody>
                {usedLocations.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="font-medium">{l.name}</span> <StatusChip tone={l.kind === "office" ? "info" : "neu"}>{l.kind === "office" ? "Office" : "Site"}</StatusChip>
                    </td>
                    {usedItems.map((i) => {
                      const n = held(l.id, i.id);
                      return (
                        <td key={i.id} className="num text-right">
                          {n > 0 ? `${n.toLocaleString("en-IN")}${i.unit === "m" ? " m" : ""}` : "—"}
                        </td>
                      );
                    })}
                    <td className="num text-right font-semibold">
                      {rupees(values.get(l.id)?.value ?? 0)}
                      {(values.get(l.id)?.uncosted ?? 0) > 0 && (
                        <span className="block text-[11px] font-normal" style={{ color: "var(--warn-fg)" }}>
                          + {values.get(l.id)!.uncosted.toLocaleString("en-IN")} without a cost
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Total</td>
                  {usedItems.map((i) => (
                    <td key={i.id} />
                  ))}
                  <td className="num text-right font-bold">{rupees(totalValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
