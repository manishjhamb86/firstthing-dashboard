import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { PIPELINE_STAGE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { requireAdminPage } from "@/lib/admin-permissions";

// FEAT-001-AC-3: an empty state explains how to log the first lead.
//
// Still deliberately NOT FEAT-004's filterable/sortable pipeline board —
// that feature is un-milestoned and stays unbuilt rather than being smuggled
// in under a design pass. What changed in the page-by-page pass
// (2026-08-17) is presentation only: the flat list is grouped by stage in
// deal-spine order, so the page reads as a pipeline rather than as rows in
// arrival order, and each row carries the location, the deal's age, and
// whether it is still waiting on its owner's approval.

const STAGE_ORDER = [
  "lead",
  "survey_pending",
  "demo_reported",
  "offered",
  "agreed",
  "installation",
  "active_billing",
  "closed_lost",
] as const;

function ageInDays(from: Date) {
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / 86_400_000));
}

export default async function PipelinePage() {
  const session = await requireAdminPage();

  const canManagePipeline = session.user.adminPermissions?.includes("manage_pipeline") ?? false;

  const pipelines = canManagePipeline
    ? await db.pipeline.findMany({
        orderBy: { createdAt: "desc" },
        include: { society: true, salesOwner: true },
      })
    : [];

  // Group in spine order; a stage with no deals simply doesn't appear.
  const grouped = STAGE_ORDER.map((stage) => ({
    stage,
    deals: pipelines.filter((p) => p.stage === stage),
  })).filter((g) => g.deals.length > 0);

  const pendingApproval = pipelines.filter((p) => !p.authoritative).length;
  const preSurvey = pipelines.filter((p) => ["lead", "demo_proposed", "survey_pending"].includes(p.stage)).length;
  const billing = pipelines.filter((p) => p.stage === "active_billing").length;

  return (
    <>
      <PageHeader
        title="Leads &amp; pipeline"
        subtitle="Every open deal, grouped by stage."
        action={
          canManagePipeline && (
            <Link href="/admin/pipeline/new" className="btn-primary">
              Log a lead
            </Link>
          )
        }
      />

      {/* The figures used to be a run-on subtitle; they are tiles like every
          other page's, so the row below them starts at the same y. */}
      {canManagePipeline && (
        <StatRow>
          <Stat label="Deals on record" value={pipelines.length} detail={`${grouped.length} stage${grouped.length === 1 ? "" : "s"} in play`} />
          <Stat label="Awaiting approval" value={pendingApproval} detail={pendingApproval === 0 ? "none held" : "owner has not confirmed"} />
          <Stat label="Before survey" value={preSurvey} detail="lead through proposal" />
          <Stat label="Billing" value={billing} detail="installed and invoicing" />
        </StatRow>
      )}

      {!canManagePipeline ? (
        <p className="max-w-xl text-[var(--text-muted)]">
          You don&apos;t have the <code>manage_pipeline</code> permission, so the sales pipeline isn&apos;t
          available to you.
        </p>
      ) : pipelines.length === 0 ? (
        <EmptyState
          title="No leads yet"
          action={
            <Link href="/admin/pipeline/new" className="btn-ghost btn-sm">
              Log a lead →
            </Link>
          }
        >
          Log the first one after a first meeting with a prospective society.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Service line</th>
                <th>Contact</th>
                <th>Owner</th>
                <th>Age</th>
              </tr>
            </thead>
            {grouped.map(({ stage, deals }) => {
              const meta = statusMeta(PIPELINE_STAGE, stage);
              return (
                <tbody key={stage}>
                  {/* A stage band, so the table reads as a pipeline rather
                      than as one undifferentiated list. */}
                  <tr>
                    <th
                      colSpan={5}
                      className="text-left"
                      style={{ background: "var(--surface-sunken)", borderBottom: "1px solid var(--border)" }}
                    >
                      <span className="inline-flex items-center gap-2">
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                        <span className="num text-[var(--text-muted)]">{deals.length}</span>
                      </span>
                    </th>
                  </tr>
                  {deals.map((p) => {
                    const age = ageInDays(p.createdAt);
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[13px] font-bold"
                              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                            >
                              {p.society.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/pipeline/${p.id}`}
                                className="font-medium hover:underline"
                              >
                                {p.society.name}
                              </Link>
                              <p className="text-[13px] text-[var(--text-muted)]">{p.society.location}</p>
                            </div>
                            {!p.authoritative && (
                              <StatusChip tone="warn">Pending approval</StatusChip>
                            )}
                          </div>
                        </td>
                        <td className="text-[var(--text-muted)]">{SERVICE_LINE_LABEL[p.serviceLine]}</td>
                        <td className="text-[var(--text-muted)]">{p.contactName}</td>
                        <td className="text-[var(--text-muted)]">
                          {p.salesOwner.name ?? p.salesOwner.email}
                        </td>
                        {/* How long this deal has been on the books — the
                            column a pipeline is actually judged by. */}
                        <td className="num whitespace-nowrap text-[var(--text-muted)]">
                          {age === 0 ? "today" : `${age}d`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </Card>
      )}
    </>
  );
}
