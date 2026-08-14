import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { PIPELINE_STAGE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { ProposalForm } from "./proposal-form";
import { ApproveLeadButton } from "./approve-lead-button";
import { requireAdminPage } from "@/lib/admin-permissions";

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
    include: { society: true, salesOwner: true, loggedBy: true, siteSurvey: true },
  });
  if (!pipeline) notFound();

  const stage = statusMeta(PIPELINE_STAGE, pipeline.stage);

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

      <Card className="max-w-xl p-6 mb-6">
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
        <Card className="max-w-xl p-6 mb-6">
          <CardTitle>Demo proposal</CardTitle>
          <p className="text-sm font-medium mb-1">{OUTCOME_LABEL[pipeline.proposalOutcome] ?? pipeline.proposalOutcome}</p>
          {pipeline.proposalDecidedAt && (
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Decided {pipeline.proposalDecidedAt.toISOString().slice(0, 10)}
            </p>
          )}
          {pipeline.proposalSummary && <p className="text-sm text-[var(--text-muted)]">{pipeline.proposalSummary}</p>}
          {pipeline.closedLostReason && (
            <p className="text-sm mt-2" style={{ color: "var(--bad-fg)" }}>
              {pipeline.closedLostReason}
            </p>
          )}
        </Card>
      )}

      {pipeline.stage === "lead" && pipeline.authoritative && <ProposalForm pipelineId={pipeline.id} />}

      {/* The deal's stages, always all visible rather than only the current
          one: the work is not strictly sequential in practice (KYC is
          collected alongside the demo), and hiding a stage until its
          predecessor completes is how a chase-able task goes unnoticed. */}
      <div className="flex flex-wrap gap-3">
        {pipeline.siteSurvey && (
          <Link href={`/admin/pipeline/${pipeline.id}/survey`} className="btn-primary">
            Site survey →
          </Link>
        )}
        <Link href={`/admin/pipeline/${pipeline.id}/report`} className="btn-secondary">
          Demo report →
        </Link>
        <Link href={`/admin/pipeline/${pipeline.id}/kyc`} className="btn-secondary">
          KYC documents →
        </Link>
        <Link href={`/admin/pipeline/${pipeline.id}/offer`} className="btn-secondary">
          Offer →
        </Link>
        <Link href={`/admin/pipeline/${pipeline.id}/agreement`} className="btn-secondary">
          Agreement &amp; contract →
        </Link>
      </div>
    </>
  );
}
