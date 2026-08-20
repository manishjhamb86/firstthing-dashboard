import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { READING_ANOMALY_KIND, READING_ANOMALY_STATUS } from "@/lib/status-maps";
import { coverageOf, COVERAGE_FLOOR_DAYS, describeCoverage } from "@/lib/reading-coverage";
import { AnomalyControls } from "./anomaly-controls";

// SCR-081's R0 slice. The screen's own spec is emphatic that this is a gate,
// not an advisory — "a person must never be able to leave here thinking they
// are done when a blocking anomaly is still open" — so the unresolved count
// is the headline and the caught-up state is only shown when it is genuinely
// zero. The daily plot and the three-month context set are R1 alongside
// FEAT-100's readiness board; what R0 owes is the decision itself.
export default async function AnomalyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireAdminPage("manage_pipeline");
  const isOps = session.user.adminPermissions.includes("manage_survey");
  const { period: periodParam } = await searchParams;

  const now = new Date();
  const defaultPeriod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
  const period = /^\d{4}-\d{2}$/.test(periodParam ?? "") ? (periodParam as string) : defaultPeriod;

  const anomalies = await db.readingAnomaly.findMany({
    where: { period },
    include: {
      circuit: { select: { id: true, lightType: true, location: true, society: { select: { name: true } } } },
      resolvedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { date: "asc" }],
  });

  const circuitIds = [...new Set(anomalies.map((a) => a.circuitId))];
  const [y, m] = period.split("-").map(Number);
  const [readings, acceptances] = await Promise.all([
    db.meterReading.findMany({
      where: {
        circuitId: { in: circuitIds },
        date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) },
      },
      select: { circuitId: true, date: true, kWh: true, excludedAt: true },
    }),
    db.coverageAcceptance.findMany({ where: { period, circuitId: { in: circuitIds } } }),
  ]);

  const acceptedCircuits = new Set(acceptances.map((a) => a.circuitId));
  const unresolved = anomalies.filter(
    (a) => a.blocksBilling && (a.status === "open" || a.status === "sent_back"),
  ).length;

  // Grouped by circuit — a decision about one flagged day is almost never
  // separable from the rest of that circuit's month.
  const byCircuit = new Map<string, typeof anomalies>();
  for (const a of anomalies) {
    byCircuit.set(a.circuitId, [...(byCircuit.get(a.circuitId) ?? []), a]);
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/admin/readings" className="hover:underline">
            Readings
          </Link>
        }
        title="Anomaly &amp; coverage review"
        subtitle={`${period} — every flag has to be resolved or explicitly accepted before this month can be billed (INV-09).`}
        chip={
          unresolved > 0 ? (
            <StatusChip tone="bad">{unresolved} unresolved</StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing blocking</StatusChip>
          )
        }
        action={
          <Link href="/admin/readings" className="btn-secondary">
            Reading upload
          </Link>
        }
      />

      {anomalies.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Unresolved",
              value: unresolved,
              detail: unresolved === 0 ? "nothing held" : "holding the month",
            },
            {
              label: "Informational",
              value: anomalies.filter((a) => !a.blocksBilling && a.status === "open").length,
              detail: "worth a look, not blocking",
            },
            { label: "Circuits affected", value: byCircuit.size, detail: `flagged in ${period}` },
            {
              label: "Coverage accepted",
              value: acceptedCircuits.size,
              detail: acceptedCircuits.size === 0 ? "none needed" : `below ${COVERAGE_FLOOR_DAYS} days, signed off`,
            },
          ].map((f) => (
            <div key={f.label} className="card p-4">
              <p className="lbl mb-1.5">{f.label}</p>
              <p className="num text-[20px] font-semibold leading-none">{f.value}</p>
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="period" className="lbl">
            Period
          </label>
          <input id="period" name="period" type="month" defaultValue={period} className="field field-auto" />
        </div>
        <button type="submit" className="btn-secondary">
          Show
        </button>
      </form>

      {anomalies.length === 0 ? (
        <Card className="p-6">
          {/* FEAT-045-AC-2 — the caught-up state. */}
          <EmptyState title="Nothing flagged">
            Every circuit with readings for {period} looks consistent with its own history. When an
            upload raises something, it lands here and holds the month until it is dealt with.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...byCircuit.entries()].map(([id, list]) => {
            const circuit = list[0].circuit;
            const days = readings
              .filter((r) => r.circuitId === id)
              .map((r) => ({ date: r.date, kWh: r.kWh, excluded: r.excludedAt !== null }));
            const coverage = coverageOf(days, period);
            const accepted = acceptedCircuits.has(id);
            const openBlocking = list.filter(
              (a) => a.blocksBilling && (a.status === "open" || a.status === "sent_back"),
            ).length;
            const openInformational = list.filter((a) => !a.blocksBilling && a.status === "open").length;

            return (
              <Card key={id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
                  <div>
                    <CardTitle>
                      {circuit.society.name} — {circuit.lightType}
                      {circuit.location ? ` (${circuit.location})` : ""}
                    </CardTitle>
                    <p className="text-sm text-[var(--text-muted)]">
                      Coverage {describeCoverage(coverage)}
                      {accepted ? " — low coverage explicitly accepted" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {openBlocking > 0 ? (
                      <StatusChip tone="bad">{openBlocking} blocking</StatusChip>
                    ) : (
                      <StatusChip tone="ok">Clear</StatusChip>
                    )}
                    {coverage.belowFloor && !accepted && (
                      <StatusChip tone="warn">Below the {COVERAGE_FLOOR_DAYS}-day floor</StatusChip>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Finding</th>
                        <th>What was seen</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((a) => {
                        const kind = READING_ANOMALY_KIND[a.kind] ?? { label: a.kind, tone: "neu" as const };
                        const status = READING_ANOMALY_STATUS[a.status] ?? {
                          label: a.status,
                          tone: "neu" as const,
                        };
                        return (
                          <tr key={a.id}>
                            <td className="num">{a.date ? a.date.toISOString().slice(0, 10) : "—"}</td>
                            <td>
                              <StatusChip tone={kind.tone}>{kind.label}</StatusChip>
                              {!a.blocksBilling && (
                                <span className="ml-2 text-xs text-[var(--text-muted)]">informational</span>
                              )}
                            </td>
                            <td className="max-w-[420px]">
                              <span className="text-sm">{a.detail}</span>
                              {a.resolutionReason && (
                                <p className="mt-1 text-xs text-[var(--text-muted)]">
                                  {a.resolvedBy?.name ?? a.resolvedBy?.email ?? "Someone"}:{" "}
                                  {a.resolutionReason}
                                </p>
                              )}
                            </td>
                            <td>
                              <StatusChip tone={status.tone}>{status.label}</StatusChip>
                            </td>
                            <td className="text-right">
                              {isOps && a.status === "open" ? (
                                <AnomalyControls anomalyId={a.id} hasDay={a.date !== null} />
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {isOps ? (
                  <AnomalyControls
                    circuitId={id}
                    period={period}
                    footer
                    informationalCount={openInformational}
                    showCoverageAccept={coverage.belowFloor && !accepted}
                    coverageLabel={`${coverage.coverageDays} of ${coverage.daysInMonth} days`}
                  />
                ) : (
                  <p className="mt-4 text-sm text-[var(--text-muted)]">
                    Resolving a flag is an operations lead action — it needs both pipeline and
                    field-survey authority.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
