import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../admin-nav";

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
    <div className="min-h-screen p-10">
      <AdminNav />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-8">
        <h1 className="text-2xl font-bold">Leads &amp; pipeline</h1>
        {canManagePipeline && (
          <Link
            href="/admin/pipeline/new"
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] rounded-[var(--r-md)] px-4 py-2 text-sm font-semibold transition-colors"
          >
            Log a lead
          </Link>
        )}
      </div>

      {!canManagePipeline ? (
        <p className="max-w-xl text-[var(--text-muted)]">
          You don&apos;t have the <code>manage_pipeline</code> permission, so the sales pipeline isn&apos;t
          available to you.
        </p>
      ) : pipelines.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-10 text-center max-w-xl">
          <p className="font-semibold mb-1">No leads yet</p>
          <p className="text-sm mb-4 text-[var(--text-muted)]">
            Log the first one after a first meeting with a prospective society.
          </p>
          <Link href="/admin/pipeline/new" className="text-[var(--accent)] font-semibold text-sm">
            Log a lead →
          </Link>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] max-w-3xl divide-y divide-[var(--border-subtle)]">
          {pipelines.map((p) => (
            <Link
              key={p.id}
              href={`/admin/pipeline/${p.id}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 hover:bg-[var(--surface-hover)]"
            >
              <div>
                <p className="font-medium">
                  {p.society.name}{" "}
                  {!p.authoritative && (
                    <span
                      className="text-xs font-semibold uppercase tracking-wide ml-1"
                      style={{ color: "var(--warn-fg)" }}
                    >
                      Pending approval
                    </span>
                  )}
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {SERVICE_LINE_LABEL[p.serviceLine]} · {p.contactName} · owner {p.salesOwner.name ?? p.salesOwner.email}
                </p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                {STAGE_LABEL[p.stage]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
