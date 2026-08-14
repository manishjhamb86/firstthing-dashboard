import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, KpiTile, PageHeader, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, PIPELINE_STAGE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { requireAdminPage } from "@/lib/admin-permissions";

// The Portfolio overview. Replaces MS-01's walking-skeleton stub ("Societies
// in Postgres: 1"), which was a proof that a Server Component could read a
// row, never a screen. Every figure here is a real query — nothing is
// fabricated, and anything the schema can't yet answer is simply absent
// rather than shown as a placeholder number.
export default async function AdminHomePage() {
  const session = await requireAdminPage();

  const perms = session.user.adminPermissions ?? [];
  const canSeePipeline = perms.includes("manage_pipeline");
  const canSeeMonitoring = perms.includes("manage_survey");

  const [
    societyCount,
    activeSocietyCount,
    prospectCount,
    openPipelineCount,
    pendingApprovalCount,
    circuitsInCommissioning,
    benchmarkConfirmedCount,
    recentPipelines,
    circuitsNeedingAttention,
  ] = await Promise.all([
    db.society.count(),
    db.society.count({ where: { status: "active" } }),
    db.society.count({ where: { status: "prospect" } }),
    db.pipeline.count({ where: { stage: { in: ["lead", "survey_pending"] } } }),
    db.pipeline.count({ where: { authoritative: false } }),
    db.circuit.count({
      where: {
        voidedAt: null,
        state: { in: ["meter_installed", "pre_install_monitoring", "awaiting_installation", "post_install_pending", "post_install_monitoring"] },
      },
    }),
    db.circuit.count({ where: { voidedAt: null, state: "benchmark_confirmed" } }),
    db.pipeline.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { society: true, salesOwner: true },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, state: { in: ["benchmark_review", "surveyed"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { society: true },
    }),
  ]);

  return (
    <>
      <PageHeader title="Portfolio" subtitle={`Signed in as ${session.user.email}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <KpiTile
          label="Societies"
          value={societyCount}
          detail={`${activeSocietyCount} active · ${prospectCount} prospect`}
        />
        {canSeePipeline && (
          <KpiTile
            label="Open pipelines"
            value={openPipelineCount}
            detail={pendingApprovalCount > 0 ? `${pendingApprovalCount} pending approval` : "None pending approval"}
          />
        )}
        {canSeeMonitoring && (
          <KpiTile
            label="Circuits commissioning"
            value={circuitsInCommissioning}
            detail="Meter install through benchmark"
          />
        )}
        {canSeeMonitoring && (
          <KpiTile label="Benchmarks confirmed" value={benchmarkConfirmedCount} detail="Inside CON-20's 60-80% band" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {canSeePipeline && (
          <Card className="p-6">
            <CardTitle>Recent leads</CardTitle>
            {recentPipelines.length === 0 ? (
              <EmptyState
                title="No leads yet"
                action={
                  <Link href="/admin/pipeline/new" className="btn-ghost btn-sm">
                    Log a lead →
                  </Link>
                }
              >
                The deal spine starts here — log a lead after a first meeting.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {recentPipelines.map((p) => {
                  const stage = statusMeta(PIPELINE_STAGE, p.stage);
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                    >
                      <div>
                        <Link href={`/admin/pipeline/${p.id}`} className="font-medium hover:underline">
                          {p.society.name}
                        </Link>
                        <p className="text-sm text-[var(--text-muted)]">
                          {SERVICE_LINE_LABEL[p.serviceLine]} · {p.salesOwner.name ?? p.salesOwner.email}
                        </p>
                      </div>
                      <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {canSeeMonitoring && (
          <Card className="p-6">
            <CardTitle>Needs a decision</CardTitle>
            {circuitsNeedingAttention.length === 0 ? (
              <EmptyState title="Nothing waiting">
                No circuit is sitting on a light-count exception or a benchmark outside CON-20&apos;s band.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {circuitsNeedingAttention.map((c) => {
                  const state =
                    c.state === "surveyed"
                      ? { label: "Awaiting light-count exception", tone: "warn" as const }
                      : statusMeta(CIRCUIT_STATE, c.state);
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                    >
                      <div>
                        <Link
                          href={`/admin/societies/${c.societyId}/circuits/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.location || c.lightType}
                        </Link>
                        <p className="text-sm text-[var(--text-muted)]">{c.society.name}</p>
                      </div>
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
