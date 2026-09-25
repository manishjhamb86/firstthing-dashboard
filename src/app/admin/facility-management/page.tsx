import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { FmCompanyButton } from "./company-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facility management" };

/**
 * The facility management companies we deal with (2026-09-25): each with the
 * societies it runs now and the people it employs now; history on the
 * company's own page.
 */
export default async function FacilityManagementPage() {
  await requireAdminPage();
  const companies = await db.facilityManagementCompany.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      engagements: { select: { endedOn: true, society: { select: { name: true } } } },
      employees: { select: { endedOn: true } },
    },
  });
  return (
    <>
      <PageHeader
        title="Facility management"
        subtitle="The companies that run societies' facilities, the societies each serves, and the people each employs — with history."
        action={<FmCompanyButton />}
      />
      {companies.length === 0 ? (
        <EmptyState title="No companies yet">Add one here, or pick one when adding or editing a society.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Runs now</th>
                <th className="text-right">Employees now</th>
                <th className="text-right">Past societies / people</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const now = c.engagements.filter((e) => !e.endedOn);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/facility-management/${c.id}`} className="font-semibold">
                        {c.name}
                      </Link>{" "}
                      {!c.active && <StatusChip tone="neu">Inactive</StatusChip>}
                      {c.contact && <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>{[c.contact, c.phone].filter(Boolean).join(" · ")}</span>}
                    </td>
                    <td className="text-[13px]">{now.length ? now.map((e) => e.society.name).join(", ") : "—"}</td>
                    <td className="num text-right">{c.employees.filter((e) => !e.endedOn).length}</td>
                    <td className="num text-right">
                      {c.engagements.length - now.length} / {c.employees.filter((e) => e.endedOn).length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
