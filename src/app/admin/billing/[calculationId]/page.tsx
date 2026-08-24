import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, PageRibbon, Stat, StatRow, StatusChip } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";
import { requireBillingReader } from "../access";

// MS-08 / FEAT-048 — one month's run, line by line.
//
// INV-02 is the whole point of this screen: every figure a society is billed
// on has to trace back to the readings and the benchmark version that
// produced it. So the table shows the CON-11 chain in the order it is
// computed — metered kWh, extrapolated to the represented count, measured
// savings against the baseline in force, deviation from the benchmark, the
// pricing basis that follows, and only then the money.
export const dynamic = "force-dynamic";

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CALC_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neu" | "info" }> = {
  held: { label: "Held", tone: "warn" },
  calculated: { label: "Calculated", tone: "info" },
  released: { label: "Released", tone: "ok" },
  superseded: { label: "Superseded", tone: "neu" },
};

export default async function CalculationPage({
  params,
}: {
  params: Promise<{ calculationId: string }>;
}) {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const { calculationId } = await params;

  const calc = await db.monthlyCalculation.findUnique({
    where: { id: calculationId },
    include: {
      society: true,
      contractTermVersion: true,
      supersededBy: { select: { id: true, version: true } },
      feeLines: {
        orderBy: { amount: "desc" },
        include: {
          circuit: { select: { id: true, lightType: true, location: true, societyId: true } },
          deviationReview: { include: { owner: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!calc) notFound();

  const meta = CALC_STATUS[calc.status];
  const outOfBand = calc.feeLines.filter((l) => l.complianceResult === "out_of_band");
  const approaching = calc.feeLines.filter((l) => l.approaching && l.complianceResult === "in_band");
  // FEAT-048-AC-1: the society total is the SUM of the fee lines, never a
  // separately-computed figure. Recomputing it here is the cheapest possible
  // assertion of that, and it is shown rather than assumed.
  const lineSum = calc.feeLines.reduce((n, l) => n + l.amount, 0);
  const sumMatches = Math.abs(lineSum - calc.subtotal) < 0.005;

  return (
    <>
      {/* A superseded version is still readable — it is what a society may
          have been shown — but it must never read as the live figure. */}
      {calc.status === "superseded" && calc.supersededBy && (
        <PageRibbon tone="neutral">
          This is version {calc.version}, superseded by{" "}
          <Link href={`/admin/billing/${calc.supersededBy.id}`} className="underline font-medium">
            version {calc.supersededBy.version}
          </Link>
          . It is kept as the record of what this month once computed to (GATE-02); the newer
          version is the one that bills.
        </PageRibbon>
      )}
      {calc.status === "held" && (
        <PageRibbon tone="warn">
          <strong>Held — this month is not billable.</strong> {calc.heldReason}
        </PageRibbon>
      )}

      <PageHeader
        backHref={`/admin/billing?period=${calc.period}`}
        title={calc.society.name}
        subtitle={`${calc.period} · ${SERVICE_LINE_LABEL[calc.serviceLine] ?? calc.serviceLine} · version ${calc.version}`}
        chip={<StatusChip tone={meta.tone}>{meta.label}</StatusChip>}
      />

      <StatRow>
        <Stat
          label="Society total"
          value={calc.status === "held" ? "—" : rupees(calc.total)}
          tone="accent"
          detail={calc.status === "held" ? "nothing computed" : `${calc.feeLines.length} circuit fee line${calc.feeLines.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Saved this month"
          value={calc.status === "held" ? "—" : `${calc.totalSavedKwh.toFixed(1)} kWh`}
          detail={calc.status === "held" ? "—" : `worth ${rupees(calc.totalSavedValue)}`}
        />
        <Stat
          label="Reading coverage"
          value={calc.status === "held" ? "—" : `${calc.coverageDays}/${calc.coverageOfDays}`}
          tone={calc.coverageDays < calc.coverageOfDays ? "warn" : "ok"}
          detail={
            calc.coverageDays < calc.coverageOfDays
              ? "carried through every derived figure"
              : "every day reported"
          }
        />
        <Stat
          label="Out of band"
          value={outOfBand.length}
          tone={outOfBand.length > 0 ? "warn" : "ok"}
          detail={
            outOfBand.length > 0
              ? `${outOfBand.length} deviation review${outOfBand.length === 1 ? "" : "s"} raised`
              : approaching.length > 0
                ? `${approaching.length} approaching the band`
                : "every circuit inside its band"
          }
        />
      </StatRow>

      {/* CON-22 / FEAT-051 — a partial month says so in words, not just by
          being a smaller number than last month's. */}
      {calc.proratedDays !== null && calc.daysInMonth !== null && (
        <Card className="mb-6">
          <CardTitle>Prorated month</CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            This month bills <strong className="num">{calc.proratedDays}</strong> of{" "}
            <strong className="num">{calc.daysInMonth}</strong> days — billing starts the day after
            the completion certificate was signed (CON-22). Every fee line below is scaled by{" "}
            <span className="num">
              {calc.proratedDays}/{calc.daysInMonth}
            </span>
            ; the figure is computed, never entered.
          </p>
        </Card>
      )}

      {calc.status === "held" ? (
        <Card>
          <CardTitle>Why it is held</CardTitle>
          <p className="text-sm">{calc.heldReason}</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Fix the inputs — resolve the reading flags, accept the coverage, or record the missing
            readings — then run the month again. Figures are never hand-corrected (FEAT-048-AC-4).
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto mb-6">
            <CardTitle>
              Fee lines · CON-11, per circuit
              {!sumMatches && (
                <StatusChip tone="bad">Lines do not sum to the subtotal</StatusChip>
              )}
            </CardTitle>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Circuit</th>
                  <th className="text-right">Metered kWh</th>
                  <th className="text-right">Extrapolated</th>
                  <th className="text-right">Measured</th>
                  <th className="text-right">Benchmark</th>
                  <th className="text-right">Deviation</th>
                  <th>Basis</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {calc.feeLines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link
                        href={`/admin/societies/${l.circuit.societyId}/circuits/${l.circuit.id}`}
                        className="font-medium hover:underline"
                      >
                        {l.circuit.location || l.circuit.lightType}
                      </Link>
                      <p className="text-[13px] text-[var(--text-muted)]">
                        {l.meteredLightCount} metered of {l.representedLightCount} represented ·{" "}
                        {l.coverageDays} day{l.coverageDays === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className="num text-right">{l.meteredKwh.toFixed(2)}</td>
                    <td className="num text-right">{l.extrapolatedConsumption.toFixed(2)}</td>
                    <td className="num text-right">{l.measuredSavingsPct.toFixed(2)}%</td>
                    <td className="num text-right">{l.benchmarkSavingsPct.toFixed(2)}%</td>
                    <td className="num text-right">
                      {l.deviationPct > 0 ? "+" : ""}
                      {l.deviationPct.toFixed(2)}%
                    </td>
                    <td>
                      {l.complianceResult === "out_of_band" ? (
                        <StatusChip tone="warn">
                          {l.pricingBasis === "actual_metered" ? "Actual metered" : "Out of band"}
                        </StatusChip>
                      ) : l.approaching ? (
                        <StatusChip tone="info">Approaching</StatusChip>
                      ) : (
                        <StatusChip tone="ok">Fixed</StatusChip>
                      )}
                      {l.consecutiveBreachCount > 1 && (
                        <p className="text-[11px] text-[var(--warn-fg)] mt-1">
                          {l.consecutiveBreachCount} months consecutive
                        </p>
                      )}
                    </td>
                    <td className="num text-right font-semibold">{rupees(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="font-medium text-right">
                    Subtotal — the sum of the lines above, not a separate figure
                  </td>
                  <td className="num text-right font-semibold">{rupees(calc.subtotal)}</td>
                </tr>
                {calc.total !== calc.subtotal && (
                  <tr>
                    <td colSpan={7} className="font-medium text-right">
                      {/* Name the reason the two differ. "Total after
                          adjustments" on a month whose only difference is
                          proration is the same unnamed-figure problem as the
                          baseline pair fixed on 2026-08-21. */}
                      {calc.proratedDays !== null && calc.daysInMonth !== null
                        ? `Total — prorated ${calc.proratedDays}/${calc.daysInMonth} of the month`
                        : "Total after adjustments"}
                    </td>
                    <td className="num text-right font-semibold">{rupees(calc.total)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </Card>

          {outOfBand.length > 0 && (
            <Card className="mb-6">
              <CardTitle>Deviations raised</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mb-3">
                A circuit measuring outside its contracted band raises exactly one review, and only
                that circuit&apos;s fee line is at risk (FEAT-049-AC-5). A review needs an owner and
                a root cause before it can close — INV-03.
              </p>
              <ul className="space-y-2">
                {outOfBand.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span>
                      <span className="font-medium">{l.circuit.location || l.circuit.lightType}</span>{" "}
                      <span className="num text-[var(--text-muted)]">
                        {l.measuredSavingsPct.toFixed(2)}% against {l.benchmarkSavingsPct.toFixed(2)}%
                      </span>
                    </span>
                    {l.deviationReview ? (
                      <Link href={`/admin/billing/deviations/${l.deviationReview.id}`}>
                        <StatusChip tone={l.deviationReview.state === "closed" ? "ok" : "warn"}>
                          {l.deviationReview.state === "closed"
                            ? `Closed · ${l.deviationReview.rootCause?.replace(/_/g, " ") ?? "no root cause"}`
                            : `Review it →`}
                        </StatusChip>
                      </Link>
                    ) : (
                      <StatusChip tone="neu">No review raised</StatusChip>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* GATE-01 — provenance. Not decoration: it is the only thing that makes
          a disputed figure answerable. */}
      <Card>
        <CardTitle>What produced these figures</CardTitle>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
          <div>
            <dt className="lbl">Calculated</dt>
            <dd className="num">{calc.calculatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </div>
          <div>
            <dt className="lbl">Contract terms in force</dt>
            <dd>
              {calc.contractTermVersion
                ? `v${calc.contractTermVersion.version} · ₹${calc.contractTermVersion.unitElectricityRate}/kWh · ${calc.contractTermVersion.revenueSharePct}% society`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="lbl">Released</dt>
            <dd>{calc.releasedAt ? calc.releasedAt.toISOString().slice(0, 10) : "Not released"}</dd>
          </div>
          <div>
            <dt className="lbl">Version</dt>
            <dd className="num">{calc.version}</dd>
          </div>
        </dl>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Input snapshot — every reading id and version behind these numbers
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-[var(--r-sm)] p-3 text-[11px]" style={{ background: "var(--surface-active)" }}>
            {JSON.stringify(calc.inputVersionSnapshot, null, 2)}
          </pre>
        </details>
      </Card>
    </>
  );
}
