import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { DEMO_REPORT_STATUS, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { DemoReportView } from "@/components/demo-report-view";
import { BLOCKER_MESSAGE, buildDemoReport } from "@/lib/demo-report";
import { collectDemoReportInput } from "./actions";
import { GenerateReportButton, ShareReportButton } from "./report-actions-client";

export default async function DemoReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");
  const canEdit =
    session.user.adminPermissions.includes("manage_survey") &&
    session.user.adminPermissions.includes("manage_pipeline");

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: { society: true, demoReports: { orderBy: { version: "desc" }, include: { sharedBy: true } } },
  });
  if (!pipeline) notFound();

  const latest = pipeline.demoReports[0] ?? null;
  const superseded = pipeline.demoReports.slice(1);

  // FEAT-020-AC-3 — when there is no report, say precisely which input is
  // missing rather than leaving PER-01 with a silently absent document.
  let blockerMessage: string | null = null;
  const collected = await collectDemoReportInput(id);
  if (collected) {
    const attempt = buildDemoReport({
      circuits: collected.circuits,
      societyLightCount: collected.societyLightCount,
    });
    if (!attempt.ok) blockerMessage = BLOCKER_MESSAGE[attempt.blocker];
  }

  const status = latest ? statusMeta(DEMO_REPORT_STATUS, latest.status) : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/pipeline/${pipeline.id}`} className="hover:underline">
            {pipeline.society.name}
          </Link>
        }
        title="Demo savings report"
        chip={status ? <StatusChip tone={status.tone}>{status.label}</StatusChip> : undefined}
        subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · measured on the demo circuits, extrapolated society-wide (CON-11)`}
      />

      {!latest ? (
        // FEAT-020-AC-2 — "no demo report", not an empty document shell.
        <div className="max-w-none space-y-4">
          <EmptyState title="No demo report yet">
            {blockerMessage ??
              "The report generates itself once every demo circuit reaches a confirmed benchmark."}
          </EmptyState>
          {canEdit && !blockerMessage && (
            <GenerateReportButton pipelineId={pipeline.id} label="Generate the demo report" />
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div>
                <CardTitle>Version {latest.version}</CardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Generated {latest.generatedAt.toISOString().slice(0, 10)}
                  {latest.sharedAt && (
                    <>
                      {" "}
                      · shared {latest.sharedAt.toISOString().slice(0, 10)} by{" "}
                      {latest.sharedBy?.name ?? latest.sharedBy?.email ?? "—"}
                    </>
                  )}
                </p>
              </div>
              {canEdit && latest.status === "draft" && (
                <ShareReportButton pipelineId={pipeline.id} reportId={latest.id} />
              )}
            </div>
            {latest.status === "draft" && (
              <p className="text-sm mt-3 text-[var(--text-muted)]">
                Draft — internal only. The society sees nothing until it is shared.
              </p>
            )}
          </Card>

          <DemoReportView report={latest} />

          {/* FEAT-020-AC-5 — a regenerated report never overwrites the one
              a society was already shown; earlier versions stay retrievable. */}
          {superseded.length > 0 && (
            <Card className="p-5">
              <CardTitle>Earlier versions</CardTitle>
              <ul className="mt-3 text-sm space-y-1">
                {superseded.map((r) => (
                  <li key={r.id} className="text-[var(--text-muted)]">
                    <span className="num">v{r.version}</span> ·{" "}
                    <span className="num">{r.measuredSavingsPct.toFixed(2)}%</span> measured ·{" "}
                    generated {r.generatedAt.toISOString().slice(0, 10)}
                    {r.sharedAt ? " · was shared" : ""}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {canEdit && (
            <div className="pt-2">
              <GenerateReportButton pipelineId={pipeline.id} label="Regenerate as a new version" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
