import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, StatusChip } from "@/components/ui";
import { MonitoringBoard, type BoardRow } from "./board";
import { latestVarianceFromAveragePct, averageOfValid } from "@/lib/monitoring-window";
import { reviewUrgency } from "@/lib/demo-result-review";
import { requireAdminPage } from "@/lib/admin-permissions";

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
    ...recentlyResolved.map((c) => ({
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
        subtitle="Every circuit in commissioning, most urgent first."
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
    </>
  );
}
