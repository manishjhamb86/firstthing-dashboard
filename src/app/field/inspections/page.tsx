import Link from "next/link";
import { db } from "@/lib/db";
import { EmptyState, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
import { requireFieldPage } from "../access";
import { OnThisPhone } from "./on-this-phone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspections" };

/**
 * The inspections this person has filed, and the ones still on the phone.
 * The first list is the office's record; the second is only ever this phone's.
 */
export default async function FieldInspectionsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireFieldPage();
  const { saved } = await searchParams;
  const filed = await db.inspection.findMany({
    where: { createdById: me.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { society: { select: { name: true } }, _count: { select: { findings: true } } },
  });

  return (
    <>
      <header className="mb-4">
        <h1 className="text-[24px] font-bold leading-tight">Inspections</h1>
        <p className="text-[var(--text-muted)]">The monthly motion-sensor checklist.</p>
      </header>

      {saved && (
        <p role="status" className="card p-3 mb-4" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" }}>
          Saved on this phone. It is sent to the office by itself — with signal now, or when it returns.
        </p>
      )}

      <Link href="/field/inspections/new" className="btn-primary w-full min-h-[52px] flex items-center justify-center text-[16px] mb-6">
        File a monthly inspection
      </Link>

      <OnThisPhone />

      <section>
        <h2 className="lbl mb-2">Filed by you</h2>
        {filed.length === 0 ? (
          <EmptyState title="Nothing filed yet">An inspection appears here once the office has it.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {filed.map((i) => (
              <li key={i.id}>
                <Link href={`/admin/inspections/${i.id}`} className="card block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{i.society.name}</p>
                      <p className="text-[var(--text-muted)]">
                        {monthLabel(i.period)}
                        {i.area ? ` · ${i.area}` : " · whole society"}
                      </p>
                    </div>
                    {i.voidedAt ? (
                      <StatusChip tone="neu">Voided</StatusChip>
                    ) : i.totalLightsChecked === null ? (
                      <StatusChip tone="warn">In progress</StatusChip>
                    ) : (
                      <StatusChip tone={i._count.findings > 0 ? "warn" : "ok"}>
                        {i._count.findings} of {i.totalLightsChecked} faulty
                      </StatusChip>
                    )}
                  </div>
                  <p className="text-[var(--text-muted)] mt-1">Inspected {formatDate(i.inspectedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
