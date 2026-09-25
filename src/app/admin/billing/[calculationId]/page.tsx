import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { settledTotal } from "@/lib/payment";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, PageRibbon, Stat, StatRow, StatusChip } from "@/components/ui";
import { CALCULATION_STATUS, SERVICE_LINE_LABEL } from "@/lib/status-maps";
import { canRelease, isOps, requireBillingReader } from "../access";
import { refuseRelease } from "@/lib/invoice-reconciliation";
import { arrearsStateOf } from "@/lib/arrears";
import { InvoicePanel } from "./invoice-panel";

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
      invoices: {
        include: {
          payments: true,
          extensions: { select: { days: true } },
          voidedBy: { select: { name: true, email: true } },
        },
        orderBy: { uploadedAt: "desc" },
      },
    },
  });
  if (!calc) notFound();

  // At most one is ever live (a partial unique index guarantees it) — the
  // rest are void, kept as history rather than hidden (2026-09-12).
  const liveInvoice = calc.invoices.find((i) => !i.voidedAt) ?? null;
  const voidedInvoices = calc.invoices.filter((i) => i.voidedAt);

  // CON-13's clock, read the same way the arrears_sweep job reads it — this
  // screen never recomputes the rule differently, only displays what the
  // job already decided (and what it will decide on its next pass).
  const arrears =
    liveInvoice && liveInvoice.releasedAt
      ? arrearsStateOf({
          releasedAt: liveInvoice.releasedAt,
          dueDate: liveInvoice.dueDate,
          amountPaid: settledTotal(liveInvoice.payments),
          invoiceAmount: liveInvoice.amount,
          extensionDaysGranted: liveInvoice.extensions.reduce((n, e) => n + e.days, 0),
          alreadySuspendedAt: liveInvoice.suspendedAt,
          now: new Date(),
        })
      : null;

  // The per-part terms a multi-deal month billed under, from the frozen
  // snapshot (GATE-01) — the single pointer above is null in that case.
  // CON-47 — an invoice-first month's per-line notes: how its readings
  // classified (complete / partial / offline) and which basis it rests on.
  const snapshotLines = (
    ((calc.inputVersionSnapshot as { lines?: unknown[] } | null)?.lines ?? []) as Array<{
      circuitId: string;
      basis?: string;
      readingsNote?: string | null;
      societyNet?: number;
    }>
  );
  const noteFor = (circuitId: string) => snapshotLines.find((x) => x.circuitId === circuitId) ?? null;
  const snapshotParts = (
    ((calc.inputVersionSnapshot as { parts?: unknown[] } | null)?.parts ?? []) as Array<{
      contractId: string;
      deal: string;
      contractTermVersion: number;
      unitElectricityRate: number;
      revenueSharePct: number;
    }>
  ).filter((pt) => pt && typeof pt.deal === "string");

  const meta = CALCULATION_STATUS[calc.status];
  const outOfBand = calc.feeLines.filter((l) => l.complianceResult === "out_of_band");
  const approaching = calc.feeLines.filter((l) => l.approaching && l.complianceResult === "in_band");
  // FEAT-048-AC-1: the society total is the SUM of the fee lines, never a
  // separately-computed figure. Recomputing it here is the cheapest possible
  // assertion of that, and it is shown rather than assumed.
  const lineSum = calc.feeLines.reduce((n, l) => n + l.amount, 0);
  const sumMatches = Math.abs(lineSum - calc.subtotal) < 0.005;

  const unresolvedDeviationCount = calc.feeLines.filter(
    (l) => l.deviationReview && !["decided", "closed"].includes(l.deviationReview.state),
  ).length;
  const releaseBlockedReason = refuseRelease({
    calculation: { status: calc.status },
    invoice: liveInvoice ? { reconciliationStatus: liveInvoice.reconciliationStatus } : null,
    unresolvedDeviationCount,
  });

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
          . It is kept as the record of what this month once computed to; the newer
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
        <Card className="mb-6 p-6">
          <CardTitle>Prorated month</CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            This month bills <strong className="num">{calc.proratedDays}</strong> of{" "}
            <strong className="num">{calc.daysInMonth}</strong> days — billing starts the day after
            the completion certificate was signed. Every fee line below is scaled by{" "}
            <span className="num">
              {calc.proratedDays}/{calc.daysInMonth}
            </span>
            ; the figure is computed, never entered.
          </p>
        </Card>
      )}

      {calc.status !== "held" && (
        <InvoicePanel
          calculationId={calc.id}
          calculationStatus={calc.status}
          canRelease={canRelease(gate.actor)}
          isOps={isOps(gate.actor)}
          releaseBlockedReason={releaseBlockedReason}
          voidedInvoices={voidedInvoices.map((i) => ({
            id: i.id,
            number: i.number,
            amount: i.amount,
            voidedAt: i.voidedAt!.toISOString(),
            voidedBy: i.voidedBy?.name ?? i.voidedBy?.email ?? "—",
            voidReason: i.voidReason ?? "",
          }))}
          invoice={
            liveInvoice
              ? {
                  id: liveInvoice.id,
                  number: liveInvoice.number,
                  issueDate: liveInvoice.issueDate.toISOString(),
                  dueDate: liveInvoice.dueDate.toISOString(),
                  amount: liveInvoice.amount,
                  computedAmount: liveInvoice.computedAmount,
                  reconciliationStatus: liveInvoice.reconciliationStatus,
                  status: liveInvoice.status,
                  fileName: liveInvoice.fileName,
                  paidTotal: settledTotal(liveInvoice.payments),
                  subtotal: liveInvoice.subtotal ?? null,
                  payments: liveInvoice.payments.map((p) => ({
                    id: p.id,
                    amount: p.amount,
                    tdsAmount: p.tdsAmount,
                    method: p.method,
                    utrNumber: p.utrNumber,
                    chequeNumber: p.chequeNumber,
                    chequeDate: p.chequeDate?.toISOString() ?? null,
                    chequeBank: p.chequeBank,
                    confirmedAsOf: p.confirmedAsOf.toISOString(),
                    reference: p.reference,
                    attachments: (p.attachments as { key: string; name: string; kind: string }[] | null) ?? [],
                  })),
                  paymentStatusConfirmedAt: liveInvoice.paymentStatusConfirmedAt?.toISOString() ?? null,
                }
              : null
          }
          arrears={
            arrears
              ? {
                  phase: arrears.phase,
                  daysUntilSuspension: arrears.daysUntilSuspension,
                  suspendDueAt: arrears.suspendDueAt?.toISOString() ?? null,
                }
              : null
          }
        />
      )}

      {calc.status === "held" ? (
        <Card className="p-6">
          <CardTitle>Why it is held</CardTitle>
          <p className="text-sm">{calc.heldReason}</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Fix the inputs — resolve the reading flags, accept the coverage, or record the missing
            readings — then run the month again. Figures are never hand-corrected.
          </p>
        </Card>
      ) : (
        <>
          {/* The title keeps the card's padding; the table runs edge to edge in its own scroll box. */}
          <Card className="mb-6 overflow-hidden">
            <div className="px-6 pb-2 pt-6">
              <CardTitle className="mb-0 flex flex-wrap items-center gap-2">
                Fee lines, per circuit
                {!sumMatches && (
                  <StatusChip tone="bad">Lines do not sum to the subtotal</StatusChip>
                )}
              </CardTitle>
            </div>
            <div className="overflow-x-auto">
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
                        {l.coverageDays} complete day{l.coverageDays === 1 ? "" : "s"}
                        {calc.source === "invoice" && (
                          <>
                            {" · "}
                            <span style={{ color: l.basis === "measured" ? "var(--ok-fg)" : "var(--info-fg)" }}>
                              {l.basis === "measured" ? "measured" : "agreed basis"}
                            </span>
                          </>
                        )}
                      </p>
                      {noteFor(l.circuitId)?.readingsNote && (
                        <p className="mt-1 text-[12.5px]" style={{ color: "var(--warn-fg)" }}>
                          {noteFor(l.circuitId)!.readingsNote}
                        </p>
                      )}
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
            </div>
          </Card>

          {outOfBand.length > 0 && (
            <Card className="mb-6 p-6">
              <CardTitle>Deviations raised</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mb-3">
                A circuit measuring outside its contracted band raises exactly one review, and only
                that circuit&apos;s fee line is at risk. A review needs an owner and
                a root cause before it can close.
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
      <Card className="p-6">
        <CardTitle>What produced these figures</CardTitle>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
          <div>
            <dt className="lbl">Calculated</dt>
            <dd className="num">{calc.calculatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </div>
          <div>
            <dt className="lbl">Contract terms in force</dt>
            <dd>
              {calc.contractTermVersion ? (
                `v${calc.contractTermVersion.version} · ₹${calc.contractTermVersion.unitElectricityRate}/kWh · ${calc.contractTermVersion.revenueSharePct}% society`
              ) : snapshotParts.length > 0 ? (
                // A month combining several parts has no single set of terms
                // — each deal's are stated (CON-24 as amended).
                <span className="flex flex-col gap-0.5">
                  {snapshotParts.map((pt) => (
                    <span key={pt.contractId}>
                      {pt.deal}: v{pt.contractTermVersion} · ₹{pt.unitElectricityRate}/kWh ·{" "}
                      {pt.revenueSharePct}% society
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="lbl">Released</dt>
            <dd>{calc.releasedAt ? formatDate(calc.releasedAt) : "Not released"}</dd>
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
