import type { ReactNode } from "react";
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
import { circuitSteps } from "@/lib/deal-progress";
import { StepSection } from "@/components/step-section";
import { LoadInventoryPanel, type InventoryLine } from "./load-inventory-panel";
import { CircuitReadingPanel } from "./circuit-reading-panel";
import { StoredReadingsPanel, type StoredReadingDTO } from "./stored-readings-panel";
import {
  classifyDay,
  periodSavingsSummary,
  savingsBand,
  savingsPct,
  theoreticalDailyKwh,
  varianceAgainstTheoretical,
  type SavingsBand,
} from "@/lib/circuit-load";

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
      siteSurvey: { select: { pipelineId: true } },
      gatePasses: { orderBy: { submittedAt: "desc" } },
      commissioningReadings: { orderBy: { date: "asc" } },
      rescaleEvents: { orderBy: { effectiveDate: "asc" }, include: { recordedBy: true, voidedBy: true } },
      voidedBy: { select: { name: true, email: true } },
      demoResultReviews: {
        orderBy: { raisedAt: "desc" },
        include: { resolvedBy: { select: { name: true, email: true } } },
      },
      devices: {
        orderBy: { createdAt: "asc" },
        include: {
          deviceType: { select: { name: true } },
          replacementType: { select: { name: true } },
        },
      },
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
  });
  if (!circuit || circuit.societyId !== id) notFound();

  // CON-45 — the inventory dropdown reads the catalog's active originals.
  const catalogOriginals = await db.deviceType.findMany({
    where: { role: "original", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, defaultWattage: true },
  });
  // CON-45 — each inventory line's compatible replacements, for the
  // installation step's dropdowns.
  const replacementOptionRows = await db.deviceReplacementOption.findMany({
    where: { originalTypeId: { in: circuit.devices.map((d) => d.deviceTypeId) } },
    include: { replacement: { select: { id: true, name: true, defaultWattage: true, active: true } } },
  });
  const replacementFormLines = circuit.devices.map((l) => ({
    lineId: l.id,
    deviceName: l.deviceType.name,
    count: l.count,
    wattage: l.wattage,
    options: replacementOptionRows
      .filter((o) => o.originalTypeId === l.deviceTypeId && o.replacement.active)
      .map((o) => ({
        id: o.replacement.id,
        name: o.replacement.name,
        defaultWattage: o.replacement.defaultWattage,
      })),
  }));

  const inventoryLines: InventoryLine[] = circuit.devices.map((l) => ({
    id: l.id,
    deviceTypeId: l.deviceTypeId,
    deviceTypeName: l.deviceType.name,
    count: l.count,
    wattage: l.wattage,
    hoursPerDay: l.hoursPerDay,
    note: l.note,
    replacementName: l.replacementType?.name ?? null,
    replacementCount: l.replacementCount,
    replacementWattage: l.replacementWattage,
  }));

  // CON-45 — the stored daily readings, phase-classified against the
  // circuit's own dates, with the same bands every review surface uses.
  const theoretical = circuit.devices.length > 0 ? theoreticalDailyKwh(circuit.devices) : null;
  const storedReadings: StoredReadingDTO[] = circuit.meterInstalledAt
    ? circuit.meterReadings
        .map((r) => {
          const phase = classifyDay(r.date, circuit.meterInstalledAt!, circuit.lightReplacementDate);
          if (phase === "before_meter" || phase === "replacement_day") return null;
          const isPre = phase === "pre_install";
          const effB = isPre
            ? null
            : effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, r.date);
          const sPct = isPre || effB === null ? null : savingsPct(effB, r.kWh);
          const v = isPre && theoretical !== null ? varianceAgainstTheoretical(r.kWh, theoretical) : null;
          return {
            id: r.id,
            date: r.date.toISOString().slice(0, 10),
            kWh: r.kWh,
            intervalCount: r.intervalCount,
            expectedIntervals: r.expectedIntervals,
            phase: isPre ? ("pre_install" as const) : circuit.benchmarkSavingsPct !== null || circuit.state === "active_billing"
              ? ("monitoring" as const)
              : ("post_install" as const),
            excluded: r.excludedAt !== null,
            excludedReason: r.excludedReason,
            released: r.usedInCalculationId !== null,
            superseded: r.supersededAt !== null,
            variancePct: v?.pct ?? null,
            varianceBand: v?.band ?? null,
            savingsPct: sPct,
            savingsBand: sPct === null ? null : savingsBand(sPct),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [];
  const effBaselineNow = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, new Date());
  const phaseSummaries = (["pre_install", "post_install", "monitoring"] as const).flatMap((phase) => {
    const rows = storedReadings.filter((r) => r.phase === phase);
    if (rows.length === 0) return [];
    const days = rows.map((r) => ({ kWh: r.kWh, excluded: r.excluded }));
    const summary = periodSavingsSummary(phase === "pre_install" ? null : effBaselineNow, days);
    return [
      {
        phase,
        label: phase,
        averageKwh: summary.averageKwh,
        savingsPct: summary.savingsPct,
        savingsBand: summary.band as SavingsBand | null,
        warn: summary.warn,
      },
    ];
  });
  // A circuit that already ran the manual/commissioning-window flow keeps it;
  // a fresh circuit gets the CSV review flow. One circuit, one flow — mixing
  // the two stores under one baseline is how figures stop agreeing.
  const usesLegacyFlow = circuit.commissioningReadings.length > 0 && storedReadings.length === 0;

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

  const steps = circuitSteps({
    state: circuit.state,
    hasInstallGatePass: !!installGatePass,
    hasCompletionGatePass: !!completionGatePass,
    preInstallBaseline: circuit.preInstallBaseline,
    lightReplacementDate: circuit.lightReplacementDate,
    benchmarkSavingsPct: circuit.benchmarkSavingsPct,
  });
  const surveyHref = circuit.siteSurvey ? `/admin/pipeline/${circuit.siteSurvey.pipelineId}/survey` : null;
  const urgency = openReview
    ? reviewUrgency({ raisedAt: openReview.raisedAt, occurrence: openReview.occurrence, now: new Date() })
    : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/societies/${id}/circuits`} className="hover:underline">
            {circuit.society.name} · Circuit registry
          </Link>
        }
        title={circuit.location || circuit.lightType}
        subtitle={`${circuit.lightType} · ${circuit.meteredLightCount} metered of ${circuit.representedLightCount} represented`}
        chip={<StatusChip tone={state.tone}>{state.label}</StatusChip>}
      />

      {/* The four figures someone opens a circuit to check, before the
          step-by-step detail. Each is absent-not-invented: a circuit with no
          baseline yet says so rather than showing a zero. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8 max-w-2xl">
        {[
          {
            label: "Theoretical",
            value: theoretical === null ? "—" : theoretical.toFixed(2),
            unit: theoretical === null ? "no inventory" : "kWh/day",
          },
          {
            label: "Pre-install baseline",
            value: circuit.preInstallBaseline === null ? "—" : circuit.preInstallBaseline.toFixed(2),
            unit: circuit.preInstallBaseline === null ? "not commissioned" : "kWh/day",
          },
          {
            label: "In force now",
            value: effBaselineNow === null ? "—" : effBaselineNow.toFixed(2),
            unit:
              effBaselineNow === null
                ? "no baseline"
                : liveRescaleEvents.length > 0
                  ? `after ${liveRescaleEvents.length} rescale${liveRescaleEvents.length === 1 ? "" : "s"}`
                  : "unchanged",
          },
          {
            label: "Benchmark",
            value:
              circuit.benchmarkSavingsPct === null ? "—" : `${circuit.benchmarkSavingsPct.toFixed(1)}%`,
            unit: circuit.benchmarkSavingsPct === null ? "not confirmed" : "fixed for the term",
          },
        ].map((f) => (
          <div key={f.label} className="card p-4">
            <p className="lbl mb-1.5 min-h-[2.8em]">{f.label}</p>
            <p className="num text-[20px] font-semibold leading-none">{f.value}</p>
            <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{f.unit}</p>
          </div>
        ))}
      </div>

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

      {/* CON-45 — what hangs off this circuit, and the theoretical daily
          figure every pre-installation reading is judged against. Editable
          until the lights are replaced, frozen after — the inventory is what
          the replacement was recorded against. */}
      <section className="max-w-2xl mb-8">
        <h2 className="text-[15px] font-semibold mb-1">Load inventory</h2>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Σ count × wattage × hours ÷ 1000 is the theoretical kWh/day. A pre-install reading outside
          ±5% of it is flagged; outside ±10% is a warning — the check that nothing unknown is
          consuming on this circuit.
        </p>
        <LoadInventoryPanel
          circuitId={circuit.id}
          lines={inventoryLines}
          catalog={catalogOriginals}
          editable={canEdit && circuit.lightReplacementDate === null && !circuit.voidedAt}
          frozenReason={
            circuit.lightReplacementDate
              ? "The lights have been replaced — the inventory is frozen as the record the replacement was made against."
              : canEdit
                ? null
                : "Recording the load inventory is PER-04\u2019s action."
          }
        />
      </section>

      {/* The commissioning sequence as an accordion — the user-specified
          arrangement (2026-08-15): only the step that needs action right now
          is an open form; done steps are closed headers with their record one
          "View" toggle away (still-live controls, like a gate-pass approval,
          sit behind that same toggle); future steps are disabled headers that
          say what unlocks them. circuitSteps() is the single source of the
          ordering and statuses — this page only supplies each step's body. */}
      <div className="max-w-2xl space-y-3 mb-10">
        {steps.map((step, i) => {
          let summary: string = step.summary;
          let chip: ReactNode = null;
          let body: ReactNode = null;

          switch (step.key) {
            case "eligibility": {
              if (step.status === "current") {
                body = (
                  <p className="text-sm text-[var(--text-muted)]">
                    The eligibility decision happens on the{" "}
                    {surveyHref ? (
                      <Link href={surveyHref} className="underline">
                        survey page
                      </Link>
                    ) : (
                      "survey page"
                    )}
                    , not here.
                  </p>
                );
              }
              break;
            }

            case "meter": {
              if (step.status === "current") {
                body = canEdit ? (
                  <LoadValidationForm
                    circuitId={circuit.id}
                    meteredLightCount={circuit.meteredLightCount}
                    wattage={circuit.wattage}
                    canOverride={canOverride}
                    lastDiscrepancyPct={circuit.loadDiscrepancyPct}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Meter installation and load validation is PER-04&apos;s action — you can read this
                    circuit&apos;s record but not edit it.
                  </p>
                );
              } else if (step.status === "done" && circuit.loadValidationOverrideById) {
                // An overridden circuit stays visibly distinguishable from
                // one that passed normally (FEAT-011-AC-5).
                summary = "Validation overridden by ops";
                body = (
                  <p className="text-sm text-[var(--text-muted)]">
                    Load validation was overridden by ops — {circuit.loadValidationOverrideReason}
                    {circuit.loadDiscrepancyPct != null &&
                      ` (discrepancy was ${circuit.loadDiscrepancyPct.toFixed(1)}%)`}
                  </p>
                );
              }
              break;
            }

            // FEAT-011/013/CON-18 — the two gate passes are the same
            // component parameterized by kind, here too.
            case "install-gate":
            case "completion-gate": {
              const pass = step.key === "install-gate" ? installGatePass : completionGatePass;
              if (pass) {
                const meta = statusMeta(GATE_PASS_STATUS, pass.status);
                chip = <StatusChip tone={meta.tone}>{meta.label}</StatusChip>;
                summary = ""; // the chip already states it
                body = <GatePassCard gatePass={pass} canOverride={canOverride} />;
              } else if (step.status === "done") {
                // Rank-inferred done: the lifecycle is past this step but no
                // pass row exists (data predating the feature, an override).
                // Claiming "Submitted" would assert an artifact that isn't there.
                summary = "No stored record — the lifecycle advanced past this step";
              } else if (step.status === "current") {
                body = canEdit ? (
                  <GatePassForm
                    circuitId={circuit.id}
                    kind={step.key === "completion-gate" ? "demo_install_completion" : undefined}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Awaiting PER-04 to submit the gate pass on site.
                  </p>
                );
              }
              break;
            }

            // FEAT-012 — pre-install baseline monitoring window.
            case "pre-window": {
              if (step.status === "current") {
                chip = (
                  <StatusChip tone={preInstallPendingAnomaly ? "warn" : "info"}>
                    {preInstallPendingAnomaly ? "Anomaly open" : `Day ${preInstallValidCount} of 5`}
                  </StatusChip>
                );
                body = usesLegacyFlow ? (
                  circuit.preInstallWindowStartAt ? (
                    <MonitoringWindowPanel
                      circuitId={circuit.id}
                      windowType="pre_install"
                      windowStartAt={circuit.preInstallWindowStartAt?.toISOString() ?? null}
                      title="Pre-install monitoring window"
                      readings={preInstallReadings}
                      validCount={preInstallValidCount}
                      pendingAnomaly={preInstallPendingAnomaly}
                      canEdit={canEdit && circuit.preInstallBaseline == null}
                      embedded
                    />
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">The window has not started yet.</p>
                  )
                ) : canEdit ? (
                  // CON-45 — the CSV review flow. The system extracts from the
                  // day after meter install; every day is reviewed before save.
                  <CircuitReadingPanel circuitId={circuit.id} />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Awaiting PER-04 to upload the meter&apos;s readings.
                  </p>
                );
              } else if (step.status === "done" && circuit.preInstallBaseline == null) {
                summary = "No stored baseline — the lifecycle advanced past this step";
              } else if (step.status === "done" && circuit.preInstallBaseline != null) {
                summary = usesLegacyFlow
                  ? `Baseline ${circuit.preInstallBaseline.toFixed(2)} kWh/day from 5 valid days`
                  : `Baseline ${circuit.preInstallBaseline.toFixed(2)} kWh/day — the average of the accepted pre-install days`;
                body = (
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--text-muted)]">
                      Commissioned baseline:{" "}
                      <span className="num">{circuit.preInstallBaseline.toFixed(2)}</span> kWh/day at{" "}
                      <span className="num">
                        {circuit.rescaleEvents[0]?.previousLightCount ?? circuit.meteredLightCount}
                      </span>{" "}
                      lights
                      {/* Only a LIVE entry moves the baseline — a circuit whose
                          entries were all voided is back on its commissioned
                          figure, and saying "in force now" there would
                          contradict the replay. */}
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
                    {circuit.preInstallWindowStartAt && preInstallReadings.length > 0 && (
                      <MonitoringWindowPanel
                        circuitId={circuit.id}
                        windowType="pre_install"
                        windowStartAt={circuit.preInstallWindowStartAt?.toISOString() ?? null}
                        title="Pre-install monitoring window"
                        readings={preInstallReadings}
                        validCount={preInstallValidCount}
                        pendingAnomaly={preInstallPendingAnomaly}
                        canEdit={false}
                        embedded
                      />
                    )}
                  </div>
                );
              }
              break;
            }

            // FEAT-013 — light replacement / demo installation.
            case "replacement": {
              if (step.status === "current") {
                body = canEdit ? (
                  <LightReplacementForm circuitId={circuit.id} lines={replacementFormLines} />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Awaiting PER-04 to record the replacement date.
                  </p>
                );
              } else if (step.status === "done") {
                summary = circuit.lightReplacementDate
                  ? `Replaced ${circuit.lightReplacementDate
                      .toISOString()
                      .slice(0, 10)} — that day is excluded; the post window starts the day after`
                  : "No stored date — the lifecycle advanced past this step";
              }
              break;
            }

            // FEAT-014/015 — post-install window, benchmark, and the
            // out-of-range review when the result lands outside CON-20.
            case "benchmark": {
              if (step.status === "current") {
                if (openReview && urgency) {
                  chip = <StatusChip tone={urgency.tone}>{urgency.label}</StatusChip>;
                  body = (
                    <div className="space-y-4">
                      <DemoReviewPanel
                        reviewId={openReview.id}
                        measuredSavingsPct={openReview.measuredSavingsPct}
                        preInstallBaseline={openReview.preInstallBaseline}
                        postInstallAverage={openReview.postInstallAverage}
                        occurrence={openReview.occurrence}
                        urgencyLabel={urgency.label}
                        urgencyTone={urgency.tone}
                        canResolve={canOverride}
                        embedded
                      />
                      {circuit.postInstallWindowStartAt && (
                        <MonitoringWindowPanel
                          circuitId={circuit.id}
                          windowType="post_install"
                          windowStartAt={circuit.postInstallWindowStartAt?.toISOString() ?? null}
                          title="Post-install monitoring window"
                          readings={postInstallReadings}
                          validCount={postInstallValidCount}
                          pendingAnomaly={postInstallPendingAnomaly}
                          canEdit={false}
                          embedded
                        />
                      )}
                    </div>
                  );
                } else if (circuit.state === "benchmark_review") {
                  body = (
                    <div className="space-y-4">
                      <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
                        The measured result fell outside CON-20&apos;s 60-80% band, and the review was
                        escalated for a manual benchmark decision — so it is not written by this screen.
                      </p>
                      {circuit.postInstallWindowStartAt && (
                        <MonitoringWindowPanel
                          circuitId={circuit.id}
                          windowType="post_install"
                          windowStartAt={circuit.postInstallWindowStartAt?.toISOString() ?? null}
                          title="Post-install monitoring window"
                          readings={postInstallReadings}
                          validCount={postInstallValidCount}
                          pendingAnomaly={postInstallPendingAnomaly}
                          canEdit={false}
                          embedded
                        />
                      )}
                    </div>
                  );
                } else if (usesLegacyFlow) {
                  chip = circuit.postInstallWindowStartAt ? (
                    <StatusChip tone={postInstallPendingAnomaly ? "warn" : "info"}>
                      {postInstallPendingAnomaly ? "Anomaly open" : `Day ${postInstallValidCount} of 5`}
                    </StatusChip>
                  ) : null;
                  body = circuit.postInstallWindowStartAt ? (
                    <MonitoringWindowPanel
                      circuitId={circuit.id}
                      windowType="post_install"
                      windowStartAt={circuit.postInstallWindowStartAt?.toISOString() ?? null}
                      title="Post-install monitoring window"
                      readings={postInstallReadings}
                      validCount={postInstallValidCount}
                      pendingAnomaly={postInstallPendingAnomaly}
                      canEdit={canEdit}
                      embedded
                    />
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">The window has not started yet.</p>
                  );
                } else {
                  body = canEdit ? (
                    <CircuitReadingPanel circuitId={circuit.id} />
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      Awaiting PER-04 to upload the post-installation readings.
                    </p>
                  );
                }
              } else if (step.status === "done" && circuit.benchmarkSavingsPct != null) {
                summary = `Benchmark confirmed — ${circuit.benchmarkSavingsPct.toFixed(
                  1,
                )}% savings, fixed for the contract term`;
                if (circuit.postInstallWindowStartAt && postInstallReadings.length > 0) {
                  body = (
                    <MonitoringWindowPanel
                      circuitId={circuit.id}
                      windowType="post_install"
                      windowStartAt={circuit.postInstallWindowStartAt?.toISOString() ?? null}
                      title="Post-install monitoring window"
                      readings={postInstallReadings}
                      validCount={postInstallValidCount}
                      pendingAnomaly={postInstallPendingAnomaly}
                      canEdit={false}
                      embedded
                    />
                  );
                }
              }
              break;
            }
          }

          return (
            <StepSection key={step.key} index={i + 1} title={step.title} status={step.status} summary={summary} chip={chip}>
              {body}
            </StepSection>
          );
        })}
      </div>

      {/* CON-45 — every stored daily reading, phase-grouped, with the
          persistent exclusion control and (once the benchmark is confirmed)
          the monthly monitoring upload. */}
      {circuit.meterInstalledAt && !usesLegacyFlow && (
        <section className="max-w-2xl mb-10 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold mb-1">Meter readings</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Every day the meter has reported, as reviewed and saved. Excluded days stay listed with
              their reason and never count toward an average or a report.
            </p>
            {/* CON-45 — the three reports, each appearing once its phase has
                data. Print-styled routes rendering straight from the store. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
              {storedReadings.some((r) => r.phase === "pre_install") && (
                <Link href={`/admin/societies/${id}/circuits/${circuit.id}/reports/pre-install`} className="underline">
                  Pre-installation report
                </Link>
              )}
              {circuit.lightReplacementDate && storedReadings.some((r) => r.phase !== "pre_install") && (
                <Link href={`/admin/societies/${id}/circuits/${circuit.id}/reports/post-install`} className="underline">
                  Post-installation savings report
                </Link>
              )}
              {storedReadings.some((r) => r.phase === "monitoring") && (
                <Link href={`/admin/societies/${id}/circuits/${circuit.id}/reports/monthly`} className="underline">
                  Monthly savings report
                </Link>
              )}
            </div>
          </div>
          {circuit.benchmarkSavingsPct !== null && (
            <div>
              <h3 className="text-sm font-medium mb-2">Upload this month&apos;s readings</h3>
              {canOverride ? (
                <CircuitReadingPanel circuitId={circuit.id} />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Monthly monitoring readings feed billing — uploading them is an operations-lead
                  action.
                </p>
              )}
            </div>
          )}
          <StoredReadingsPanel
            readings={storedReadings}
            canEdit={canEdit}
            summaries={phaseSummaries}
          />
        </section>
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
            // The form is an occasional maintenance act, not the circuit's
            // current step — closed until someone actually needs it, same
            // arrangement as the step accordion above.
            <details className="group">
              <summary className="text-sm underline cursor-pointer select-none text-[var(--text-muted)] list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Record a verified light-count change</span>
                <span className="hidden group-open:inline">Close</span>
              </summary>
              <div className="mt-3">
                <RescaleForm
                  circuitId={circuit.id}
                  currentLightCount={circuit.meteredLightCount}
                  effectiveBaseline={effectiveBaseline}
                />
              </div>
            </details>
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
