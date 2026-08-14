import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, GATE_PASS_STATUS, statusMeta } from "@/lib/status-maps";
import { LoadValidationForm } from "./load-validation-form";
import { GatePassForm } from "./gate-pass-form";
import { GatePassApproval } from "./gate-pass-approval";
import { MonitoringWindowPanel } from "./monitoring-window-panel";
import { LightReplacementForm } from "./light-replacement-form";
import { RescaleRowActions } from "./rescale-row-actions";
import { RescaleForm } from "./rescale-form";
import { DemoReviewPanel } from "./demo-review-panel";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { RESOLUTION_LABEL, reviewUrgency } from "@/lib/demo-result-review";
import { requireAdminPage } from "@/lib/admin-permissions";

function GatePassCard({
  gatePass,
  canOverride,
}: {
  gatePass: {
    id: string;
    status: string;
    itemsJson: unknown;
    photoUrl: string | null;
    rejectedReason: string | null;
  };
  canOverride: boolean;
}) {
  const status = statusMeta(GATE_PASS_STATUS, gatePass.status);
  return (
    <Card className="p-5 text-sm space-y-3">
      <StatusChip tone={status.tone}>{status.label}</StatusChip>
      <ul className="list-disc list-inside text-[var(--text-muted)]">
        {(gatePass.itemsJson as string[]).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {gatePass.photoUrl && (
        <p className="text-[var(--text-muted)]">
          Photo:{" "}
          <a href={gatePass.photoUrl} target="_blank" rel="noreferrer" className="underline">
            view
          </a>
        </p>
      )}
      {gatePass.rejectedReason && <p style={{ color: "var(--bad-fg)" }}>Rejected — {gatePass.rejectedReason}</p>}
      {(gatePass.status === "submitted" || gatePass.status === "provisional") && canOverride && (
        <GatePassApproval gatePassId={gatePass.id} />
      )}
    </Card>
  );
}

export default async function CircuitDetailPage({
  params,
}: {
  params: Promise<{ id: string; circuitId: string }>;
}) {
  const session = await requireAdminPage();

  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin/societies");
  const canEdit = session.user.adminPermissions?.includes("manage_survey") ?? false;
  const canOverride =
    (session.user.adminPermissions?.includes("manage_survey") ?? false) &&
    (session.user.adminPermissions?.includes("manage_pipeline") ?? false);

  const { id, circuitId } = await params;
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      society: true,
      gatePasses: { orderBy: { submittedAt: "desc" } },
      commissioningReadings: { orderBy: { date: "asc" } },
      rescaleEvents: { orderBy: { effectiveDate: "asc" }, include: { recordedBy: true, voidedBy: true } },
      voidedBy: { select: { name: true, email: true } },
      demoResultReviews: {
        orderBy: { raisedAt: "desc" },
        include: { resolvedBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!circuit || circuit.societyId !== id) notFound();

  // FEAT-015 — at most one review is open at a time: a review is only raised
  // when a window completes, and a completed window can't complete again
  // until this one resolves and restarts it.
  const openReview = circuit.demoResultReviews.find((r) => r.state === "open") ?? null;
  const resolvedReviews = circuit.demoResultReviews.filter((r) => r.state === "resolved");

  // FEAT-041 — preInstallBaseline stays as commissioned; the baseline in
  // force today is replayed from the rescale events (INV-07/ADR-005).
  const effectiveBaseline = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, new Date());
  // The table shows what is in force; voided entries are kept but collapsed,
  // so a corrected entry doesn't read as a duplicate of the one it replaced.
  const liveRescaleEvents = circuit.rescaleEvents.filter((e) => !e.voidedAt);
  const voidedRescaleEvents = circuit.rescaleEvents.filter((e) => e.voidedAt);

  const state = statusMeta(CIRCUIT_STATE, circuit.state);
  const installGatePass = circuit.gatePasses.find((g) => g.kind === "demo_install");
  const completionGatePass = circuit.gatePasses.find((g) => g.kind === "demo_install_completion");
  const preInstallReadings = circuit.commissioningReadings
    .filter(
      (r) =>
        r.windowType === "pre_install" && circuit.preInstallWindowStartAt && r.date >= circuit.preInstallWindowStartAt,
    )
    .map((r) => ({ ...r, date: r.date.toISOString() }));
  const preInstallValidCount = preInstallReadings.filter((r) => r.status === "valid").length;
  const preInstallPendingAnomaly = preInstallReadings.some((r) => r.status === "anomaly");
  const postInstallReadings = circuit.commissioningReadings
    .filter(
      (r) =>
        r.windowType === "post_install" &&
        circuit.postInstallWindowStartAt &&
        r.date >= circuit.postInstallWindowStartAt,
    )
    .map((r) => ({ ...r, date: r.date.toISOString() }));
  const postInstallValidCount = postInstallReadings.filter((r) => r.status === "valid").length;
  const postInstallPendingAnomaly = postInstallReadings.some((r) => r.status === "anomaly");

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/societies/${id}/circuits`} className="hover:underline">
            {circuit.society.name} · Circuit registry
          </Link>
        }
        title={circuit.location || circuit.lightType}
        chip={<StatusChip tone={state.tone}>{state.label}</StatusChip>}
      />

      {/* A removed circuit stays reachable by link — saying nothing would
          make the page read as a live circuit that has simply gone missing
          from every list. */}
      {circuit.voidedAt && (
        <div
          className="max-w-2xl rounded-[var(--r-md)] border p-4 text-sm mb-8"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          This circuit was removed by {circuit.voidedBy?.name ?? circuit.voidedBy?.email ?? "—"} on{" "}
          <span className="num">{circuit.voidedAt.toISOString().slice(0, 10)}</span> — {circuit.voidReason}.
          It is excluded from the registry, the monitoring board and every billing run. The record is kept,
          and the operations lead can restore it from the registry.
        </div>
      )}

      {circuit.state === "eligible" && canEdit && (
        <section className="max-w-md mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Meter installation &amp; load validation</h2>
          <LoadValidationForm
            circuitId={circuit.id}
            meteredLightCount={circuit.meteredLightCount}
            wattage={circuit.wattage}
            canOverride={canOverride}
            lastDiscrepancyPct={circuit.loadDiscrepancyPct}
          />
        </section>
      )}
      {circuit.state === "eligible" && !canEdit && (
        <p className="text-sm text-[var(--text-muted)] max-w-md mb-10">
          Meter installation and load validation is PER-04&apos;s action — you can read this circuit&apos;s
          record but not edit it.
        </p>
      )}
      {circuit.loadValidationOverrideById && (
        <p className="text-xs text-[var(--text-muted)] max-w-md mb-6">
          Load validation was overridden by ops — {circuit.loadValidationOverrideReason}
          {circuit.loadDiscrepancyPct != null && ` (discrepancy was ${circuit.loadDiscrepancyPct.toFixed(1)}%)`}
        </p>
      )}

      {/* FEAT-011/CON-18 — the demo-installation gate pass. */}
      {circuit.state === "meter_installed" && !installGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Install gate pass</h2>
          {canEdit ? (
            <GatePassForm circuitId={circuit.id} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Awaiting PER-04 to submit the gate pass on site.</p>
          )}
        </section>
      )}
      {installGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Install gate pass</h2>
          <GatePassCard gatePass={installGatePass} canOverride={canOverride} />
        </section>
      )}

      {/* FEAT-012 — pre-install baseline monitoring window. */}
      {circuit.preInstallWindowStartAt && (
        <MonitoringWindowPanel
          circuitId={circuit.id}
          windowType="pre_install"
          title="Pre-install monitoring window"
          readings={preInstallReadings}
          validCount={preInstallValidCount}
          pendingAnomaly={preInstallPendingAnomaly}
          canEdit={canEdit && circuit.preInstallBaseline == null}
        />
      )}
      {circuit.preInstallBaseline != null && (
        <p className="text-sm text-[var(--text-muted)] max-w-md -mt-6 mb-10">
          Commissioned baseline: <span className="num">{circuit.preInstallBaseline.toFixed(2)}</span> kWh/day at{" "}
          <span className="num">
            {circuit.rescaleEvents[0]?.previousLightCount ?? circuit.meteredLightCount}
          </span>{" "}
          lights
          {/* Only a LIVE entry moves the baseline — a circuit whose entries
              were all voided is back on its commissioned figure, and saying
              "in force now" there would contradict the replay. */}
          {liveRescaleEvents.length > 0 && effectiveBaseline != null && (
            <>
              {" · in force now: "}
              <span className="num font-semibold" style={{ color: "var(--text)" }}>
                {effectiveBaseline.toFixed(2)}
              </span>{" "}
              kWh/day at <span className="num">{circuit.meteredLightCount}</span> lights
            </>
          )}
        </p>
      )}

      {/* FEAT-013 — light replacement / demo installation. */}
      {circuit.state === "awaiting_installation" && !completionGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Completion gate pass</h2>
          {canEdit ? (
            <GatePassForm circuitId={circuit.id} kind="demo_install_completion" />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Awaiting PER-04 to submit the completion gate pass.</p>
          )}
        </section>
      )}
      {completionGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Completion gate pass</h2>
          <GatePassCard gatePass={completionGatePass} canOverride={canOverride} />
        </section>
      )}
      {circuit.state === "awaiting_installation" && completionGatePass && (
        <section className="max-w-md mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Light replacement</h2>
          {canEdit ? (
            <LightReplacementForm circuitId={circuit.id} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Awaiting PER-04 to record the replacement date.</p>
          )}
        </section>
      )}
      {circuit.lightReplacementDate && (
        <p className="text-sm text-[var(--text-muted)] max-w-md -mt-6 mb-10">
          Lights replaced: <span className="num">{circuit.lightReplacementDate.toISOString().slice(0, 10)}</span>
        </p>
      )}

      {/* FEAT-014 — post-install monitoring window & benchmark computation. */}
      {circuit.postInstallWindowStartAt && (
        <MonitoringWindowPanel
          circuitId={circuit.id}
          windowType="post_install"
          title="Post-install monitoring window"
          readings={postInstallReadings}
          validCount={postInstallValidCount}
          pendingAnomaly={postInstallPendingAnomaly}
          canEdit={canEdit && circuit.state !== "benchmark_confirmed" && circuit.state !== "benchmark_review"}
        />
      )}
      {circuit.state === "benchmark_confirmed" && circuit.benchmarkSavingsPct != null && (
        <div
          className="max-w-md rounded-[var(--r-md)] border p-4 text-sm"
          style={{ borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-fg)" }}
        >
          Benchmark confirmed — <span className="num font-semibold">{circuit.benchmarkSavingsPct.toFixed(1)}%</span>{" "}
          savings, fixed for the contract term.
        </div>
      )}
      {/* FEAT-015 — the out-of-range result is reviewed here rather than
          parking the circuit forever. */}
      {openReview && (
        <DemoReviewPanel
          reviewId={openReview.id}
          measuredSavingsPct={openReview.measuredSavingsPct}
          preInstallBaseline={openReview.preInstallBaseline}
          postInstallAverage={openReview.postInstallAverage}
          occurrence={openReview.occurrence}
          urgencyLabel={reviewUrgency({
            raisedAt: openReview.raisedAt,
            occurrence: openReview.occurrence,
            now: new Date(),
          }).label}
          urgencyTone={
            reviewUrgency({ raisedAt: openReview.raisedAt, occurrence: openReview.occurrence, now: new Date() })
              .tone
          }
          canResolve={canOverride}
        />
      )}
      {resolvedReviews.length > 0 && (
        <section className="max-w-2xl mb-10">
          <h2 className="text-[15px] font-semibold mb-3">Out-of-range result history</h2>
          <Card className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Measured</th>
                  <th>Resolution</th>
                  <th>Found</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {resolvedReviews.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.occurrence}</td>
                    <td className="num">{r.measuredSavingsPct.toFixed(1)}%</td>
                    <td>{r.resolution ? RESOLUTION_LABEL[r.resolution] : "—"}</td>
                    <td className="text-[var(--text-muted)]">{r.resolutionNote ?? "—"}</td>
                    <td className="text-[var(--text-muted)]">
                      {r.resolvedBy?.name ?? r.resolvedBy?.email ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
      {circuit.state === "benchmark_review" && !openReview && (
        <div
          className="max-w-md rounded-[var(--r-md)] border p-4 text-sm"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          The measured result fell outside CON-20&apos;s 60-80% band, and the review was escalated for a manual
          benchmark decision — so it is not written by this screen.
        </div>
      )}

      {/* FEAT-041 / INV-07 — light-count change & baseline rescale. Only
          meaningful once a baseline exists to rescale, which is also
          exactly when the count stops being free-form config. */}
      {circuit.preInstallBaseline != null && effectiveBaseline != null && (
        <section className="max-w-2xl mt-10">
          <h2 className="text-[15px] font-semibold mb-1">Light-count changes &amp; baseline rescales</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Recorded as dated events, separate from any billing decision — so a dispute can tell a reapplied
            formula apart from someone&apos;s judgment call.
          </p>

          {liveRescaleEvents.length === 0 ? (
            // FEAT-041-AC-2 — never changed: history is the original only.
            // A circuit whose only entries were all voided reads the same way,
            // which is correct: nothing is in force.
            <div className="mb-4">
              <EmptyState title="No count changes in force">
                This circuit runs on its original commissioned baseline of{" "}
                <span className="num">{circuit.preInstallBaseline.toFixed(2)}</span> kWh/day at{" "}
                <span className="num">{circuit.meteredLightCount}</span> lights.
              </EmptyState>
            </div>
          ) : (
            <Card className="mb-4 overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Effective</th>
                    <th>Lights</th>
                    <th>Baseline (kWh/day)</th>
                    <th>Verification</th>
                    <th>Recorded by</th>
                    {canOverride && <th>{""}</th>}
                  </tr>
                </thead>
                <tbody>
                  {liveRescaleEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="num">{e.effectiveDate.toISOString().slice(0, 10)}</td>
                      <td className="num">
                        {e.previousLightCount} → {e.newLightCount}
                      </td>
                      <td className="num">
                        {e.previousBaseline.toFixed(2)} → {e.rescaledBaseline.toFixed(2)}
                      </td>
                      <td className="text-[var(--text-muted)]">
                        {e.verificationNote}
                        {e.verificationPhotoUrl && (
                          <>
                            {" "}
                            <a href={e.verificationPhotoUrl} target="_blank" rel="noreferrer" className="underline">
                              photo
                            </a>
                          </>
                        )}
                      </td>
                      <td className="text-[var(--text-muted)]">
                        {e.recordedBy.name ?? e.recordedBy.email}
                        <br />
                        <span className="num text-xs">{e.recordedAt.toISOString().slice(0, 10)}</span>
                      </td>
                      {canOverride && (
                        <td>
                          <RescaleRowActions
                            eventId={e.id}
                            previousLightCount={e.previousLightCount}
                            newLightCount={e.newLightCount}
                            previousBaseline={e.previousBaseline}
                            effectiveDate={e.effectiveDate.toISOString().slice(0, 10)}
                            verificationNote={e.verificationNote}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Voided entries are kept — a void is itself a recorded act with an
              owner and a reason — but they are not the current truth, so they
              sit behind a disclosure rather than competing for a row with the
              entries actually in force. */}
          {voidedRescaleEvents.length > 0 && (
            <details className="mb-4">
              <summary className="text-sm text-[var(--text-muted)] cursor-pointer select-none">
                {voidedRescaleEvents.length} voided{" "}
                {voidedRescaleEvents.length === 1 ? "entry" : "entries"} — kept for audit, not counted
                toward the baseline
              </summary>
              <Card className="mt-3 overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Effective</th>
                      <th>Lights</th>
                      <th>Baseline (kWh/day)</th>
                      <th>Why it was voided</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voidedRescaleEvents.map((e) => (
                      <tr key={e.id} style={{ opacity: 0.7 }}>
                        <td className="num">{e.effectiveDate.toISOString().slice(0, 10)}</td>
                        <td className="num" style={{ textDecoration: "line-through" }}>
                          {e.previousLightCount} → {e.newLightCount}
                        </td>
                        <td className="num" style={{ textDecoration: "line-through" }}>
                          {e.previousBaseline.toFixed(2)} → {e.rescaledBaseline.toFixed(2)}
                        </td>
                        <td className="text-[var(--text-muted)]">
                          {e.correctedByEventId ? "Corrected" : "Voided"} by{" "}
                          {e.voidedBy?.name ?? e.voidedBy?.email ?? "—"} — {e.voidReason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </details>
          )}

          {canOverride ? (
            <RescaleForm
              circuitId={circuit.id}
              currentLightCount={circuit.meteredLightCount}
              effectiveBaseline={effectiveBaseline}
            />
          ) : (
            // FEAT-041-AC-4 — PER-04 reads this history but cannot record one.
            <p className="text-sm text-[var(--text-muted)]">
              Recording a verified light-count change is PER-01&apos;s action.
            </p>
          )}
        </section>
      )}
    </>
  );
}
