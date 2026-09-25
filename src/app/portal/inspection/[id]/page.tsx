import { Letterhead } from "@/components/letterhead";
import { monthLabel } from "@/lib/format-date";
import { reportTitle } from "@/lib/report-title";
import { notFound, redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { db } from "@/lib/db";
import { formatDate, shortDate } from "@/lib/format-date";
import { StatusChip } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { publicS3Url } from "@/lib/s3";
import { inspectionSummary, SENSOR_STATUS_META } from "@/lib/inspection";
import { PrintInspectionButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * A downloadable, printable record of one inspection (user-asked
 * 2026-09-24, from the portal's own "Latest inspection" card) — the same
 * print-then-"Save as PDF" pattern already used for the circuit's savings
 * reports (`report-shared.tsx`'s `PrintButton`), not a new PDF-generation
 * dependency. INV-05 scoped by the viewer's own societyId in the query, the
 * same as every other portal detail page.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  // Scoped to the viewer's own society, like the page (INV-05).
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { title: "FirsThing" };
  const { id } = await params;
  const i = await db.inspection.findFirst({ where: { id, societyId: viewer.societyId, voidedAt: null }, select: { period: true, society: { select: { name: true } } } });
  return { title: reportTitle("Inspection report", i?.society.name, i ? monthLabel(i.period) : null) };
}

export default async function PortalInspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "documents")) redirect("/portal");
  const { id } = await params;

  const inspection = await db.inspection.findFirst({
    where: { id, societyId: viewer.societyId, voidedAt: null, totalLightsChecked: { not: null } },
    include: {
      society: { select: { name: true, location: true } },
      findings: { orderBy: { srNo: "asc" } },
    },
  });
  if (!inspection) notFound();

  const summary = inspectionSummary({
    totalLightsChecked: inspection.totalLightsChecked!,
    findingsCount: inspection.findings.length,
  });
  const generated = shortDate(new Date());

  return (
    <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <BackButton fallbackHref="/portal/documents" />
        <div className="flex-1" />
        <PrintInspectionButton />
      </div>

      <Letterhead>
      <article className="report-sheet">
        <header className="report-masthead">
          <div className="min-w-0 flex-1">
            <p className="lbl" style={{ color: "var(--accent)" }}>
              FirsThing · Inspection report
            </p>
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{inspection.society.name}</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
              {inspection.society.location}
              <br />
              {inspection.area || "Whole society"}
            </p>
          </div>
          <div className="report-period">
            <p className="text-[20px] font-bold tracking-[-0.01em]">{formatDate(inspection.inspectedAt)}</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Generated <span className="num">{generated}</span>
            </p>
          </div>
        </header>

        <section className="report-result">
          <div className="shrink-0">
            <p className="lbl" style={{ color: "var(--info-fg)" }}>
              Fixtures checked
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
              <span className="num text-[46px] font-bold leading-none tracking-[-0.02em]">{summary.totalLightsChecked}</span>
              {summary.faultyLightsCount === 0 ? (
                <StatusChip tone="ok">None faulty</StatusChip>
              ) : (
                <StatusChip tone="warn">{summary.faultyLightsCount} faulty</StatusChip>
              )}
            </p>
          </div>
          <p className="min-w-0 flex-1 basis-64 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
            Inspected by <strong className="text-[var(--text)]">{inspection.inspectorName}</strong> on{" "}
            <strong className="text-[var(--text)]">{formatDate(inspection.inspectedAt)}</strong>
            {inspection.societyRepName && (
              <>
                , with <strong className="text-[var(--text)]">{inspection.societyRepName}</strong> representing the society
              </>
            )}
            . {summary.faultyLightsCount} of {summary.totalLightsChecked} fixtures checked (
            {summary.faultyPct.toFixed(1)}%) needed attention — every healthy fixture is counted in the
            total but is not listed below; only what was found faulty or notable has its own row.
          </p>
        </section>

        <section className="report-facts">
          <div>
            <p className="lbl">Area</p>
            <p className="mt-1.5 text-[15px] font-bold">{inspection.area || "Whole society"}</p>
          </div>
          <div>
            <p className="lbl">Month</p>
            <p className="mt-1.5 text-[15px] font-bold">{inspection.period}</p>
          </div>
          <div>
            <p className="lbl">Inspector</p>
            <p className="mt-1.5 text-[15px] font-bold">{inspection.inspectorName}</p>
          </div>
          <div>
            <p className="lbl">Society representative</p>
            <p className="mt-1.5 text-[15px] font-bold">{inspection.societyRepName ?? "—"}</p>
          </div>
        </section>

        <section className="px-8 pb-8 pt-7">
          <h2 className="mb-3.5 text-[15px] font-semibold">Faulty &amp; notable fixtures</h2>
          {inspection.findings.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Every fixture checked was in working order — nothing to list.
            </p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {inspection.findings.map((f) => {
                  const meta = SENSOR_STATUS_META[f.sensorStatus];
                  return (
                    <tr key={f.id}>
                      <td className="num">{f.srNo}</td>
                      <td>{f.location}</td>
                      <td>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      </td>
                      <td>{[f.actionReplace ? "To be replaced" : null, f.remarks].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {inspection.notes && (
            <p className="mt-4 text-[13.5px] leading-relaxed">
              <strong>Notes.</strong> {inspection.notes}
            </p>
          )}

          {inspection.evidencePhotoKey && (
            <p className="mt-4 text-xs no-print">
              <a
                href={publicS3Url(inspection.evidencePhotoKey)}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
                style={{ color: "var(--accent)" }}
              >
                View the signed checklist photo
              </a>
            </p>
          )}
        </section>

        <footer className="report-footer">
          <span>FirsThing · a physical walk-through of the society&rsquo;s lighting, filed on record.</span>
          <span className="num report-colophon">
            {inspection.society.name} · {inspection.area || "Whole society"} · {inspection.period}
          </span>
        </footer>
      </article>
      </Letterhead>
    </div>
  );
}
