import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { MonitoringBoard, type BoardRow } from "./board";
import { latestVarianceFromAveragePct, averageOfValid } from "@/lib/monitoring-window";
import { reviewUrgency } from "@/lib/demo-result-review";
import { windowProgress } from "@/lib/window-progress";
import { requireAdminPage } from "@/lib/admin-permissions";
import { LIVE_MONITORING_WHERE } from "@/lib/live-monitoring";

const REQUIRED_VALID_DAYS = 5;

// The day-counting, anomaly and logged-today rules moved to
// `lib/window-progress.ts` when this board had to answer for BOTH ingest
// paths, not just the legacy one. They are shared and unit-tested there
// rather than living as private helpers on the one screen that reads them.

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
  const [openReviews, preInstallActive, postInstallActive, recentlyResolved, liveCircuitIds] =
    await Promise.all([
    // FEAT-015 — the investigation queue. Ordered by occurrence first, so a
    // circuit that has already failed a re-run outranks one nobody has looked
    // at yet (AC-5), then oldest-first within that.
    db.demoResultReview.findMany({
      // A review whose circuit has since reached a confirmed benchmark has
      // had its question answered. The write paths now close those, but rows
      // raised before that fix exist — and a queue item that contradicts the
      // circuit's own page is worse than no queue item.
      where: {
        state: "open",
        circuit: { voidedAt: null, benchmarkSavingsPct: null },
      },
      include: { circuit: { include: { society: true } } },
      orderBy: [{ occurrence: "desc" }, { raisedAt: "asc" }],
    }),
    // Both stores, deliberately. The pre-install window opens the moment the
    // meter install is recorded, so every commissioning circuit lands here —
    // including the ones on CON-45's CSV path, which never write a
    // CommissioningReading. Reading only the legacy table showed those rows a
    // legacy-only gate ("0/5") and a daily-logging prompt ("Not logged
    // today") that their flow does not have, while the circuit's own page
    // listed the days that had just been uploaded.
    db.circuit.findMany({
      where: { voidedAt: null, preInstallWindowStartAt: { not: null }, preInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "pre_install" }, orderBy: { date: "asc" } },
        meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
      },
      orderBy: { preInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, postInstallWindowStartAt: { not: null }, postInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "post_install" }, orderBy: { date: "asc" } },
        meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
      },
      orderBy: { postInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, state: { in: ["benchmark_confirmed", "benchmark_review"] } },
      include: { society: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // A circuit that has gone live belongs to the other tab entirely. Its
    // benchmark being confirmed is exactly what got it there, so without
    // this the "resolved" group re-lists every live circuit on a board about
    // circuits that are still commissioning.
    db.circuit.findMany({ where: LIVE_MONITORING_WHERE, select: { id: true } }),
  ]);
  const liveIds = new Set(liveCircuitIds.map((c) => c.id));

  // The variance and projected-savings figures are computed from the days the
  // progress count ACTUALLY came from. Reading the legacy table for these
  // while counting both stores put two contradictory statements on one row —
  // "4 days uploaded" beside "Awaiting first reading" — which is the same
  // one-question-two-answers fault this whole pass is closing.
  const asDays = (c: { commissioningReadings: { date: Date; status: string; consumptionKwh: number | null }[]; meterReadings: { date: Date; kWh: number; excludedAt: Date | null }[] }, start: Date | null, flow: string) =>
    flow === "stored"
      ? c.meterReadings
          .filter((r) => !start || r.date >= start)
          .map((r) => ({ date: r.date, status: r.excludedAt === null ? "valid" : "excluded", consumptionKwh: r.kWh }))
      : c.commissioningReadings.filter((r) => !start || r.date >= start);

  const preRows = preInstallActive.map((c) => {
    const progress = windowProgress({
      legacy: c.commissioningReadings,
      stored: c.meterReadings,
      windowStartAt: c.preInstallWindowStartAt,
      requiredValidDays: REQUIRED_VALID_DAYS,
      now,
    });
    const readings = asDays(c, c.preInstallWindowStartAt, progress.flow);
    return {
      circuit: c,
      progress,
      variancePct: latestVarianceFromAveragePct(readings),
    };
  });

  const postRows = postInstallActive.map((c) => {
    const progress = windowProgress({
      legacy: c.commissioningReadings,
      stored: c.meterReadings,
      windowStartAt: c.postInstallWindowStartAt,
      requiredValidDays: REQUIRED_VALID_DAYS,
      now,
    });
    const readings = asDays(c, c.postInstallWindowStartAt, progress.flow);
    const avgSoFar = averageOfValid(readings);
    const projectedSavingsPct =
      avgSoFar != null && c.preInstallBaseline
        ? ((c.preInstallBaseline - avgSoFar) / c.preInstallBaseline) * 100
        : null;
    return { circuit: c, progress, projectedSavingsPct };
  });

  // Four stacked empty states is not a dashboard; when there is genuinely
  // nothing in flight, say that once.

  const activeWindows = preRows.length + postRows.length;
  const awaitingToday = [...preRows, ...postRows].filter(
    (r) => !r.progress.loggedToday && !r.progress.pendingAnomaly,
  ).length;
  const anomaliesOpen = [...preRows, ...postRows].filter((r) => r.progress.pendingAnomaly).length;


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
      serviceLine: r.circuit.serviceLine,
      group: "review" as const,
      stageLabel: u.label,
      // A repeat failure sorts above an overdue first attempt, which sorts
      // above one still inside its SLA — AC-5, expressed as order.
      rank: u.repeat ? 0 : u.overdue ? 0.1 : 0.2,
      urgent: true,
      validCount: null,
      requiredDays: REQUIRED_VALID_DAYS,
      progressLabel: null,
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
      serviceLine: r.circuit.serviceLine,
      group: "pre" as const,
      stageLabel: "Pre-install window",
      rank: r.progress.pendingAnomaly ? 1 : r.progress.loggedToday ? 3 : 2,
      urgent: r.progress.pendingAnomaly,
      // The five-day strip belongs to the legacy window alone — CON-45's path
      // averages every non-excluded day instead, so "3/5" would be a claim
      // about a gate that flow does not have.
      validCount: r.progress.flow === "legacy" ? r.progress.dayCount : null,
      requiredDays: REQUIRED_VALID_DAYS,
      progressLabel: r.progress.flow === "legacy" ? null : r.progress.label,
      today: r.progress.flow !== "legacy" || r.progress.pendingAnomaly
        ? null
        : ((r.progress.loggedToday ? "logged" : "not_yet") as "logged" | "not_yet"),
      signal: r.progress.pendingAnomaly
        ? "Anomaly open"
        : r.variancePct != null
          ? `${r.variancePct >= 0 ? "+" : ""}${r.variancePct.toFixed(1)}% vs average`
          : "Awaiting first reading",
      signalTone: r.progress.pendingAnomaly ? ("warn" as const) : null,
    })),
    ...postRows.map((r) => {
      const inBand =
        r.projectedSavingsPct != null && r.projectedSavingsPct >= 60 && r.projectedSavingsPct <= 80;
      return {
        id: `post-${r.circuit.id}`,
        href: `/admin/societies/${r.circuit.societyId}/circuits/${r.circuit.id}`,
        society: r.circuit.society.name,
        circuit: r.circuit.location || r.circuit.lightType,
        serviceLine: r.circuit.serviceLine,
        group: "post" as const,
        stageLabel: "Post-install window",
        rank: r.progress.pendingAnomaly ? 1 : r.progress.loggedToday ? 3 : 2,
        urgent: r.progress.pendingAnomaly,
        validCount: r.progress.flow === "legacy" ? r.progress.dayCount : null,
        requiredDays: REQUIRED_VALID_DAYS,
        progressLabel: r.progress.flow === "legacy" ? null : r.progress.label,
        today: r.progress.flow !== "legacy" || r.progress.pendingAnomaly
          ? null
          : ((r.progress.loggedToday ? "logged" : "not_yet") as "logged" | "not_yet"),
        signal: r.progress.pendingAnomaly
          ? "Anomaly open"
          : r.projectedSavingsPct != null
            ? `${r.projectedSavingsPct.toFixed(1)}% so far`
            : "Awaiting first reading",
        signalTone: r.progress.pendingAnomaly ? ("warn" as const) : r.projectedSavingsPct != null ? (inBand ? ("ok" as const) : ("warn" as const)) : null,
      };
    }),
    ...recentlyResolved
      .filter((c) => !liveIds.has(c.id))
      .map((c) => ({
      id: `res-${c.id}`,
      href: `/admin/societies/${c.societyId}/circuits/${c.id}`,
      society: c.society.name,
      circuit: c.location || c.lightType,
      serviceLine: c.serviceLine,
      group: "resolved" as const,
      stageLabel: c.state === "benchmark_confirmed" ? "Benchmark confirmed" : "Sent to review",
      rank: 4,
      urgent: false,
      validCount: null,
      requiredDays: REQUIRED_VALID_DAYS,
      progressLabel: null,
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
        title="Demo monitoring"
        subtitle="Circuits still establishing a benchmark, most urgent first."
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

      <StatRow>
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
          // A row of two in a four-column grid left half the row empty while
          // every other page filled it — and these are figures the board is
          // already sorted by, not padding.
          {
            label: "In commissioning",
            value: rows.filter((r) => r.group !== "resolved").length,
            detail: "meter install through benchmark",
          },
          {
            label: "Needs a decision",
            value: rows.filter((r) => r.group === "review").length,
            detail: rows.some((r) => r.group === "review") ? "out of band, awaiting review" : "nothing waiting",
          },
        ].map((f) => (
          <Stat key={f.label} label={f.label} value={f.value} detail={f.detail} />
        ))}
      </StatRow>

      <MonitoringBoard rows={rows} serviceLines={[...new Set(rows.map((r) => r.serviceLine))].sort()} />

    </>
  );
}
