import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
import { inspectionReminderPeriod, societiesMissingInspection } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspections" };

// The monthly, per-society motion-sensor-light inspection — digitising the
// real paper checklist FirsThing's inspectors already carry into the field.
// Field work (manage_survey), same gate as gate passes, benchmark rescale
// entry and circuit replacement recording.
export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_survey")) redirect("/admin");

  // Where the collapsed "N societies have no <period> inspection" reminder
  // lands. The notification carries the count; this is the who. Both read
  // `societiesMissingInspection`, so the number on the bell and the rows
  // here are the same query rather than two that can disagree.
  const { missing: missingParam } = await searchParams;
  const missingPeriod =
    missingParam && /^\d{4}-\d{2}$/.test(missingParam) ? missingParam : null;
  const missing = missingPeriod ? await societiesMissingInspection(missingPeriod) : [];
  const currentReminderPeriod = inspectionReminderPeriod();

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
        chip={
          missingPeriod === null ? (
            <Link href={`/admin/inspections?missing=${currentReminderPeriod}`}>
              <StatusChip tone="warn">Who has not filed?</StatusChip>
            </Link>
          ) : undefined
        }
      />

      {missingPeriod !== null && (
        <Card className="mb-6 p-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              Not filed for {monthLabel(`${missingPeriod}-01`)}
            </h2>
            <Link href="/admin/inspections" className="text-[13px] font-semibold underline">
              Show all inspections →
            </Link>
          </div>
          {missing.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">
              Every society with an active contract has a finalised inspection for this month.
            </p>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-[var(--text-muted)]">
                {missing.length} societ{missing.length === 1 ? "y" : "ies"} with an active contract
                {missing.length === 1 ? " has" : " have"} no finalised inspection for this month. A
                started-but-abandoned draft does not count.
              </p>
              <ul className="flex flex-col">
                {missing.map((m, i) => (
                  <li
                    key={m.societyId}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                    style={i < missing.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                  >
                    <span className="text-[13.5px] font-medium">{m.name}</span>
                    <Link
                      href={`/admin/inspections/new?societyId=${m.societyId}`}
                      className="btn-ghost btn-sm"
                    >
                      File it →
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

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
                  <td className="num text-right">{i.totalLightsChecked ?? "—"}</td>
                  <td className="num text-right">{i.totalLightsChecked === null ? "—" : i._count.findings}</td>
                  <td>
                    {i.voidedAt ? (
                      <StatusChip tone="neu">Voided</StatusChip>
                    ) : i.totalLightsChecked === null ? (
                      <StatusChip tone="info">In progress</StatusChip>
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
