import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { requireInventoryPage } from "../access";
import { moveContext } from "@/lib/inventory-loader";
import { ExistingStockForm } from "./existing-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add existing inventory" };

/**
 * Stock that was already in place before this system existed (2026-10-12,
 * user-asked) — no supplier invoice, no batch number to type in, just the
 * type and how many. A real batch and (for a serial-tracked item) real
 * printable unit codes are still generated automatically, exactly as a
 * normal receipt gets; it is tagged "Pre-existing" everywhere it is shown.
 */
export default async function ExistingStockPage() {
  await requireInventoryPage();
  const [items, ctx] = await Promise.all([
    db.inventoryItemType.findMany({
      where: { active: true },
      select: { id: true, name: true, tracking: true, unit: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    moveContext(),
  ]);
  return (
    <>
      <PageHeader
        backHref="/admin/inventory"
        title="Add existing inventory"
        subtitle="Stock that was already there before FirsThing started tracking it — no invoice, no batch number. Just the item, how many, and where it already is."
      />
      {items.length === 0 || ctx.offices.length === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--warn-fg)" }}>
          Add {ctx.offices.length === 0 ? "an office" : ""}
          {ctx.offices.length === 0 && items.length === 0 ? " and " : ""}
          {items.length === 0 ? "an item type" : ""} first —{" "}
          <Link href="/admin/inventory/setup" className="underline">
            Offices, suppliers &amp; items
          </Link>
          .
        </p>
      ) : (
        <ExistingStockForm items={items} offices={ctx.offices} societies={ctx.societies} today={ctx.today} />
      )}
    </>
  );
}
