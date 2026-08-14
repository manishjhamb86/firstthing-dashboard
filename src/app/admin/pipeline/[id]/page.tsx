import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../../admin-nav";
import { ProposalForm } from "./proposal-form";

const SERVICE_LINE_LABEL: Record<string, string> = {
  lighting: "Lighting",
  pumps: "Water pumps",
  solar: "Solar",
  wastewater: "Wastewater",
};

const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  survey_pending: "Survey pending",
  closed_lost: "Closed / lost",
};

export default async function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: { society: true, salesOwner: true, loggedBy: true, siteSurvey: true },
  });
  if (!pipeline) notFound();

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-1">
        <h1 className="text-2xl font-bold">{pipeline.society.name}</h1>
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
          {STAGE_LABEL[pipeline.stage]}
        </span>
      </div>
      <p className="mb-8 text-[var(--text-muted)]">
        {SERVICE_LINE_LABEL[pipeline.serviceLine]} · {pipeline.society.location}
      </p>

      {!pipeline.authoritative && (
        <div
          className="max-w-xl mb-6 rounded-[var(--r-md)] border p-4 text-sm"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          Logged by {pipeline.loggedBy.name ?? pipeline.loggedBy.email} on {pipeline.salesOwner.name ?? pipeline.salesOwner.email}
          &apos;s behalf — pending their approval before it&apos;s authoritative.
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6 max-w-xl mb-6">
        <p className="text-sm mb-4 text-[var(--text-muted)]">Lead details</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Contact</dt>
            <dd>
              {pipeline.contactName}
              {pipeline.contactPhone ? ` · ${pipeline.contactPhone}` : ""}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Meeting date</dt>
            <dd>{pipeline.meetingDate.toISOString().slice(0, 10)}</dd>
          </div>
          <div className="flex justify-between">
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
      </div>

      {pipeline.stage === "lead" && <ProposalForm pipelineId={pipeline.id} />}

      {pipeline.stage === "closed_lost" && (
        <div
          className="max-w-xl rounded-[var(--r-md)] border p-4 text-sm"
          style={{ borderColor: "var(--bad-fg)", background: "var(--bad-bg)", color: "var(--bad-fg)" }}
        >
          Closed / lost — {pipeline.closedLostReason}
        </div>
      )}

      {pipeline.stage === "survey_pending" && pipeline.siteSurvey && (
        <Link
          href={`/admin/pipeline/${pipeline.id}/survey`}
          className="inline-block bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] rounded-[var(--r-md)] px-4 py-2 text-sm font-semibold transition-colors"
        >
          Open site survey →
        </Link>
      )}
    </div>
  );
}
