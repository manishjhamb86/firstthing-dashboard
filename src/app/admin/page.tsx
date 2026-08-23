import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, PIPELINE_STAGE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { SAVINGS_BAND_META, savingsBand } from "@/lib/circuit-load";
import { requireAdminPage } from "@/lib/admin-permissions";

// The Portfolio overview. Every figure here is a real query — nothing is
// fabricated, and anything the schema can't yet answer is simply absent
// rather than shown as a placeholder number.
//
// Page-by-page design pass (2026-08-17): a dashboard is scanned, not read,
// so the order is summary → what needs a decision → where the work sits.
// The two visuals are CSS bars over real counts, not a charting library:
// the deal funnel (where every open deal is) and the benchmark spread
// (whether commissioned circuits land in CON-20's band).

// The deal spine in order (08-prioritization.md §3.1). closed_lost is
// deliberately outside the funnel — it is an exit, not a stage of progress.
const FUNNEL_STAGES = [
  "lead",
  "survey_pending",
  "demo_reported",
  "offered",
  "agreed",
  "installation",
  "active_billing",
] as const;

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
    stageGroups,
    benchmarkedCircuits,
  ] = await Promise.all([
    db.society.count(),
    db.society.count({ where: { status: "active" } }),
    db.society.count({ where: { status: "prospect" } }),
    db.pipeline.count({ where: { stage: { in: ["lead", "survey_pending"] } } }),
    db.pipeline.count({ where: { authoritative: false } }),
    db.circuit.count({
      where: {
        voidedAt: null,
        state: {
          in: [
            "meter_installed",
            "pre_install_monitoring",
            "awaiting_installation",
            "post_install_pending",
            "post_install_monitoring",
          ],
        },
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
    db.pipeline.groupBy({ by: ["stage"], _count: { _all: true } }),
    db.circuit.findMany({
      where: { voidedAt: null, benchmarkSavingsPct: { not: null } },
      orderBy: { benchmarkSavingsPct: "desc" },
      take: 6,
      include: { society: { select: { name: true } } },
    }),
  ]);

  const stageCount = new Map(stageGroups.map((g) => [g.stage as string, g._count._all]));
  const funnel = FUNNEL_STAGES.map((s) => ({ stage: s, count: stageCount.get(s) ?? 0 }));
  const funnelPeak = Math.max(1, ...funnel.map((f) => f.count));
  const closedLost = stageCount.get("closed_lost") ?? 0;
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const decisionCount = circuitsNeedingAttention.length;

  return (
    <>
      {/* PageHeader like every other page — this was the one screen with a
          hand-rolled header, which is why its title rendered at 24px against
          everyone else's 22px and its margin was mb-7 against mb-8. The date
          is this page's subtitle; the waiting work is its chip, and the chip
          is a link, same as the catalog's and live monitoring's. */}
      <PageHeader
        title="Portfolio"
        subtitle={today}
        chip={
          canSeeMonitoring && decisionCount > 0 ? (
            <a href="#needs-decision" aria-label="Jump to the circuits needing a decision">
              <StatusChip tone="warn">
                {decisionCount} {decisionCount === 1 ? "circuit needs" : "circuits need"} a decision
              </StatusChip>
            </a>
          ) : undefined
        }
      />

      <StatRow>
        <Stat
          label="Societies"
          value={societyCount}
          detail={`${activeSocietyCount} active · ${prospectCount} prospect`}
        />
        {canSeePipeline && (
          <Stat
            label="Open pipelines"
            value={openPipelineCount}
            detail={pendingApprovalCount > 0 ? `${pendingApprovalCount} pending approval` : "None pending approval"}
          />
        )}
        {canSeeMonitoring && (
          <Stat
            label="Circuits commissioning"
            value={circuitsInCommissioning}
            detail="Meter install through benchmark"
          />
        )}
        {canSeeMonitoring && (
          <Stat
            label="Benchmarks confirmed"
            value={benchmarkConfirmedCount}
            detail="Inside CON-20's 60-80% band"
          />
        )}
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* ── Left column: where the work is ─────────────────────────── */}
        <div className="lg:col-span-7 min-w-0 space-y-6">
          {canSeePipeline && (
            <Card className="p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5">
                <CardTitle>Deal pipeline</CardTitle>
                <Link href="/admin/pipeline" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                  Open the board →
                </Link>
              </div>
              {funnel.every((f) => f.count === 0) ? (
                <EmptyState
                  title="No deals in flight"
                  action={
                    <Link href="/admin/pipeline/new" className="btn-ghost btn-sm">
                      Log a lead →
                    </Link>
                  }
                >
                  The deal spine starts here — log a lead after a first meeting.
                </EmptyState>
              ) : (
                <>
                  <ul className="space-y-2.5">
                    {funnel.map(({ stage, count }) => {
                      const meta = statusMeta(PIPELINE_STAGE, stage);
                      return (
                        <li key={stage} className="flex items-center gap-3">
                          <span className="w-32 shrink-0 text-[13px] text-[var(--text-muted)]">{meta.label}</span>
                          {/* the bar is a second encoding of the number beside
                              it, never the only one */}
                          <span
                            className="h-2 flex-1 overflow-hidden rounded-[var(--r-pill)]"
                            style={{ background: "var(--surface-active)" }}
                          >
                            <span
                              className="block h-full rounded-[var(--r-pill)]"
                              style={{
                                width: `${Math.max(count === 0 ? 0 : 4, (count / funnelPeak) * 100)}%`,
                                background: count === 0 ? "transparent" : "var(--accent)",
                              }}
                            />
                          </span>
                          <span className="num w-8 shrink-0 text-right text-sm font-semibold">{count}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {closedLost > 0 && (
                    <p className="mt-4 border-t pt-3 text-xs text-[var(--text-subtle)]" style={{ borderColor: "var(--border-subtle)" }}>
                      <span className="num">{closedLost}</span> closed / lost — an exit, not a stage, so it sits
                      outside the funnel.
                    </p>
                  )}
                </>
              )}
            </Card>
          )}

          {canSeePipeline && (
            <Card className="p-6">
              <CardTitle>Recent leads</CardTitle>
              {recentPipelines.length === 0 ? (
                <EmptyState title="No leads yet">
                  Nothing logged so far — the newest five will appear here.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Society</th>
                        <th>Service line</th>
                        <th>Owner</th>
                        <th>Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPipelines.map((p) => {
                        const stage = statusMeta(PIPELINE_STAGE, p.stage);
                        return (
                          <tr key={p.id}>
                            <td>
                              <Link href={`/admin/pipeline/${p.id}`} className="font-medium hover:underline">
                                {p.society.name}
                              </Link>
                            </td>
                            <td className="text-[var(--text-muted)]">{SERVICE_LINE_LABEL[p.serviceLine]}</td>
                            <td className="text-[var(--text-muted)]">
                              {p.salesOwner.name ?? p.salesOwner.email}
                            </td>
                            <td>
                              <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ── Right column: what needs a person ──────────────────────── */}
        <div className="lg:col-span-5 min-w-0 space-y-6">
          {canSeeMonitoring && (
            <Card className="p-6" >
              <div id="needs-decision" className="scroll-mt-24">
                <CardTitle>Needs a decision</CardTitle>
              </div>
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
                        <div className="min-w-0">
                          <Link
                            href={`/admin/societies/${c.societyId}/circuits/${c.id}`}
                            className="font-medium hover:underline"
                          >
                            {c.location || c.lightType}
                          </Link>
                          <p className="text-sm text-[var(--text-muted)] truncate">{c.society.name}</p>
                        </div>
                        <StatusChip tone={state.tone}>{state.label}</StatusChip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* Confirmed benchmarks against CON-20's band — the number the whole
              commercial model rests on, so it belongs on the home screen. */}
          {canSeeMonitoring && (
            <Card className="p-6">
              <CardTitle>Commissioned savings</CardTitle>
              {benchmarkedCircuits.length === 0 ? (
                <EmptyState title="No benchmarks yet">
                  A circuit lands here once its post-installation window produces a measured savings
                  figure.
                </EmptyState>
              ) : (
                <ul className="space-y-3.5">
                  {benchmarkedCircuits.map((c) => {
                    const pct = c.benchmarkSavingsPct ?? 0;
                    const band = savingsBand(pct);
                    const meta = SAVINGS_BAND_META[band];
                    return (
                      <li key={c.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <Link
                            href={`/admin/societies/${c.societyId}/circuits/${c.id}`}
                            className="truncate text-[13px] font-medium hover:underline"
                          >
                            {c.society.name} · {c.location || c.lightType}
                          </Link>
                          <span className="num shrink-0 text-sm font-semibold" style={{ color: meta.accent }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div
                          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[var(--r-pill)]"
                          style={{ background: "var(--surface-active)" }}
                        >
                          <div
                            className="h-full rounded-[var(--r-pill)]"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: meta.accent }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">{meta.label}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
