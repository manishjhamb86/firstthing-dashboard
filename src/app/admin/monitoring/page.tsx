import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, StatusChip } from "@/components/ui";
import { MonitoringBoard, type BoardRow } from "./board";
import { latestVarianceFromAveragePct, averageOfValid } from "@/lib/monitoring-window";
import { reviewUrgency } from "@/lib/demo-result-review";
import { requireAdminPage } from "@/lib/admin-permissions";
import { LIVE_MONITORING_WHERE } from "@/lib/live-monitoring";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { classifyDay, periodSavingsSummary } from "@/lib/circuit-load";
import Link from "next/link";
import { Card, CardTitle, EmptyState } from "@/components/ui";

const REQUIRED_VALID_DAYS = 5;

/** Days here are stored at UTC midnight; compare on the same footing. */
function utcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function loggedToday(readings: { date: Date }[], now: Date) {
  const today = utcDay(now);
  return readings.some((r) => utcDay(r.date) === today);
}

function dayCount(readings: { status: string }[]) {
  return readings.filter((r) => r.status === "valid").length;
}

export default async function MonitoringDashboardPage() {
  const session = await requireAdminPage();

  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin");

  // One clock for the whole render, so two rows can't land on either side of
  // an SLA boundary in the same table.
  const now = new Date();

  // FEAT-012/014 — every circuit currently mid-window, across every
  // society, in one place: the bird's-eye "what needs a reading today"
  // view that drilling into one circuit at a time doesn't give.
  const [openReviews, preInstallActive, postInstallActive, recentlyResolved] = await Promise.all([
    // FEAT-015 — the investigation queue. Ordered by occurrence first, so a
    // circuit that has already failed a re-run outranks one nobody has looked
    // at yet (AC-5), then oldest-first within that.
    db.demoResultReview.findMany({
      where: { state: "open", circuit: { voidedAt: null } },
      include: { circuit: { include: { society: true } } },
      orderBy: [{ occurrence: "desc" }, { raisedAt: "asc" }],
    }),
    db.circuit.findMany({
      where: { voidedAt: null, preInstallWindowStartAt: { not: null }, preInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "pre_install" }, orderBy: { date: "asc" } },
      },
      orderBy: { preInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, postInstallWindowStartAt: { not: null }, postInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "post_install" }, orderBy: { date: "asc" } },
      },
      orderBy: { postInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, state: { in: ["benchmark_confirmed", "benchmark_review"] } },
      include: { society: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Live monitoring — the circuits past commissioning AND past installation,
  // whose monthly readings feed billing. This is where the circuit page's
  // "Upload this month's readings" moved to (user-reported 2026-08-20): the
  // commissioning page offered it the moment a demo benchmark confirmed,
  // which is before the offer, the agreement and the installation exist.
  const liveCircuits = await db.circuit.findMany({
    where: LIVE_MONITORING_WHERE,
    include: {
      society: { select: { name: true } },
      rescaleEvents: true,
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const liveIds = new Set(liveCircuits.map((c) => c.id));

  const liveRows = liveCircuits.map((c) => {
    const days =
      c.meterInstalledAt && c.lightReplacementDate
        ? c.meterReadings.filter(
            (r) => classifyDay(r.date, c.meterInstalledAt!, c.lightReplacementDate) === "post_install",
          )
        : [];
    const baseline = effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, now);
    const summary = periodSavingsSummary(
      baseline,
      days.map((d) => ({ kWh: d.kWh, excluded: d.excludedAt !== null })),
    );
    const last = days.length > 0 ? days[days.length - 1].date : null;
    return {
      id: c.id,
      society: c.society.name,
      circuit: c.location || c.lightType,
      benchmarkPct: c.benchmarkSavingsPct,
      days: days.length,
      savingsPct: summary.savingsPct,
      warn: summary.warn,
      lastReading: last ? last.toISOString().slice(0, 10) : null,
    };
  });

  const preRows = preInstallActive.map((c) => {
    const readings = c.commissioningReadings.filter(
      (r) => c.preInstallWindowStartAt && r.date >= c.preInstallWindowStartAt,
    );
    return {
      circuit: c,
      validCount: dayCount(readings),
      pendingAnomaly: readings.some((r) => r.status === "anomaly"),
      loggedToday: loggedToday(readings, now),
      variancePct: latestVarianceFromAveragePct(readings),
    };
  });

  const postRows = postInstallActive.map((c) => {
    const readings = c.commissioningReadings.filter(
      (r) => c.postInstallWindowStartAt && r.date >= c.postInstallWindowStartAt,
    );
    const avgSoFar = averageOfValid(readings);
    const projectedSavingsPct =
      avgSoFar != null && c.preInstallBaseline
        ? ((c.preInstallBaseline - avgSoFar) / c.preInstallBaseline) * 100
        : null;
    return {
      circuit: c,
      validCount: dayCount(readings),
      pendingAnomaly: readings.some((r) => r.status === "anomaly"),
      loggedToday: loggedToday(readings, now),
      projectedSavingsPct,
    };
  });

  // Four stacked empty states is not a dashboard; when there is genuinely
  // nothing in flight, say that once.

  const activeWindows = preRows.length + postRows.length;
  const awaitingToday = [...preRows, ...postRows].filter(
    (r) => !r.loggedToday && !r.pendingAnomaly,
  ).length;
  const anomaliesOpen = [...preRows, ...postRows].filter((r) => r.pendingAnomaly).length;

  // One row set, ranked by how much it needs a person. Rank decides the whole
  // board's order, so the top of the list is always the work to do — that is
  // what makes it safe to show everything at once instead of hiding three
  // quarters of it behind a tab or below the fold.
  //   0 stuck out-of-band review · 1 open anomaly holding a window
  //   2 window with today's reading still missing · 3 window up to date
  //   4 resolved
  const rows: BoardRow[] = [
    ...openReviews.map((r) => {
      // FEAT-015-AC-3/AC-5 — the SLA wording and the repeat-outranks-overdue
      // rule both live in reviewUrgency; the board must not restate them.
      const u = reviewUrgency({ raisedAt: r.raisedAt, occurrence: r.occurrence, now });
      return {
      id: `rev-${r.id}`,
      href: `/admin/societies/${r.circuit.societyId}/circuits/${r.circuit.id}`,
      society: r.circuit.society.name,
      circuit: r.circuit.location || r.circuit.lightType,
      group: "review" as const,
      stageLabel: u.label,
      // A repeat failure sorts above an overdue first attempt, which sorts
      // above one still inside its SLA — AC-5, expressed as order.
      rank: u.repeat ? 0 : u.overdue ? 0.1 : 0.2,
      urgent: true,
      validCount: null,
      requiredDays: REQUIRED_VALID_DAYS,
      today: null,
      signal: `${r.measuredSavingsPct.toFixed(1)}% measured`,
      signalTone: "bad" as const,
      };
    }),
    ...preRows.map((r) => ({
      id: `pre-${r.circuit.id}`,
      href: `/admin/societies/${r.circuit.societyId}/circuits/${r.circuit.id}`,
      society: r.circuit.society.name,
      circuit: r.circuit.location || r.circuit.lightType,
      group: "pre" as const,
      stageLabel: "Pre-install window",
      rank: r.pendingAnomaly ? 1 : r.loggedToday ? 3 : 2,
      urgent: r.pendingAnomaly,
      validCount: r.validCount,
      requiredDays: REQUIRED_VALID_DAYS,
      today: r.pendingAnomaly ? null : ((r.loggedToday ? "logged" : "not_yet") as "logged" | "not_yet"),
      signal: r.pendingAnomaly
        ? "Anomaly open"
        : r.variancePct != null
          ? `${r.variancePct >= 0 ? "+" : ""}${r.variancePct.toFixed(1)}% vs average`
          : "Awaiting first reading",
      signalTone: r.pendingAnomaly ? ("warn" as const) : null,
    })),
    ...postRows.map((r) => {
      const inBand =
        r.projectedSavingsPct != null && r.projectedSavingsPct >= 60 && r.projectedSavingsPct <= 80;
      return {
        id: `post-${r.circuit.id}`,
        href: `/admin/societies/${r.circuit.societyId}/circuits/${r.circuit.id}`,
        society: r.circuit.society.name,
        circuit: r.circuit.location || r.circuit.lightType,
        group: "post" as const,
        stageLabel: "Post-install window",
        rank: r.pendingAnomaly ? 1 : r.loggedToday ? 3 : 2,
        urgent: r.pendingAnomaly,
        validCount: r.validCount,
        requiredDays: REQUIRED_VALID_DAYS,
        today: r.pendingAnomaly ? null : ((r.loggedToday ? "logged" : "not_yet") as "logged" | "not_yet"),
        signal: r.pendingAnomaly
          ? "Anomaly open"
          : r.projectedSavingsPct != null
            ? `${r.projectedSavingsPct.toFixed(1)}% so far`
            : "Awaiting first reading",
        signalTone: r.pendingAnomaly ? ("warn" as const) : r.projectedSavingsPct != null ? (inBand ? ("ok" as const) : ("warn" as const)) : null,
      };
    }),
    // A circuit that has gone live has moved past "recently resolved" — it
    // has its own row below. Listing it in both puts the same circuit on the
    // screen twice with two different meanings.
    ...recentlyResolved
      .filter((c) => !liveIds.has(c.id))
      .map((c) => ({
      id: `res-${c.id}`,
      href: `/admin/societies/${c.societyId}/circuits/${c.id}`,
      society: c.society.name,
      circuit: c.location || c.lightType,
      group: "resolved" as const,
      stageLabel: c.state === "benchmark_confirmed" ? "Benchmark confirmed" : "Sent to review",
      rank: 4,
      urgent: false,
      validCount: null,
      requiredDays: REQUIRED_VALID_DAYS,
      today: null,
      signal:
        c.benchmarkSavingsPct != null ? `${c.benchmarkSavingsPct.toFixed(1)}% confirmed` : "Out of band",
      signalTone: c.benchmarkSavingsPct != null ? ("ok" as const) : ("warn" as const),
      })),
  ];

  const needsAttention = rows.filter((r) => r.rank <= 2).length;

  return (
    <>
      <PageHeader
        title="Metering monitoring"
        subtitle="Every circuit in commissioning, most urgent first — then the ones already live."
        chip={
          needsAttention > 0 ? (
            <StatusChip tone="warn">
              {needsAttention} {needsAttention === 1 ? "needs" : "need"} attention
            </StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing outstanding</StatusChip>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-xl">
        {[
          {
            label: "Awaiting today's reading",
            value: awaitingToday,
            detail: activeWindows === 0 ? "no active windows" : `of ${activeWindows} active window${activeWindows === 1 ? "" : "s"}`,
          },
          {
            label: "Anomalies open",
            value: anomaliesOpen,
            detail: anomaliesOpen === 0 ? "no window held" : "window held until fixed",
          },
        ].map((f) => (
          <div key={f.label} className="card p-4">
            <p className="lbl mb-1.5">{f.label}</p>
            <p className="num text-[20px] font-semibold leading-none">{f.value}</p>
            <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{f.detail}</p>
          </div>
        ))}
      </div>

      <MonitoringBoard rows={rows} />

      {/* Live monitoring sits below commissioning deliberately: a circuit
          reaches it only by finishing everything above, so the order on this
          page is the order of the work. */}
      <section className="max-w-none mt-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-1">
          <CardTitle className="mb-0">Live monitoring</CardTitle>
          {liveRows.length > 0 && (
            <StatusChip tone="ok">
              {liveRows.length} live circuit{liveRows.length === 1 ? "" : "s"}
            </StatusChip>
          )}
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Installed, signed off and billing. Each month&apos;s readings are recorded here — savings
          are measured against the baseline in force (INV-07).
        </p>
        {liveRows.length === 0 ? (
          <EmptyState title="No circuits are live yet">
            A circuit arrives here once its benchmark is confirmed and its installation is signed
            off — billing starts the day after the completion certificate (CON-22).
          </EmptyState>
        ) : (
          <Card className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Circuit</th>
                  <th>Benchmark</th>
                  <th>Days recorded</th>
                  <th>Last reading</th>
                  <th>Measured savings</th>
                </tr>
              </thead>
              <tbody>
                {liveRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.society}</td>
                    <td>
                      <Link href={`/admin/monitoring/${r.id}`} className="font-medium hover:underline">
                        {r.circuit} →
                      </Link>
                    </td>
                    <td className="num">
                      {r.benchmarkPct != null ? `${r.benchmarkPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="num">{r.days}</td>
                    <td className="num text-[var(--text-muted)]">{r.lastReading ?? "none yet"}</td>
                    <td>
                      {r.savingsPct == null ? (
                        <span className="text-[var(--text-muted)]">awaiting readings</span>
                      ) : (
                        <StatusChip tone={r.warn ? "warn" : "ok"}>
                          {r.savingsPct.toFixed(1)}%
                        </StatusChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}
