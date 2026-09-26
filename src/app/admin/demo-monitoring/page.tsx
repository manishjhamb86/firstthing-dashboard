import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { MonitoringBoard, type BoardRow } from "./board";
import { reviewUrgency } from "@/lib/demo-result-review";
import { requireAdminPage } from "@/lib/admin-permissions";
import { LIVE_MONITORING_WHERE } from "@/lib/live-monitoring";
import { demoFacts, demoFactsInclude } from "@/lib/circuit-figures";
import { demoComplete, demoNextLabel, demoSteps } from "@/lib/demo-steps";
import { BAND_MAX_PCT, BAND_MIN_PCT } from "@/lib/circuit-demos";

// Kept for the board's day strip type; the per-demo flow has no five-day gate.
const REQUIRED_VALID_DAYS = 5;
const PRE_STEPS = new Set(["eligibility", "meter", "install-gate", "pre-readings"]);

export default async function MonitoringDashboardPage() {
  const session = await requireAdminPage();

  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin");

  // One clock for the whole render, so two rows can't land on either side of
  // an SLA boundary in the same table.
  const now = new Date();

  // Every demo still being walked (2026-09-26): each demo has its own steps
  // and periods, so the board lists demos, grouped by which side of the
  // replacement they are on, with the one step each is waiting for.
  const [openReviews, demos, liveCircuitIds] = await Promise.all([
    // FEAT-015 — the investigation queue. Ordered by occurrence first, so a
    // circuit that has already failed a re-run outranks one nobody has looked
    // at yet (AC-5), then oldest-first within that.
    db.demoResultReview.findMany({
      where: { state: "open", circuit: { voidedAt: null } },
      include: { circuit: { include: { society: true } } },
      orderBy: [{ occurrence: "desc" }, { raisedAt: "asc" }],
    }),
    db.circuitDemo.findMany({
      where: { voidedAt: null, rejected: false, circuit: { voidedAt: null } },
      include: {
        ...demoFactsInclude,
        circuit: { include: { society: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // A circuit that has gone live belongs to the other tab entirely.
    db.circuit.findMany({ where: LIVE_MONITORING_WHERE, select: { id: true } }),
  ]);
  const liveIds = new Set(liveCircuitIds.map((c) => c.id));
  const reviewedDemoIds = new Set(openReviews.map((r) => r.demoId).filter(Boolean));

  const demoRows = demos
    .filter((d) => !liveIds.has(d.circuitId) && !reviewedDemoIds.has(d.id))
    .map((d) => {
      const eligible = !["surveyed", "ineligible"].includes(d.circuit.state);
      const f = demoFacts(d, eligible);
      const current = demoSteps(f).find((s) => s.status === "current") ?? null;
      const inPeriod = (phase: "pre" | "post") => d.readings.filter((r) => r.phase === phase && r.excludedAt === null);
      const avg = (rows: { kWh: number }[]) => (rows.length ? rows.reduce((n, r) => n + r.kWh, 0) / rows.length : null);
      const pre = inPeriod("pre");
      const post = inPeriod("post");
      const baseline = f.preAverage ?? avg(pre);
      const postAvg = avg(post);
      const projected = baseline && postAvg !== null ? (1 - postAvg / baseline) * 100 : null;
      return { d, f, current, pre, post, projected, complete: demoComplete(f) };
    });

  const rows: BoardRow[] = [
    ...openReviews.map((r) => {
      // FEAT-015-AC-3/AC-5 — the SLA wording and the repeat-outranks-overdue
      // rule both live in reviewUrgency; the board must not restate them.
      const u = reviewUrgency({ raisedAt: r.raisedAt, occurrence: r.occurrence, now });
      return {
        id: `rev-${r.id}`,
        href: `/admin/societies/${r.circuit.societyId}/circuits/${r.circuit.id}${r.demoId ? `?demo=${r.demoId}` : ""}`,
        society: r.circuit.society.name,
        circuit: r.circuit.location || r.circuit.lightType,
        serviceLine: r.circuit.serviceLine,
        group: "review" as const,
        stageLabel: u.label,
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
    ...demoRows.map(({ d, f, current, pre, post, projected, complete }) => {
      const onPre = !complete && (current === null || PRE_STEPS.has(current.key));
      const inBand = projected !== null && projected >= BAND_MIN_PCT && projected <= BAND_MAX_PCT;
      const base = {
        id: `demo-${d.id}`,
        href: `/admin/societies/${d.circuit.societyId}/circuits/${d.circuitId}?demo=${d.id}`,
        society: d.circuit.society.name,
        circuit: `${d.circuit.location || d.circuit.lightType} · demo ${d.sequence}`,
        serviceLine: d.circuit.serviceLine,
        validCount: null,
        requiredDays: REQUIRED_VALID_DAYS,
        today: null,
        urgent: false,
      };
      if (complete) {
        return {
          ...base,
          group: "resolved" as const,
          stageLabel: f.inBand ? "Demo complete" : "Complete · out of band",
          rank: 4,
          progressLabel: null,
          signal: f.savingsPct !== null ? `${f.savingsPct.toFixed(1)}% measured` : "—",
          signalTone: f.inBand ? ("ok" as const) : ("warn" as const),
        };
      }
      const days = onPre ? pre.length : post.length;
      const periodSet = onPre ? f.prePeriodSet : f.postPeriodSet;
      return {
        ...base,
        group: onPre ? ("pre" as const) : ("post" as const),
        stageLabel: demoNextLabel(f),
        // Waiting on readings or acceptance is work to do; waiting on a date
        // still to come is not.
        rank: current?.key === "pre-readings" || current?.key === "post-readings" ? 2 : 3,
        progressLabel: !periodSet ? "Period not set" : `${days} day${days === 1 ? "" : "s"} in the period`,
        signal: onPre
          ? f.preAverage !== null
            ? `${f.preAverage.toFixed(2)} kWh/day accepted`
            : pre.length > 0
              ? "Not accepted yet"
              : "Awaiting readings"
          : projected !== null
            ? `${projected.toFixed(1)}% so far`
            : "Awaiting readings",
        signalTone: onPre ? null : projected !== null ? (inBand ? ("ok" as const) : ("warn" as const)) : null,
      };
    }),
  ];

  const activeWindows = rows.filter((r) => r.group === "pre" || r.group === "post").length;
  const awaitingReadings = rows.filter((r) => (r.group === "pre" || r.group === "post") && r.rank === 2).length;

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
            label: "Waiting on readings",
            value: awaitingReadings,
            detail: activeWindows === 0 ? "no demo in progress" : `of ${activeWindows} demo${activeWindows === 1 ? "" : "s"} in progress`,
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
