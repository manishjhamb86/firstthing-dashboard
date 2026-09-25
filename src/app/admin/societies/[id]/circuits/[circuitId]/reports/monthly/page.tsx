import Link from "next/link";
import { monthLabel } from "@/lib/format-date";
import { resolveAdmin } from "@/lib/admin-permissions";
import { reportTitle } from "@/lib/report-title";
import { monthShort } from "@/lib/format-date";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { db } from "@/lib/db";
import { buildMonthlySnapshot, loadCircuitReport, monthsWithData } from "../report-data";
import { MonthlySavingsSheet } from "../monthly-sheet";
import { PublishReportButton } from "./publish-button";
import { PrintButton } from "../report-shared";
import { BackButton } from "@/components/back-button";


// CON-45 — the monthly savings report for one explicitly-selected month
// (INV-04: the month is a selection, never inferred). Circuit-scoped, and
// the kWh/day figures here are computed from stored readings the same way
// the whole report always has been. The rupee figure (user-asked
// 2026-09-24) is the one exception, and it is read, never computed: it
// comes only from a RELEASED calculation's own fee line
// (`circuitFeeLineFor`), which this report never duplicates the arithmetic
// of — two independently-computed money figures for one month is how they
// end up disagreeing.

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; circuitId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  if (!(await resolveAdmin())) return { title: "FirsThing" };
  const { id, circuitId } = await params;
  const { month: monthParam } = await searchParams;
  const report = await loadCircuitReport(circuitId);
  if (!report || report.society.id !== id) return { title: "FirsThing" };
  const months = monthsWithData(report);
  const month = monthParam && months.includes(monthParam) ? monthParam : months[months.length - 1];
  return { title: reportTitle("Monthly savings report", report.society.name, month ? monthLabel(month) : null) };
}

export default async function MonthlyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; circuitId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  if (!perms.includes("manage_survey") && !perms.includes("manage_pipeline")) redirect("/admin");

  const { id, circuitId } = await params;
  const { month: monthParam } = await searchParams;
  const report = await loadCircuitReport(circuitId);
  if (!report || report.society.id !== id) notFound();
  const { circuit, society } = report;
  const circuitHref = `/admin/societies/${id}/circuits/${circuitId}`;

  const months = monthsWithData(report);
  // A circuit with no monitoring month yet is not a missing page — it is a
  // page with nothing to report. notFound() here was a dead end of exactly
  // the kind this codebase has already fixed twice: the reader is told the
  // URL is wrong when the truth is that billing has not started.
  if (months.length === 0) {
    return (
      <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
        <div className="no-print mb-5">
          <BackButton fallbackHref={circuitHref} />
        </div>
        <article className="report-sheet">
          <header className="report-masthead">
            <div className="min-w-0 flex-1">
              <p className="lbl" style={{ color: "var(--accent)" }}>
                FirsThing · Monthly savings report
              </p>
              <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
                {society.name}
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                {society.location}
                <br />
                {circuit.location || circuit.lightType} circuit
              </p>
            </div>
          </header>
          <div className="px-8 py-7">
            <p className="text-sm">
              No monitoring month has been recorded for this circuit yet. Monthly readings start
              after the installation is signed off — billing begins the day after the completion
              certificate, so there is nothing to report against until then.
            </p>
            <p className="mt-4 text-sm no-print">
              <Link href={circuitHref} className="underline">
                Open the circuit&apos;s setup &amp; history →
              </Link>
            </p>
          </div>
        </article>
      </div>
    );
  }
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) && months.includes(monthParam)
      ? monthParam
      : months[months.length - 1];

  const snapshot = await buildMonthlySnapshot(report, month);
  const published = await db.publishedSavingsReport.findFirst({
    where: { circuitId, period: month, voidedAt: null },
    orderBy: { version: "desc" },
    select: { id: true, version: true, publishedAt: true },
  });
  const shortMonth = monthShort;
  // Two Februaries in one picker have to be told apart, so the year appears
  // only when the months actually span more than one.
  const multiYear = new Set(months.map((m) => m.slice(0, 4))).size > 1;

  return (
    <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
      {/* One toolbar. Back, the month, and the one action — a printed page
          never carries any of it (.no-print). */}
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref={circuitHref} />
        <div className="flex-1" />
        {months.length > 1 && (
          <>
            <span className="lbl" style={{ display: "inline" }}>
              Month
            </span>
            <nav className="seg" aria-label="Report month">
              {months.map((m) => (
                <Link
                  key={m}
                  href={`?month=${m}`}
                  className={m === month ? "on" : undefined}
                  aria-current={m === month ? "page" : undefined}
                >
                  {multiYear ? `${shortMonth(m)} ${m.slice(2, 4)}` : shortMonth(m)}
                </Link>
              ))}
            </nav>
          </>
        )}
        <PublishReportButton
          circuitId={circuitId}
          month={month}
          publishedId={published?.id ?? null}
          publishedVersion={published?.version ?? null}
          publishedAt={published?.publishedAt.toISOString() ?? null}
          hasFee={snapshot.fee !== null}
        />
        <PrintButton />
      </div>

      <MonthlySavingsSheet s={snapshot} />
    </div>
  );
}
