import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { PIPELINE_STAGE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { ProposalForm } from "./proposal-form";
import { ApproveLeadButton } from "./approve-lead-button";
import { requireAdminPage } from "@/lib/admin-permissions";
import { dealProgress } from "@/lib/deal-progress";
import { DealStepper, NextStepCallout } from "@/components/deal-stepper";

const OUTCOME_LABEL: Record<string, string> = {
  agreed: "Agreed — advanced to survey",
  undecided: "Undecided — still following up",
  declined: "Declined",
};

export default async function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      salesOwner: true,
      loggedBy: true,
      siteSurvey: { include: { areas: { select: { id: true } } } },
      demoReports: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
      kycRequirements: { select: { status: true } },
      offers: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
      contract: { select: { status: true } },
      installationProject: { select: { state: true, certificate: { select: { id: true } } } },
    },
  });
  if (!pipeline) notFound();

  const candidates = pipeline.siteSurvey
    ? await db.circuit.findMany({
        where: { siteSurveyId: pipeline.siteSurvey.id, voidedAt: null },
        select: { id: true, state: true, location: true, lightType: true },
      })
    : [];

  const stage = statusMeta(PIPELINE_STAGE, pipeline.stage);

  // The sequencing decision lives in one pure module, not scattered across
  // conditionals here — see src/lib/deal-progress.ts.
  const progress = dealProgress({
    pipelineId: pipeline.id,
    societyId: pipeline.societyId,
    stage: pipeline.stage,
    authoritative: pipeline.authoritative,
    demoSkipped: pipeline.demoSkipped,
    surveyExists: !!pipeline.siteSurvey,
    areaCount: pipeline.siteSurvey?.areas.length ?? 0,
    candidates,
    reportStatus: pipeline.demoReports[0]?.status ?? null,
    kyc: {
      total: pipeline.kycRequirements.length,
      resolved: pipeline.kycRequirements.filter(
        (k) => k.status === "verified" || k.status === "not_applicable",
      ).length,
    },
    offerStatus: pipeline.offers[0]?.status ?? null,
    contractStatus: pipeline.contract?.status ?? null,
    installationState: pipeline.installationProject?.state ?? null,
    certificateSigned: !!pipeline.installationProject?.certificate,
  });

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/admin/pipeline" className="hover:underline">
            Leads &amp; pipeline
          </Link>
        }
        title={pipeline.society.name}
        chip={<StatusChip tone={stage.tone}>{stage.label}</StatusChip>}
        subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · ${pipeline.society.location}`}
      />

      {!pipeline.authoritative && (
        <div
          className="max-w-xl mb-6 rounded-[var(--r-md)] border p-4 text-sm"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          <p>
            Logged by {pipeline.loggedBy.name ?? pipeline.loggedBy.email} on{" "}
            {pipeline.salesOwner.name ?? pipeline.salesOwner.email}&apos;s behalf — pending their approval. It
            can&apos;t advance until they approve it.
          </p>
          {session.user.id === pipeline.salesOwnerId && (
            <div className="mt-3">
              <ApproveLeadButton pipelineId={pipeline.id} />
            </div>
          )}
        </div>
      )}

      {/* The one thing the operator came here to learn: what to do now. */}
      {progress.next && <NextStepCallout next={progress.next} />}

      {/* The lead stage's own workspace lives on this page, so it renders
          right under the callout that points at it. */}
      {pipeline.stage === "lead" && pipeline.authoritative && (
        <div className="mb-8">
          <ProposalForm pipelineId={pipeline.id} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,22rem)] items-start mb-6">
        {/* The deal's map — every stage in spine order, exactly one current,
            locked stages unlinked and saying what unlocks them. This
            replaces the old row of six identical buttons. */}
        <Card className="p-6">
          <CardTitle>Deal progress</CardTitle>
          <DealStepper steps={progress.steps} />
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <CardTitle>Lead details</CardTitle>
            <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Contact</dt>
            <dd>
              {pipeline.contactName}
              {pipeline.contactPhone ? ` · ${pipeline.contactPhone}` : ""}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Meeting date</dt>
            <dd className="num">{pipeline.meetingDate.toISOString().slice(0, 10)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Owner</dt>
            <dd>{pipeline.salesOwner.name ?? pipeline.salesOwner.email}</dd>
          </div>
          {pipeline.notes && (
            <div>
              <dt className="text-[var(--text-muted)] mb-1">Notes</dt>
              <dd>{pipeline.notes}</dd>
            </div>
          )}
            </dl>
          </Card>

          {/* the recorded proposal, once one exists — previously the outcome
              vanished from the UI the moment the stage moved on */}
          {pipeline.proposalOutcome && (
            <Card className="p-6">
              <CardTitle>Demo proposal</CardTitle>
              <p className="text-sm font-medium mb-1">
                {OUTCOME_LABEL[pipeline.proposalOutcome] ?? pipeline.proposalOutcome}
              </p>
              {pipeline.proposalDecidedAt && (
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  Decided {pipeline.proposalDecidedAt.toISOString().slice(0, 10)}
                </p>
              )}
              {pipeline.proposalSummary && (
                <p className="text-sm text-[var(--text-muted)]">{pipeline.proposalSummary}</p>
              )}
              {pipeline.closedLostReason && (
                <p className="text-sm mt-2" style={{ color: "var(--bad-fg)" }}>
                  {pipeline.closedLostReason}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
