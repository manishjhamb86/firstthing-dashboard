import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader, Stat, StatRow } from "@/components/ui";
import { monthLabel } from "@/lib/format-date";
import { defaultClosePeriod } from "@/lib/monthly-close";
import { loadCloseRows } from "@/lib/monthly-close-loader";
import { requireBillingReader } from "../access";
import { MonthPicker, recentMonths, validPeriod } from "./close-ui";
import { CloseTable } from "./close-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly close" };

/**
 * The monthly close desk (2026-11-18, user-specified): every billing society
 * for one month, with where its savings report, bill and email stand, and
 * the next step for each. Opening a society walks the three steps in order.
 */
export default async function MonthlyClosePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const latest = defaultClosePeriod();
  const { period: raw } = await searchParams;
  const period = validPeriod(raw, latest);
  const rows = await loadCloseRows(period);
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;

  return (
    <>
      <PageHeader
        title={`${monthLabel(period)} close`}
        subtitle="For each society: publish the savings report, release the bill, then email both."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <MonthPicker period={period} months={recentMonths(latest)} basePath="/admin/billing/close" />
            <Link href="/admin/settings/monthly-email" className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              Email template
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No society is billing yet">A society appears here once its billing has started.</EmptyState>
      ) : (
        <>
          <StatRow>
            <Stat label="Savings reports published" value={`${count((r) => r.report === "published")} of ${count((r) => r.report !== "none")}`} />
            <Stat label="Bills released" value={`${count((r) => r.bill === "released")} of ${rows.length}`} />
            <Stat label="Emailed to society" value={`${count((r) => r.emailedAt !== null)} of ${rows.length}`} />
            <Stat label="Bills not yet fetched" value={count((r) => r.bill === "not_fetched")} tone={count((r) => r.bill === "not_fetched") > 0 ? "warn" : undefined} />
          </StatRow>
          <CloseTable
            period={period}
            rows={rows.map((r) => ({
              societyId: r.societyId,
              name: r.name,
              location: r.location,
              report: r.report,
              reportsPublished: r.circuits.filter((c) => c.publishedId).length,
              reportsTotal: r.circuits.length,
              bill: r.bill,
              invoiceNumber: r.invoice?.number ?? null,
              invoiceAmount: r.invoice?.amount ?? null,
              emailedAt: r.emailedAt?.toISOString() ?? null,
              emailReady: r.emailReady,
              stage: r.stage,
            }))}
          />
        </>
      )}
    </>
  );
}
