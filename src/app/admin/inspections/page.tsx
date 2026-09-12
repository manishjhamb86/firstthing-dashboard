import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspections" };

// The monthly, per-society motion-sensor-light inspection — digitising the
// real paper checklist FirsThing's inspectors already carry into the field.
// Field work (manage_survey), same gate as gate passes, benchmark rescale
// entry and circuit replacement recording.
export default async function InspectionsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_survey")) redirect("/admin");

  const inspections = await db.inspection.findMany({
    orderBy: [{ inspectedAt: "desc" }],
    take: 100,
    include: {
      society: { select: { name: true, location: true } },
      _count: { select: { findings: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Inspections"
        subtitle="One monthly visit per society and area — only faulty or notable fixtures are recorded."
        action={
          <Link href="/admin/inspections/new" className="btn-primary">
            New inspection
          </Link>
        }
      />

      {inspections.length === 0 ? (
        <EmptyState title="No inspections filed yet">
          The first monthly visit appears here once an inspector records one.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Area</th>
                <th>Month</th>
                <th>Inspected</th>
                <th>Inspector</th>
                <th className="text-right">Checked</th>
                <th className="text-right">Faulty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} className={i.voidedAt ? "opacity-50" : ""}>
                  <td>
                    <Link href={`/admin/inspections/${i.id}`} className="font-medium hover:underline">
                      {i.society.name}
                    </Link>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {i.society.location}
                    </p>
                  </td>
                  <td>{i.area || "Whole society"}</td>
                  <td>{monthLabel(`${i.period}-01`)}</td>
                  <td>{formatDate(i.inspectedAt)}</td>
                  <td>{i.inspectorName}</td>
                  <td className="num text-right">{i.totalLightsChecked}</td>
                  <td className="num text-right">{i._count.findings}</td>
                  <td>
                    {i.voidedAt ? (
                      <StatusChip tone="neu">Voided</StatusChip>
                    ) : i._count.findings === 0 ? (
                      <StatusChip tone="ok">Clean</StatusChip>
                    ) : (
                      <StatusChip tone="warn">{i._count.findings} faulty</StatusChip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
