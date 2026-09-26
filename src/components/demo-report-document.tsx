import { Letterhead } from "@/components/letterhead";
import { DemoReportView } from "@/components/demo-report-view";
import { formatDate } from "@/lib/format-date";
import { dealLabel } from "@/lib/deal-scope";

type Report = Parameters<typeof DemoReportView>[0]["report"] & {
  version: number;
  status: string;
  sharedAt: Date | null;
  generatedAt: Date;
  pipeline: {
    serviceLine: Parameters<typeof dealLabel>[0];
    dealScope: string | null;
    society: { name: string; location: string | null };
  };
};

/**
 * A demo savings report as the printed document: the letterhead, the
 * masthead and the report. One component for the society's portal and the
 * back office alike (2026-09-26, user-asked: the back office had no way to
 * print it), so the two printouts are the same document.
 */
export function DemoReportDocument({ report }: { report: Report }) {
  return (
    <Letterhead>
      <article className="report-sheet">
        <header className="report-masthead">
          <div className="min-w-0 flex-1">
            <p className="lbl" style={{ color: "var(--accent)" }}>
              FirsThing · Demo savings report
            </p>
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
              {report.pipeline.society.name}
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
              {report.pipeline.society.location}
              <br />
              {dealLabel(report.pipeline.serviceLine, report.pipeline.dealScope)} · measured on the demo circuits,
              extrapolated society-wide
            </p>
          </div>
          <div className="report-period">
            <p className="text-[20px] font-bold tracking-[-0.01em]">Version {report.version}</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              {report.status === "shared" ? (
                <>
                  Shared <span className="num">{formatDate(report.sharedAt ?? report.generatedAt)}</span>
                </>
              ) : (
                <>
                  Draft — generated <span className="num">{formatDate(report.generatedAt)}</span>
                </>
              )}
            </p>
          </div>
        </header>
        <div className="px-6 pb-8 pt-6 sm:px-8 print:px-0 print:pb-0 print:pt-3">
          <DemoReportView report={report} />
        </div>
      </article>
    </Letterhead>
  );
}
