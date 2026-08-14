import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { PIPELINE_STAGE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";

// FEAT-001-AC-3: an empty state explains how to log the first lead. This is
// a minimal list, not FEAT-004's own filterable/sortable pipeline view
// (FEAT-004 is un-milestoned — out of MS-03's scope, documented honestly
// rather than silently built here).
export default async function PipelinePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const canManagePipeline = session.user.adminPermissions?.includes("manage_pipeline") ?? false;

  const pipelines = canManagePipeline
    ? await db.pipeline.findMany({
        orderBy: { createdAt: "desc" },
        include: { society: true, salesOwner: true },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Leads & pipeline"
        subtitle="Every open deal, newest first."
        action={
          canManagePipeline && (
            <Link href="/admin/pipeline/new" className="btn-primary">
              Log a lead
            </Link>
          )
        }
      />

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
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => {
                const stage = statusMeta(PIPELINE_STAGE, p.stage);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/pipeline/${p.id}`} className="font-medium hover:underline">
                        {p.society.name}
                      </Link>
                      {!p.authoritative && (
                        <span className="ml-2 align-middle">
                          <StatusChip tone="warn">Pending approval</StatusChip>
                        </span>
                      )}
                    </td>
                    <td className="text-[var(--text-muted)]">{SERVICE_LINE_LABEL[p.serviceLine]}</td>
                    <td className="text-[var(--text-muted)]">{p.contactName}</td>
                    <td className="text-[var(--text-muted)]">{p.salesOwner.name ?? p.salesOwner.email}</td>
                    <td>
                      <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
