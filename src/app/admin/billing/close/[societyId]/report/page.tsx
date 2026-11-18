import { notFound, redirect } from "next/navigation";
import { PageHeader, StatusChip } from "@/components/ui";
import { db } from "@/lib/db";
import { monthLabel } from "@/lib/format-date";
import { defaultClosePeriod } from "@/lib/monthly-close";
import { loadCloseRows } from "@/lib/monthly-close-loader";
import { buildMonthlySnapshot, loadCircuitReport, sameSnapshot, type SavingsReportSnapshot } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/report-data";
import { MonthlySavingsSheet } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/monthly-sheet";
import { requireBillingReader } from "../../../access";
import { validPeriod } from "../../close-ui";
import { PublishMonthButton } from "./publish-month-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Savings report — monthly close" };

/**
 * Step 1: the month's savings report, one sheet per circuit, exactly as the
 * society will see it (2026-11-18). Publishing goes through each circuit's
 * own publish — a frozen snapshot, versioned, the earlier one kept.
 */
export default async function CloseReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ societyId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const { societyId } = await params;
  const period = validPeriod((await searchParams).period, defaultClosePeriod());
  const [row] = await loadCloseRows(period, societyId);
  if (!row) notFound();

  const sheets = await Promise.all(
    row.circuits.map(async (c) => {
      const report = await loadCircuitReport(c.id);
      if (!report) return null;
      const snapshot = await buildMonthlySnapshot(report, period);
      const latest = c.publishedId
        ? await db.publishedSavingsReport.findUnique({ where: { id: c.publishedId }, select: { snapshot: true, version: true } })
        : null;
      const upToDate = latest ? sameSnapshot(latest.snapshot as unknown as SavingsReportSnapshot, snapshot) : false;
      return { circuit: c, snapshot, publishedVersion: latest?.version ?? null, upToDate };
    }),
  );
  const list = sheets.filter((s): s is NonNullable<typeof s> => s !== null);
  const toPublish = list.filter((s) => !s.upToDate).length;
  const canPublish = gate.actor.permissions.includes("manage_pipeline");
  const back = `/admin/billing/close/${societyId}?period=${period}`;

  return (
    <>
      <PageHeader
        backHref={back}
        title="Savings report"
        subtitle={`${row.name} · ${monthLabel(period)} · step 1 of 3`}
        chip={toPublish === 0 && list.length > 0 ? <StatusChip tone="ok">Published</StatusChip> : <StatusChip tone="info">To review</StatusChip>}
        action={
          list.length > 0 ? (
            <PublishMonthButton
              societyId={societyId}
              period={period}
              societyName={row.name}
              toPublish={toPublish}
              total={list.length}
              canPublish={canPublish}
              backHref={back}
            />
          ) : undefined
        }
      />

      {list.length === 0 ? (
        <p className="card p-5 text-[var(--text-muted)]">No circuit has readings for {monthLabel(period)}, so there is no report to publish.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {list.map((s) => (
            <section key={s.circuit.id} aria-label={`${s.circuit.label} report`}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-[15px] font-bold">{s.circuit.label}</h2>
                {s.upToDate ? (
                  <StatusChip tone="ok">Published · v{s.publishedVersion}</StatusChip>
                ) : s.publishedVersion ? (
                  <StatusChip tone="warn">Changed since v{s.publishedVersion} — publishing makes v{s.publishedVersion + 1}</StatusChip>
                ) : (
                  <StatusChip tone="info">Not published</StatusChip>
                )}
              </div>
              <div className="mx-auto max-w-[900px]">
                <MonthlySavingsSheet s={s.snapshot} />
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
