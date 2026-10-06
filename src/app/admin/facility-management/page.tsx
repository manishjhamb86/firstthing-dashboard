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
        <>
          {/* Desktop/tablet table. Below sm, a stacked card per company
              (2026-10-07, user-caught — this list was still the plain,
              untouched old table): the name leads, and the three figures
              become one muted line rather than three columns with nowhere
              to go on a phone. */}
          <Card className="hidden overflow-hidden sm:block">
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

          <div className="flex flex-col gap-2 sm:hidden">
            {companies.map((c) => {
              const now = c.engagements.filter((e) => !e.endedOn);
              return (
                <Link
                  key={c.id}
                  href={`/admin/facility-management/${c.id}`}
                  className="card block p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-semibold">{c.name}</span>
                    {!c.active && <StatusChip tone="neu">Inactive</StatusChip>}
                  </div>
                  {c.contact && (
                    <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                      {[c.contact, c.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    Runs: {now.length ? now.map((e) => e.society.name).join(", ") : "nothing currently"}
                  </p>
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    <span className="num">{c.employees.filter((e) => !e.endedOn).length}</span> employees now ·{" "}
                    <span className="num">{c.engagements.length - now.length}</span> past societies ·{" "}
                    <span className="num">{c.employees.filter((e) => e.endedOn).length}</span> past people
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
