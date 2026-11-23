import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { loadPlanning } from "@/lib/stock-workflow-loader";
import { rupees } from "@/lib/inventory-holdings";
import { requireInventoryPage } from "../access";
import { GeneratePrButton, TypedRequirementForm } from "./planning-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Procurement planning" };

const fmt = (n: number, unit: string) => `${n.toLocaleString("en-IN")}${unit === "m" ? " m" : ""}`;

/**
 * What each signed deal still needs against what is in stock (2026-11-23).
 * Lights come from the deal; every other item is typed by operations. Free
 * office stock is shared across societies oldest deal first.
 */
export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ society?: string }> }) {
  await requireInventoryPage();
  const { society: wanted } = await searchParams;
  const [plan, allSocieties] = await Promise.all([
    loadPlanning(),
    db.society.findMany({ where: { closedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // A society chosen from "Plan for another society" may have no lines yet.
  const extra = wanted && !plan.societies.some((s) => s.id === wanted) ? allSocieties.find((s) => s.id === wanted) : undefined;
  const current = plan.societies.find((s) => s.id === wanted) ?? (extra ? null : plan.societies[0]) ?? null;
  const currentId = current?.id ?? extra?.id ?? null;
  const currentName = current?.name ?? extra?.name ?? "";

  return (
    <>
      <PageHeader
        title="Procurement planning"
        subtitle="What each signed deal still needs, against what is in stock. Lights come from the deal; other items are added by hand."
        action={
          <Link href="/admin/inventory/purchase-requirements" className="btn-secondary btn-sm">
            Purchase requirements{plan.openPrCount > 0 ? ` · ${plan.openPrCount} open` : ""}
          </Link>
        }
      />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Card className="overflow-hidden lg:w-[320px] lg:shrink-0">
          <div className="px-4 pb-2 pt-4">
            <p className="text-[15px] font-semibold">Societies with work ahead</p>
          </div>
          {plan.societies.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-[var(--text-muted)]">No signed deal is waiting for stock. Add a requirement for a society below.</p>
          ) : (
            plan.societies.map((s) => (
              <Link
                key={s.id}
                href={`/admin/inventory/planning?society=${s.id}`}
                className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-4 py-3 text-[var(--text)]"
                style={{ background: s.id === currentId ? "var(--accent-subtle)" : undefined }}
                aria-current={s.id === currentId ? "page" : undefined}
              >
                <span className="min-w-0">
                  <span className={`block text-[14px] ${s.id === currentId ? "font-bold" : "font-medium"}`}>{s.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{s.stage}</span>
                </span>
                {s.short > 0 ? <StatusChip tone="warn">{s.short} short</StatusChip> : <StatusChip tone="ok">All covered</StatusChip>}
              </Link>
            ))
          )}
          <form action="/admin/inventory/planning" className="flex flex-col gap-2 border-t border-[var(--border-subtle)] p-4">
            <label htmlFor="plan-other" className="lbl">
              Plan for another society
            </label>
            <div className="flex gap-2">
              <select id="plan-other" name="society" className="field" defaultValue="">
                <option value="" disabled>
                  Choose a society
                </option>
                {allSocieties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="btn-secondary btn-sm">Open</button>
            </div>
          </form>
        </Card>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {!currentId ? (
            <Card className="p-5">
              <EmptyState title="Nothing to plan yet">Once a society accepts an offer, its lights appear here. Pick a society on the left to add other items.</EmptyState>
            </Card>
          ) : (
            <>
              <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <h2 className="text-[19px] font-bold">{currentName}</h2>
                  <p className="text-[13.5px] text-[var(--text-muted)]">{current?.stage ?? "No signed deal — typed requirements only"}</p>
                  {current && current.unmappedCircuits > 0 && (
                    <p className="mt-1 text-[13px] text-[var(--warn-fg)]">
                      {current.unmappedCircuits} circuit{current.unmappedCircuits === 1 ? "'s" : "s'"} light model is not a stock item yet — link the light to an item in{" "}
                      <Link href="/admin/inventory/setup" className="underline">
                        Offices, suppliers &amp; items
                      </Link>{" "}
                      or add it below by hand.
                    </p>
                  )}
                </div>
                {current && (
                  <div className="flex gap-6">
                    <div>
                      <p className="lbl">Items short</p>
                      <p className="num text-[22px] font-bold" style={{ color: current.short ? "var(--warn-fg)" : undefined }}>
                        {current.short} of {current.rows.length}
                      </p>
                    </div>
                    <div>
                      <p className="lbl">To buy, at last cost</p>
                      <p className="num text-[22px] font-bold">{rupees(current.toBuyValue)}</p>
                      {current.uncosted > 0 && <p className="text-xs text-[var(--text-muted)]">{current.uncosted} without a cost</p>}
                    </div>
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                {(current?.rows.length ?? 0) === 0 ? (
                  <div className="p-5">
                    <EmptyState title="No requirements yet">Add what this society needs below.</EmptyState>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tbl tbl-compact">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Required — from</th>
                          <th className="text-right">Required</th>
                          <th className="text-right">Installed</th>
                          <th className="text-right">With crews</th>
                          <th className="text-right">On order</th>
                          <th className="text-right">Free at offices</th>
                          <th className="text-right">To buy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current!.rows.map((r) => (
                          <tr key={r.itemTypeId}>
                            <td className="font-medium">{r.item.name}</td>
                            <td className="text-[12.5px] text-[var(--text-muted)]">
                              {r.source === "deal" ? "The accepted offer" : `Added by hand${r.note ? ` — ${r.note}` : ""}`}
                            </td>
                            <td className="num text-right font-semibold">{fmt(r.required, r.item.unit)}</td>
                            <td className="num text-right">{fmt(r.installed, r.item.unit)}</td>
                            <td className="num text-right">{fmt(r.withCrews, r.item.unit)}</td>
                            <td className="num text-right">{fmt(r.onOrder, r.item.unit)}</td>
                            <td className="num text-right">{fmt(r.freeAllocated, r.item.unit)}</td>
                            <td className="num text-right font-bold" style={{ color: r.toBuy > 0 ? "var(--warn-fg)" : "var(--ok-fg)" }}>
                              {fmt(r.toBuy, r.item.unit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
                  <p className="max-w-[640px] text-[12.5px] text-[var(--text-muted)]">
                    To buy = required − installed − held by crews for this society − already on order − free stock at the offices. Free stock is shared across every society that needs it, oldest deal first, so it is never promised twice.
                  </p>
                  {current && current.short > 0 && <GeneratePrButton societyId={current.id} />}
                </div>
              </Card>

              <Card className="p-5">
                <p className="mb-1 text-[15px] font-semibold">Add or change a requirement</p>
                <p className="mb-4 text-[13px] text-[var(--text-muted)]">
                  Meters, routers, SIM cards, wire and anything else are added here. A line for a light replaces the figure from the deal.
                </p>
                <TypedRequirementForm
                  societyId={currentId}
                  items={plan.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
                  typed={(current?.rows ?? []).filter((r) => r.source === "typed").map((r) => ({ itemTypeId: r.itemTypeId, name: r.item.name, quantity: r.required, unit: r.item.unit, note: r.note }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
