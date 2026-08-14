import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../admin-nav";
import { latestVarianceFromAveragePct, averageOfValid } from "@/lib/monitoring-window";

const REQUIRED_VALID_DAYS = 5;

function dayCount(readings: { status: string }[]) {
  return readings.filter((r) => r.status === "valid").length;
}

export default async function MonitoringDashboardPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin");

  // FEAT-012/014 — every circuit currently mid-window, across every
  // society, in one place: the bird's-eye "what needs a reading today"
  // view that drilling into one circuit at a time doesn't give.
  const [preInstallActive, postInstallActive, recentlyResolved] = await Promise.all([
    db.circuit.findMany({
      where: { preInstallWindowStartAt: { not: null }, preInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "pre_install" }, orderBy: { date: "asc" } },
      },
      orderBy: { preInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { postInstallWindowStartAt: { not: null }, postInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "post_install" }, orderBy: { date: "asc" } },
      },
      orderBy: { postInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { state: { in: ["benchmark_confirmed", "benchmark_review"] } },
      include: { society: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const preRows = preInstallActive.map((c) => {
    const readings = c.commissioningReadings.filter((r) => c.preInstallWindowStartAt && r.date >= c.preInstallWindowStartAt);
    return {
      circuit: c,
      validCount: dayCount(readings),
      pendingAnomaly: readings.some((r) => r.status === "anomaly"),
      variancePct: latestVarianceFromAveragePct(readings),
      latest: readings[readings.length - 1],
    };
  });

  const postRows = postInstallActive.map((c) => {
    const readings = c.commissioningReadings.filter((r) => c.postInstallWindowStartAt && r.date >= c.postInstallWindowStartAt);
    const avgSoFar = averageOfValid(readings);
    const projectedSavingsPct =
      avgSoFar != null && c.preInstallBaseline ? ((c.preInstallBaseline - avgSoFar) / c.preInstallBaseline) * 100 : null;
    return {
      circuit: c,
      validCount: dayCount(readings),
      pendingAnomaly: readings.some((r) => r.status === "anomaly"),
      projectedSavingsPct,
      latest: readings[readings.length - 1],
    };
  });

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-1">Metering monitoring</h1>
      <p className="mb-8 text-[var(--text-muted)]">Daily status of every circuit currently in a commissioning window.</p>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Pre-install baseline windows</h2>
        {preRows.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-6 text-center max-w-2xl">
            <p className="text-sm text-[var(--text-muted)]">No circuits are currently in a pre-install monitoring window.</p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] divide-y divide-[var(--border-subtle)] max-w-3xl">
            {preRows.map((row) => (
              <Link
                key={row.circuit.id}
                href={`/admin/societies/${row.circuit.societyId}/circuits/${row.circuit.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm hover:bg-[var(--surface-hover)]"
              >
                <div>
                  <span className="font-medium">{row.circuit.society.name}</span>
                  <span className="text-[var(--text-muted)]"> · {row.circuit.location || row.circuit.lightType}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>
                    Day {row.validCount} of {REQUIRED_VALID_DAYS}
                  </span>
                  {row.pendingAnomaly ? (
                    <span style={{ color: "var(--warn-fg)" }}>Anomaly open</span>
                  ) : row.variancePct != null ? (
                    <span>{row.variancePct >= 0 ? "+" : ""}{row.variancePct.toFixed(1)}% vs. avg</span>
                  ) : (
                    <span>Awaiting first reading</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Post-install windows — live benchmark trend</h2>
        {postRows.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-6 text-center max-w-2xl">
            <p className="text-sm text-[var(--text-muted)]">No circuits are currently in a post-install monitoring window.</p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] divide-y divide-[var(--border-subtle)] max-w-3xl">
            {postRows.map((row) => (
              <Link
                key={row.circuit.id}
                href={`/admin/societies/${row.circuit.societyId}/circuits/${row.circuit.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm hover:bg-[var(--surface-hover)]"
              >
                <div>
                  <span className="font-medium">{row.circuit.society.name}</span>
                  <span className="text-[var(--text-muted)]"> · {row.circuit.location || row.circuit.lightType}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>
                    Day {row.validCount} of {REQUIRED_VALID_DAYS}
                  </span>
                  {row.pendingAnomaly ? (
                    <span style={{ color: "var(--warn-fg)" }}>Anomaly open</span>
                  ) : row.projectedSavingsPct != null ? (
                    <span>{row.projectedSavingsPct.toFixed(1)}% projected savings so far</span>
                  ) : (
                    <span>Awaiting first reading</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recently resolved</h2>
        {recentlyResolved.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-6 text-center max-w-2xl">
            <p className="text-sm text-[var(--text-muted)]">No circuit has completed benchmark commissioning yet.</p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] divide-y divide-[var(--border-subtle)] max-w-3xl">
            {recentlyResolved.map((c) => (
              <Link
                key={c.id}
                href={`/admin/societies/${c.societyId}/circuits/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm hover:bg-[var(--surface-hover)]"
              >
                <div>
                  <span className="font-medium">{c.society.name}</span>
                  <span className="text-[var(--text-muted)]"> · {c.location || c.lightType}</span>
                </div>
                {c.state === "benchmark_confirmed" && c.benchmarkSavingsPct != null ? (
                  <span className="text-xs font-semibold" style={{ color: "var(--ok-fg)" }}>
                    {c.benchmarkSavingsPct.toFixed(1)}% confirmed
                  </span>
                ) : (
                  <span className="text-xs font-semibold" style={{ color: "var(--warn-fg)" }}>
                    Outside CON-20 band — under review
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
