import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { BENCHMARK_SOURCE_LABEL, OFFER_STATUS, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import type { OfferCircuitTerm } from "@/lib/offer";
import { OfferForm } from "./offer-form";
import { IssueOfferButton, RecordOutcomeControls } from "./offer-controls";

function daysSince(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const canEdit = session.user.adminPermissions?.includes("manage_pipeline") ?? false;
  if (!canEdit) redirect("/admin/pipeline");

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      demoReports: { orderBy: { version: "desc" }, take: 1 },
      offers: {
        orderBy: { version: "desc" },
        include: { issuedBy: true, respondedBy: true },
      },
    },
  });
  if (!pipeline) notFound();

  const current = pipeline.offers[0] ?? null;
  const history = pipeline.offers.slice(1);
  const demoReport = pipeline.demoReports[0] ?? null;
  const status = current ? statusMeta(OFFER_STATUS, current.status) : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/pipeline/${pipeline.id}`} className="hover:underline">
            {pipeline.society.name}
          </Link>
        }
        title="Offer"
        chip={status ? <StatusChip tone={status.tone}>{status.label}</StatusChip> : undefined}
        subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · priced from the demo numbers (CON-11)`}
      />

      {!current ? (
        // FEAT-027-AC-2 — a clear "no offer yet" state with a generate action.
        <div className="max-w-none space-y-6">
          <EmptyState title="No offer yet">
            {demoReport
              ? "Generate one from the confirmed demo numbers — the commercial terms stay editable."
              : "There's no demo report yet. You can still issue an offer on the demo-skip path with a negotiated benchmark (CON-25)."}
          </EmptyState>
          <Card className="p-6">
            <CardTitle>Generate an offer</CardTitle>
            <div className="mt-4">
              <OfferForm pipelineId={pipeline.id} mode="generate" hasDemoReport={!!demoReport} />
            </div>
          </Card>
        </div>
      ) : (
        <div className="max-w-none space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <CardTitle>Version {current.version}</CardTitle>
              <StatusChip tone={status!.tone}>{status!.label}</StatusChip>
            </div>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 mt-4 text-sm">
              <div>
                <dt className="lbl">Benchmark source</dt>
                <dd>{BENCHMARK_SOURCE_LABEL[current.benchmarkSource]}</dd>
              </div>
              <div>
                <dt className="lbl">Tolerance band</dt>
                <dd className="num">±{current.tolerancePct}%</dd>
              </div>
              <div>
                <dt className="lbl">Revenue share</dt>
                {/* Stated with the party named, deliberately: this exact
                    split has been shipped inverted twice in this project. */}
                <dd className="num">
                  {current.revenueSharePct}% society / {100 - current.revenueSharePct}% FirsThing
                </dd>
              </div>
              <div>
                <dt className="lbl">Unit rate</dt>
                <dd className="num">₹{current.unitElectricityRate.toFixed(2)}/kWh</dd>
              </div>
              <div>
                <dt className="lbl">Term</dt>
                <dd className="num">{current.termMonths} months</dd>
              </div>
              <div>
                <dt className="lbl">Projected monthly fee</dt>
                <dd className="num">
                  {current.projectedMonthlyFee != null
                    ? `₹${current.projectedMonthlyFee.toFixed(2)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="lbl">Contracted spare stock</dt>
                <dd className="num">{current.spareStockCount}</dd>
              </div>
              <div>
                <dt className="lbl">Issued</dt>
                <dd>
                  {current.issuedAt
                    ? `${current.issuedAt.toISOString().slice(0, 10)} by ${current.issuedBy?.name ?? current.issuedBy?.email ?? "—"}`
                    : "Not yet issued"}
                </dd>
              </div>
            </dl>

            {current.benchmarkSource === "negotiated_fixed" && (
              <p
                className="mt-4 rounded-[var(--r-md)] border p-3 text-sm"
                style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
              >
                Demo-skip path (CON-25): the savings <strong>percentage</strong> is agreement-derived, not
                measured. Consumption is still metered and monitored against the first post-install month —
                INV-02&apos;s narrowed exception, stated on the offer itself.
              </p>
            )}

            {/* FEAT-028-AC-2 — "awaiting response" with elapsed time, the
                primary stall signal FEAT-031 reads. */}
            {current.status === "issued" && current.issuedAt && (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Awaiting the society&apos;s response — {daysSince(current.issuedAt)} day
                {daysSince(current.issuedAt) === 1 ? "" : "s"} since it was issued.
              </p>
            )}

            {current.responseNote && (
              <p className="mt-4 text-sm">
                <span className="lbl">Response</span>
                <br />
                {current.responseNote}
                {current.respondedBy && (
                  <span className="text-[var(--text-muted)]"> — {current.respondedBy.email}</span>
                )}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              {current.status === "draft" && <IssueOfferButton pipelineId={pipeline.id} offerId={current.id} />}
            </div>
          </Card>

          {(current.circuitTerms as OfferCircuitTerm[])?.length > 0 && (
            <Card className="p-5 overflow-x-auto">
              <CardTitle>Per-circuit benchmark table</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                Snapshotted at offer time — a later rescale never changes what this offer was priced on.
              </p>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Light type</th>
                    <th>Metered</th>
                    <th>Represents</th>
                    <th>Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {(current.circuitTerms as OfferCircuitTerm[]).map((c) => (
                    <tr key={c.circuitId}>
                      <td>
                        {c.lightType}
                        {c.location && <span className="text-[var(--text-muted)]"> · {c.location}</span>}
                      </td>
                      <td className="num">{c.meteredLightCount}</td>
                      <td className="num">{c.representedLightCount}</td>
                      <td className="num">{c.benchmarkSavingsPct.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {current.status === "issued" && (
            <>
              <Card className="p-5">
                <CardTitle>Record the society&apos;s response</CardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                  For a decision relayed by phone. The society can also accept in its own portal, where only the
                  office-bearer may do so (GATE-04).
                </p>
                <RecordOutcomeControls pipelineId={pipeline.id} offerId={current.id} />
              </Card>

              <Card className="p-5">
                <CardTitle>Record a counter</CardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                  Creates a new version with the requested terms. This one stays retrievable exactly as issued.
                </p>
                <OfferForm
                  pipelineId={pipeline.id}
                  mode="counter"
                  counterOfId={current.id}
                  hasDemoReport={!!demoReport}
                  defaults={{
                    benchmarkSource: current.benchmarkSource,
                    tolerancePct: current.tolerancePct,
                    revenueSharePct: current.revenueSharePct,
                    unitElectricityRate: current.unitElectricityRate,
                    termMonths: current.termMonths,
                    spareStockCount: current.spareStockCount,
                    exclusions: ((current.exclusions as string[]) ?? []).join("\n"),
                  }}
                />
              </Card>
            </>
          )}

          {history.length > 0 && (
            <Card className="p-5">
              <CardTitle>Negotiation history</CardTitle>
              <ul className="mt-3 text-sm space-y-2">
                {history.map((o) => {
                  const s = statusMeta(OFFER_STATUS, o.status);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="num">v{o.version}</span>
                      <StatusChip tone={s.tone}>{s.label}</StatusChip>
                      <span className="text-[var(--text-muted)]">
                        {o.revenueSharePct}% society · ±{o.tolerancePct}% · {o.termMonths} months
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
