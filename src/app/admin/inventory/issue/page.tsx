import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { teamMeta } from "@/lib/admin-teams";
import { loadIssueableEmployees, loadOfficeFree, loadPlanning } from "@/lib/stock-workflow-loader";
import { requireInventoryPage } from "../access";
import { IssueForm } from "./issue-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Issue stock" };

/**
 * Hand stock from an office to an employee for one society's job
 * (2026-11-23). It stays in their custody until they install it at the
 * society or bring it back.
 */
export default async function IssuePage({ searchParams }: { searchParams: Promise<{ society?: string; employee?: string }> }) {
  await requireInventoryPage();
  const { society, employee } = await searchParams;
  const [employees, offices, societies, items, free, plan] = await Promise.all([
    loadIssueableEmployees(),
    db.stockLocation.findMany({ where: { kind: "office", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.society.findMany({ where: { closedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.inventoryItemType.findMany({ where: { active: true }, select: { id: true, name: true, unit: true, tracking: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    loadOfficeFree(),
    loadPlanning(),
  ]);
  // What each society still needs in someone's hands: required, less what is
  // installed or already with a crew.
  const needs: Record<string, { itemTypeId: string; quantity: number }[]> = {};
  for (const s of plan.societies) {
    needs[s.id] = s.rows
      .map((r) => ({ itemTypeId: r.itemTypeId, quantity: Math.max(0, Math.round((r.required - r.installed - r.withCrews) * 1000) / 1000) }))
      .filter((r) => r.quantity > 0);
  }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Issue stock to an employee"
        subtitle="The stock leaves the office and stays in the employee's custody until they install it at the society or bring it back."
        action={
          <Link href="/admin/inventory/custody" className="btn-secondary btn-sm">
            Who holds what
          </Link>
        }
      />
      {offices.length === 0 || employees.length === 0 ? (
        <p className="text-[13.5px] text-[var(--warn-fg)]">
          {offices.length === 0 ? "Add an office first in Offices, suppliers & items. " : ""}
          {employees.length === 0 ? "Nobody has field access yet — stock is issued to people who record the install from the field app." : ""}
        </p>
      ) : (
        <IssueForm
          employees={employees.map((e) => ({ id: e.id, label: e.name, sublabel: teamMeta(e.team).label }))}
          offices={offices}
          societies={societies}
          items={items}
          free={free}
          needs={needs}
          today={today}
          initialSocietyId={society ?? ""}
          initialEmployeeId={employee ?? ""}
        />
      )}
    </>
  );
}
