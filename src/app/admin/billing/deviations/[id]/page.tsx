import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, PageRibbon, Stat, StatRow, StatusChip } from "@/components/ui";
import { DeviationChart, type ChartDay } from "@/components/deviation-chart";
import { STATE_LABEL, billingConsequence, rootCauseMeta } from "@/lib/deviation-review";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { requireBillingOps } from "../../access";
import { DecisionPanel } from "./decision-panel";

// FEAT-055 — one deviation, with everything needed to classify it on one
// screen: the daily readings against the benchmark, the coverage, the
// anomalies raised that month, and any rescale that moved the baseline
// underneath the comparison.
export const dynamic = "force-dynamic";

function periodBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

export default async function DeviationPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");
  const { id } = await params;

  const review = await db.deviationReview.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      feeLine: {
        include: {
          circuit: {
            select: {
              id: true,
              societyId: true,
              lightType: true,
              location: true,
              preInstallBaseline: true,
              rescaleEvents: { orderBy: { effectiveDate: "asc" } },
              // The circuit's own deal's terms (CON-24 as amended): with a
              // line delivered in parts, the calculation's single term-version
              // pointer is null and each circuit answers to its own contract.
              siteSurvey: {
                select: {
                  pipeline: {
                    select: {
                      contract: {
                        select: {
                          versions: {
                            orderBy: { effectiveFrom: "desc" },
                            take: 1,
                            select: { tolerancePct: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          calculation: {
            select: {
              id: true,
              period: true,
              status: true,
              coverageOfDays: true,
              society: { select: { id: true, name: true } },
              contractTermVersion: { select: { tolerancePct: true } },
            },
          },
        },
      },
    },
  });
  if (!review) notFound();

  const line = review.feeLine;
  const calc = line.calculation;
  const { from, to } = periodBounds(calc.period);

  const [readings, anomalies, admins] = await Promise.all([
    db.meterReading.findMany({
      where: { circuitId: line.circuitId, date: { gte: from, lt: to } },
      orderBy: { date: "asc" },
      select: { date: true, kWh: true, excludedAt: true, excludedReason: true },
    }),
    db.readingAnomaly.findMany({
      where: { circuitId: line.circuitId, period: calc.period },
      orderBy: { detectedAt: "asc" },
    }),
    db.adminUser.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);

  // The baseline actually in force for this month — replayed from the
  // rescale log, not read off the circuit (INV-07). A rescale effective
  // mid-month is one of the things that can explain a deviation, so it is
  // shown rather than silently folded in.
  const baseline =
    effectiveBaselineAt(line.circuit.preInstallBaseline, line.circuit.rescaleEvents, to) ??
    line.baselineKwhPerDay;
  const benchmarkKwh = baseline * (1 - line.benchmarkSavingsPct / 100);
  // Resolution order matters: the circuit's own contract first (correct in
  // every case, including multi-part months where calc.contractTermVersion
  // is null), then the calculation's pointer. The old `?? 10` default would
  // have judged a multi-part deviation against a band nobody agreed to.
  const tolerancePct =
    line.circuit.siteSurvey?.pipeline?.contract?.versions[0]?.tolerancePct ??
    calc.contractTermVersion?.tolerancePct ??
    10;
  // The band is a band on the SAVINGS percentage, so its width in kWh is the
  // baseline scaled by that many points — not a percentage of the benchmark.
  const toleranceKwh = baseline * (tolerancePct / 100);

  const byDate = new Map(readings.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const days: ChartDay[] = [];
  for (let d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const r = byDate.get(key);
    days.push({
      date: key,
      kWh: r ? r.kWh : null,
      excluded: !!r?.excludedAt,
      excludedReason: r?.excludedReason ?? null,
    });
  }

  const coverageGap = line.coverageDays < calc.coverageOfDays;
  const rescalesThisMonth = line.circuit.rescaleEvents.filter(
    (e) => e.voidedAt === null && e.effectiveDate >= from && e.effectiveDate < to,
  );
  const consequence = review.rootCause
    ? billingConsequence({ rootCause: review.rootCause, correctedAtNoCost: review.correctedAtNoCost })
    : null;

  return (
    <>
      {review.state === "closed" && (
        <PageRibbon tone="neutral">
          Closed by {review.owner?.name ?? review.owner?.email ?? "—"} on{" "}
          <span className="num">{review.closedAt?.toISOString().slice(0, 10)}</span>. The
          classification below is what next month&apos;s run reads.
        </PageRibbon>
      )}

      <PageHeader
        backHref="/admin/billing/deviations"
        title={calc.society.name}
        subtitle={`${line.circuit.location || line.circuit.lightType} · ${calc.period} · ${tolerancePct}% contracted band`}
        chip={
          <StatusChip tone={review.state === "closed" ? "ok" : review.rootCause ? "neu" : "warn"}>
            {STATE_LABEL[review.state]}
          </StatusChip>
        }
      />

      <StatRow>
        <Stat
          label="Measured savings"
          value={`${line.measuredSavingsPct.toFixed(2)}%`}
          tone="warn"
          detail={`against a ${line.benchmarkSavingsPct.toFixed(0)}% benchmark`}
        />
        <Stat
          label="Short by"
          value={`${Math.abs(line.deviationPct).toFixed(2)} pts`}
          detail={`the band allows ${tolerancePct}`}
        />
        <Stat
          label="Coverage"
          value={`${line.coverageDays}/${calc.coverageOfDays}`}
          tone={coverageGap ? "warn" : "ok"}
          detail={coverageGap ? "a gap can explain a shortfall" : "every day reported"}
        />
        <Stat
          label="This month bills"
          value={line.pricingBasis === "fixed" ? "As contracted" : "Actual metered"}
          detail={
            line.pricingBasis === "fixed"
              ? "month 1 never adjusts (CON-01c)"
              : "a sustained, uncorrected breach"
          }
        />
      </StatRow>

      <Card className="mb-6">
        <CardTitle>Daily consumption against the benchmark</CardTitle>
        <DeviationChart
          days={days}
          benchmarkKwh={benchmarkKwh}
          toleranceKwh={toleranceKwh}
          baselineKwh={baseline}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 items-start [&>*]:min-w-0 mb-6">
        <Card>
          <CardTitle>What else was happening</CardTitle>
          <dl className="text-sm space-y-3">
            <div>
              <dt className="lbl">Reading flags this month</dt>
              <dd>
                {anomalies.length === 0 ? (
                  "None raised."
                ) : (
                  <ul className="mt-1 space-y-1">
                    {anomalies.map((a) => (
                      <li key={a.id}>
                        <StatusChip tone={a.status === "open" || a.status === "sent_back" ? "warn" : "ok"}>{a.status}</StatusChip>{" "}
                        {a.kind.replace(/_/g, " ")} — {a.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt className="lbl">Baseline rescales effective this month</dt>
              <dd>
                {rescalesThisMonth.length === 0
                  ? "None — the baseline this month is the one the benchmark was set against."
                  : rescalesThisMonth
                      .map(
                        (e) =>
                          `${e.effectiveDate.toISOString().slice(0, 10)}: ${e.previousLightCount} → ${e.newLightCount} lights, baseline ${e.previousBaseline.toFixed(2)} → ${e.rescaledBaseline.toFixed(2)}`,
                      )
                      .join("; ")}
              </dd>
            </div>
            <div>
              <dt className="lbl">Baseline in force</dt>
              <dd className="num">{baseline.toFixed(2)} kWh/day</dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            <Link
              href={`/admin/readings/circuit/${line.circuitId}?period=${calc.period}`}
              className="underline"
            >
              Open this circuit&apos;s readings →
            </Link>
          </p>
        </Card>

        <DecisionPanel
          reviewId={review.id}
          state={review.state}
          rootCause={review.rootCause}
          decision={review.decision ?? ""}
          correctedAtNoCost={review.correctedAtNoCost}
          societyExplanation={review.societyExplanation ?? ""}
          findings={review.findings ?? ""}
          assignedToId={review.assignedToId}
          admins={admins}
          coverageGap={coverageGap}
          coverageDays={line.coverageDays}
          daysInMonth={calc.coverageOfDays}
        />
      </div>

      {consequence && (
        <Card>
          <CardTitle>
            What this decision means
            <StatusChip tone={consequence.exposesNextMonth ? "warn" : "ok"}>
              {rootCauseMeta(review.rootCause!).label}
            </StatusChip>
          </CardTitle>
          <p className="text-sm font-medium">{consequence.headline}</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">{consequence.detail}</p>
          {review.decision && (
            <p className="text-sm mt-3">
              <span className="lbl block mb-1">Recorded reasoning</span>
              {review.decision}
            </p>
          )}
          {review.societyExplanation && (
            <p className="text-sm mt-3">
              <span className="lbl block mb-1">What the society is told</span>
              {review.societyExplanation}
            </p>
          )}
          <p className="text-[13px] text-[var(--text-muted)] mt-3">
            Owner: {review.owner?.name ?? review.owner?.email ?? "—"} ·{" "}
            {review.decidedAt?.toISOString().slice(0, 10)} — INV-03 requires both an owner and a
            classification on any bill-changing decision.
          </p>
        </Card>
      )}
    </>
  );
}
