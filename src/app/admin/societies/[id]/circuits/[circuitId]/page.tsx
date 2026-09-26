import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo-mode";
import { Card, EmptyState, PageHeader, PageRibbon, Stat, StatRow, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, GATE_PASS_STATUS, statusMeta } from "@/lib/status-maps";
import { GatePassForm } from "./gate-pass-form";
import { GatePassApproval } from "./gate-pass-approval";
import { LightReplacementForm, ReplacementRecord } from "./light-replacement-form";
import { ReplacementDateForm } from "./replacement-date-form";
import { RescaleRowActions } from "./rescale-row-actions";
import { RescaleForm } from "./rescale-form";
import { DemoReviewPanel } from "./demo-review-panel";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { inventoryCountFor } from "@/lib/light-type";
import { RepresentedCountForm } from "./represented-count-form";
import { RESOLUTION_LABEL, reviewUrgency } from "@/lib/demo-result-review";
import { requireAdminPage } from "@/lib/admin-permissions";
import { formatDate } from "@/lib/format-date";
import { AssignReplacement } from "./assign-replacement";
import { VisitDetails } from "@/components/visit-details";
import { teamMeta, teamsFor } from "@/lib/admin-teams";
import { isoDate, isoDateTimeLocal } from "@/lib/format-date";
import { StepSection } from "@/components/step-section";
import { LoadInventoryPanel, type InventoryLine } from "./load-inventory-panel";
import { DemosPanel, type DemoDTO } from "./demos-panel";
import { DemoMeterForm } from "./demo-meter-form";
import { SurveyDateControl } from "@/components/survey-date-control";
import { surveyHappenedAt } from "@/lib/step-dates";
import { DemoReadingsPanel, type DemoDayDTO } from "./demo-readings-panel";
import { DemoLockBar } from "./demo-lock-bar";
import { liveMonitoringBlocker } from "@/lib/live-monitoring";
import { exclusionFromDevices, theoreticalDailyKwh } from "@/lib/circuit-load";
import { MAX_DEMOS_PER_CIRCUIT } from "@/lib/deal-scope";
import { currentDemoOf, demoFacts, demoFactsInclude, latestAcceptance, LOAD_TOLERANCE_PCT } from "@/lib/circuit-figures";
import { demoComplete, demoSteps } from "@/lib/demo-steps";
import { demoLockState } from "@/lib/demo-lock";
import { changedSince, type AcceptanceDay } from "@/lib/demo-acceptance";
import { missingDays } from "@/lib/demo-readings-fill";
import { periodOfDay, suggestedPeriod } from "@/lib/demo-periods";
import { circuitLabelOf } from "@/lib/circuit-label";

function GatePassCard({
  gatePass,
  canOverride,
}: {
  gatePass: { id: string; status: string; itemsJson: unknown; photoUrl: string | null; rejectedReason: string | null };
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

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function CircuitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; circuitId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const session = await requireAdminPage();
  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin/societies");
  const canEdit = session.user.adminPermissions?.includes("manage_survey") ?? false;
  const demoMode = await isDemoMode();
  const canOverride =
    (session.user.adminPermissions?.includes("manage_survey") ?? false) &&
    (session.user.adminPermissions?.includes("manage_pipeline") ?? false);

  const { id, circuitId } = await params;
  const sp = await searchParams;
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      society: true,
      siteSurvey: {
        select: {
          pipelineId: true,
          createdAt: true,
          pipeline: {
            select: {
              surveyOwnerId: true,
              scheduledEvents: {
                where: { kind: "survey_visit", status: { not: "cancelled" } },
                orderBy: { startAt: "asc" },
                take: 1,
                select: { startAt: true },
              },
            },
          },
          areas: { select: { lightType: true, count: true } },
        },
      },
      rescaleEvents: { orderBy: { effectiveDate: "asc" }, include: { recordedBy: true, voidedBy: true } },
      voidedBy: { select: { name: true, email: true } },
      demoResultReviews: {
        orderBy: { raisedAt: "desc" },
        include: { resolvedBy: { select: { name: true, email: true } } },
      },
      devices: {
        orderBy: { createdAt: "asc" },
        include: { deviceType: { select: { name: true } }, replacementType: { select: { name: true } } },
      },
      demos: {
        where: { voidedAt: null },
        orderBy: { sequence: "asc" },
        include: {
          ...demoFactsInclude,
          replacementOwner: { select: { id: true, name: true, email: true, team: true } },
          replacementAssignedBy: { select: { name: true, email: true } },
          unlockedBy: { select: { name: true, email: true } },
          meter: { select: { id: true, name: true } },
          gatePasses: { orderBy: { submittedAt: "desc" } },
          scheduledEvents: { where: { kind: "installation_day" }, orderBy: { startAt: "asc" } },
          readings: { orderBy: { date: "asc" } },
          acceptances: { orderBy: { version: "desc" } },
        },
      },
    },
  });
  if (!circuit || circuit.societyId !== id) notFound();

  const eligible = circuit.state !== "surveyed" && circuit.state !== "ineligible";
  const pipelineId = circuit.siteSurvey?.pipelineId ?? null;
  const sharedIds = new Set(
    pipelineId
      ? (await db.demoReport.findMany({ where: { pipelineId, status: "shared" }, select: { demoIds: true } })).flatMap((r) => r.demoIds)
      : [],
  );
  const now = new Date();
  const lockOf = (d: { id: string; unlockedUntil: Date | null }) =>
    demoLockState({ sharedInReport: sharedIds.has(d.id), unlockedUntil: d.unlockedUntil, demoMode, now });

  // Demos removed as duplicates stay on record, listed under the table.
  const removedDemos = await db.circuitDemo.findMany({
    where: { circuitId: circuit.id, voidedAt: { not: null } },
    orderBy: { sequence: "asc" },
    select: { id: true, sequence: true, voidReason: true, voidedAt: true, voidedById: true },
  });
  const removers = new Map(
    (
      await db.adminUser.findMany({
        where: { id: { in: removedDemos.map((d) => d.voidedById).filter((x): x is string => !!x) } },
        select: { id: true, name: true, email: true },
      })
    ).map((u) => [u.id, u.name ?? u.email]),
  );
  const demo = circuit.demos.find((d) => d.id === sp.demo) ?? currentDemoOf(circuit.demos);
  const exclusion = exclusionFromDevices(circuit.devices);
  const facts = demo ? demoFacts(demo, eligible, exclusion) : null;
  const lock = demo ? lockOf(demo) : null;
  const editable = canEdit && !circuit.voidedAt && (lock?.editable ?? false);
  const base = `/admin/societies/${id}/circuits/${circuit.id}`;

  const demoDTOs: DemoDTO[] = circuit.demos.map((d) => {
    const f = demoFacts(d, eligible, exclusion);
    return {
      id: d.id,
      sequence: d.sequence,
      combine: d.combine,
      meteredLightCount: d.meteredLightCount,
      preAverage: f.preAverage,
      postAverage: f.postAverage,
      savingsPct: f.savingsPct,
      rejected: d.rejected,
      rejectionReason: d.rejectionReason,
      complete: demoComplete(f),
      locked: !lockOf(d).editable,
      href: `${base}?demo=${d.id}`,
      current: d.id === demo?.id,
    };
  });
  const anyAccepted = demoDTOs.some((d) => !d.rejected && d.preAverage !== null);
  const agreedPending = !anyAccepted && (circuit.preInstallBaseline !== null || circuit.benchmarkSavingsPct !== null);

  const catalogOriginals = await db.deviceType.findMany({
    where: { role: "original", active: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, defaultWattage: true },
  });
  const replacementOptionRows = await db.deviceReplacementOption.findMany({
    where: { originalTypeId: { in: circuit.devices.map((d) => d.deviceTypeId) } },
    include: { replacement: { select: { id: true, name: true, defaultWattage: true, active: true } } },
  });
  const replacementFormLines = circuit.devices.map((l) => ({
    lineId: l.id,
    deviceName: l.deviceType.name,
    count: l.count,
    wattage: l.wattage,
    hoursPerDay: l.hoursPerDay,
    deviceTypeId: l.deviceTypeId,
    // Marked at the survey as not part of the retrofit: opens as excluded.
    excluded: l.excludedFromCalculation,
    recorded: l.replacedAt
      ? { replacementTypeId: l.replacementTypeId, replacementCount: l.replacementCount, replacementWattage: l.replacementWattage }
      : null,
    options: replacementOptionRows
      .filter((o) => o.originalTypeId === l.deviceTypeId && o.replacement.active)
      .map((o) => ({ id: o.replacement.id, name: o.replacement.name, defaultWattage: o.replacement.defaultWattage })),
  }));
  const inventoryLines: InventoryLine[] = circuit.devices.map((l) => ({
    id: l.id,
    deviceTypeId: l.deviceTypeId,
    deviceTypeName: l.deviceType.name,
    count: l.count,
    wattage: l.wattage,
    hoursPerDay: l.hoursPerDay,
    historical: l.historical,
    excluded: l.excludedFromCalculation,
    note: l.note,
    replacementName: l.replacementType?.name ?? null,
    replacementCount: l.replacementCount,
    replacementWattage: l.replacementWattage,
  }));
  const theoretical = circuit.devices.length > 0 ? theoreticalDailyKwh(circuit.devices) : null;
  const anyMeterInstalled = circuit.demos.some((d) => d.meterInstalledAt !== null);
  const anyReplaced = circuit.demos.some((d) => d.lightReplacementDate !== null);

  const meters = await db.meterDevice.findMany({
    where: { hasEnergySignal: true, removedFromAccountAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, circuit: { select: { id: true, location: true, lightType: true, society: { select: { name: true } } } } },
  });
  const meterOptions = meters.map((m) => ({
    id: m.id,
    label: m.name,
    sublabel: m.circuit ? (m.circuit.id === circuit.id ? "on this circuit" : `now on ${m.circuit.society.name} · ${circuitLabelOf(m.circuit.location, m.circuit.lightType)}`) : "not on any circuit",
  }));
  const fieldCandidates = await db.adminUser.findMany({
    where: { team: { in: teamsFor("survey") }, permissions: { has: "manage_survey" }, isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true, team: true },
    orderBy: { name: "asc" },
  });

  const installationSignedOff = pipelineId
    ? await db.pipeline
        .findUnique({ where: { id: pipelineId }, select: { stage: true, installationProject: { select: { certificate: { select: { id: true } } } } } })
        .then((pl) => pl?.stage === "active_billing" || !!pl?.installationProject?.certificate)
    : false;

  const effectiveBaseline = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, now);
  const effBaselineNow = effectiveBaseline;
  const liveRescaleEvents = circuit.rescaleEvents.filter((e) => !e.voidedAt);
  const voidedRescaleEvents = circuit.rescaleEvents.filter((e) => e.voidedAt);
  const openReview = demo ? (circuit.demoResultReviews.find((r) => r.state === "open" && (r.demoId === demo.id || r.demoId === null)) ?? null) : null;
  const resolvedReviews = circuit.demoResultReviews.filter((r) => r.state === "resolved");
  const urgency = openReview ? reviewUrgency({ raisedAt: openReview.raisedAt, occurrence: openReview.occurrence, now }) : null;
  const state = statusMeta(CIRCUIT_STATE, circuit.state);

  const surveyTotals = new Map<string, { label: string; lights: number }>();
  for (const a of circuit.siteSurvey?.areas ?? []) {
    const e = surveyTotals.get(a.lightType) ?? { label: a.lightType, lights: 0 };
    e.lights += a.count;
    surveyTotals.set(a.lightType, e);
  }
  const surveyInventoryCount = inventoryCountFor(circuit.lightType, [...surveyTotals.values()]);
  const representedMismatch = surveyInventoryCount !== null && surveyInventoryCount !== circuit.representedLightCount;
  const surveyHref = pipelineId ? `/admin/pipeline/${pipelineId}/survey` : null;

  // One period of the chosen demo, as the readings panel reads it.
  const periodDTO = demo ? { preFrom: iso(demo.preFrom), preTo: iso(demo.preTo), postFrom: iso(demo.postFrom), postTo: iso(demo.postTo) } : null;
  const readingsFor = (phase: "pre" | "post") => {
    if (!demo) return null;
    const acc = latestAcceptance(demo.acceptances, phase);
    const live = acc && acc.averageKwh !== null ? acc : null;
    const rows = demo.readings.filter((r) => r.phase === phase && periodOfDay(r.date, demo) === phase);
    const changed = new Set(live ? changedSince(live.days as AcceptanceDay[], rows) : []);
    const from = phase === "pre" ? demo.preFrom : demo.postFrom;
    const to = phase === "pre" ? demo.preTo : demo.postTo;
    const days: DemoDayDTO[] = rows.map((r) => {
      const key = r.date.toISOString().slice(0, 10);
      return {
        id: r.id,
        date: key,
        kWh: r.kWh,
        source: r.source,
        meterKwh: r.meterKwh,
        hoursCovered: r.hoursCovered,
        dataHours: r.dataHours,
        excluded: r.excludedAt !== null,
        excludedReason: r.excludedReason,
        changedSinceAccept: changed.has(key),
      };
    });
    return {
      days,
      missing: from && to ? missingDays({ from, to }, rows).map((d) => d.toISOString().slice(0, 10)) : [],
      accepted: live ? { version: live.version, averageKwh: live.averageKwh, countedDays: live.countedDays, at: "" } : null,
      suggested: suggestedPeriod(phase, { meterInstalledAt: demo.meterInstalledAt, lightReplacementDate: demo.lightReplacementDate }, now),
    };
  };

  const steps = facts ? demoSteps(facts) : [];
  const visit = demo?.scheduledEvents.find((e) => e.status === "scheduled") ?? null;
  const ownerName = demo?.replacementOwner ? (demo.replacementOwner.name ?? demo.replacementOwner.email) : null;
  const isAssignee = demo?.replacementOwnerId === session.user.id;
  const canAssign = canOverride || circuit.siteSurvey?.pipeline?.surveyOwnerId === session.user.id;
  const readOnly = (what: string) => <p className="text-sm text-[var(--text-muted)]">{what}</p>;
  const lockedNote = lock && !lock.editable ? "Locked — the demo's report has been shared. Operations can unlock it for correction." : null;

  return (
    <>
      {circuit.voidedAt && (
        <PageRibbon tone="bad">
          This circuit was removed by {circuit.voidedBy?.name ?? circuit.voidedBy?.email ?? "—"} on{" "}
          <span className="num">{formatDate(circuit.voidedAt)}</span> — {circuit.voidReason}. It is excluded from the registry,
          the monitoring board and every billing run. The record is kept, and the operations lead can restore it from the registry.
        </PageRibbon>
      )}

      <PageHeader
        backHref={`/admin/societies/${id}/circuits`}
        title={circuit.location || circuit.lightType}
        subtitle={`${circuit.lightType} · ${circuit.meteredLightCount} metered of ${circuit.representedLightCount} represented`}
        chip={<StatusChip tone={state.tone}>{state.label}</StatusChip>}
      />

      {/* CON-11: the fee is computed on the REPRESENTED count by extrapolating
          this circuit's measured saving to every light of its type. A circuit
          left representing only its own lights prices as though the demo were
          the whole society — Indiabulls Centrum Park was offered at 50 of
          2,000 (user-caught 2026-09-08). The figure is stated with its factor,
          and checked against the survey's own inventory. */}
      <div className="mb-6 space-y-2">
        {representedMismatch && (
          <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
            This circuit represents{" "}
            <span className="num">{circuit.representedLightCount.toLocaleString("en-IN")}</span>{" "}
            lights, but the site survey counted{" "}
            <span className="num">{surveyInventoryCount!.toLocaleString("en-IN")}</span> of this
            type across the society. The monthly fee is computed on the represented figure.
          </p>
        )}
        {/* Only where the figure is actually wrong. A correction control on
            every circuit is noise on the ones that are right — "this correct
            the represented count option should come as button only and on the
            offer page or where it is incorrect" (the user, 2026-09-08). The
            circuit registry keeps the general edit for everything else. */}
        {canOverride && representedMismatch && (
          <RepresentedCountForm
            circuitId={circuit.id}
            current={circuit.representedLightCount}
            meteredLightCount={circuit.meteredLightCount}
            inventoryCount={surveyInventoryCount}
          />
        )}
      </div>


      <StatRow>
        {[
          { label: "Theoretical", value: theoretical === null ? "—" : theoretical.toFixed(2), unit: theoretical === null ? "no inventory" : "kWh/day" },
          {
            label: "Baseline",
            value: circuit.preInstallBaseline === null ? "—" : circuit.preInstallBaseline.toFixed(2),
            unit: circuit.preInstallBaseline === null ? "no accepted demo" : agreedPending ? "kWh/day · agreed, demo pending" : "kWh/day · from accepted demos",
          },
          {
            label: "In force now",
            value: effBaselineNow === null ? "—" : effBaselineNow.toFixed(2),
            unit: effBaselineNow === null ? "no baseline" : liveRescaleEvents.length > 0 ? `after ${liveRescaleEvents.length} rescale${liveRescaleEvents.length === 1 ? "" : "s"}` : "unchanged",
          },
          {
            label: "Benchmark",
            value: circuit.benchmarkSavingsPct === null ? "—" : `${circuit.benchmarkSavingsPct.toFixed(1)}%`,
            unit: circuit.benchmarkSavingsPct === null ? "not confirmed" : agreedPending ? "agreed, demo pending" : "fixed for the term",
          },
        ].map((f) => (
          <Stat key={f.label} label={f.label} value={f.value} detail={f.unit} />
        ))}
      </StatRow>

      {/* CON-45 — what hangs off this circuit, and the theoretical daily
          figure every pre-installation reading is judged against. Editable
          until the lights are replaced, frozen after — the inventory is what
          the replacement was recorded against. */}
      <section className="max-w-none mb-8">
        {/* Only while the inventory is still being built. Once it is locked
            the panel folds to a header carrying its own figure, and this
            explanation of a rule nobody can act on any more is just noise
            above it. */}
        {!anyMeterInstalled && (
          <>
            <h2 className="text-[15px] font-semibold mb-1">Load inventory</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              Σ count × wattage × hours ÷ 1000 is the theoretical kWh/day. A pre-install reading
              outside ±5% of it is flagged; outside ±10% is a warning — the check that nothing
              unknown is consuming on this circuit.
            </p>
          </>
        )}
        <LoadInventoryPanel
          circuitId={circuit.id}
          lines={inventoryLines}
          catalog={catalogOriginals}
          // The inventory now locks at METER INSTALL, not at light
          // replacement (user's rule, 2026-08-19). From the moment the meter
          // is in, every pre-install reading is judged against the
          // theoretical figure these lines produce — so changing them after
          // that silently moves the basis those readings were compared to.
          editable={canEdit && !anyMeterInstalled && !circuit.voidedAt}
          frozenReason={
            anyMeterInstalled
              ? (anyReplaced
                  ? "The meter is installed and the lights have been replaced — the inventory is locked as the record both were measured against."
                  : "The meter is installed — the inventory is locked, because every pre-install reading is judged against the theoretical figure it produces.") +
                // Say which of the two is true, rather than telling the
                // operator to contact an administrator while a control that
                // does the thing is rendered a line below.
                // Only mention the backfill when it is the thing to do: on a
                // locked circuit that has no inventory at all. With lines
                // already recorded it is folded away, and advertising it in
                // the locked notice contradicts the notice.
                (demoMode && inventoryLines.length === 0
                  ? " Demo mode allows the past record to be added below; normal operation does not."
                  : canOverride
                    ? " A count that was typed wrong can be corrected on its line."
                    : " An operations lead can correct a count that was typed wrong.")
              : canEdit
                ? null
                : "Recording the load inventory is the field team\u2019s action."
          }
          // Backfilling a past record is a DEMO-mode affordance now. In normal
          // operation a locked inventory stays locked and the change goes
          // through an administrator, which is what the frozen message says.
          canRecordHistorical={canEdit && !circuit.voidedAt && demoMode}
          canCorrectCount={canOverride && anyMeterInstalled && !circuit.voidedAt}
        />
      </section>


      <DemosPanel
        circuitId={circuit.id}
        demos={demoDTOs}
        circuitBaseline={circuit.preInstallBaseline}
        circuitBenchmark={circuit.benchmarkSavingsPct}
        meteredLightCount={circuit.meteredLightCount}
        overridePct={circuit.benchmarkOverridePct}
        overrideReason={circuit.benchmarkOverrideReason}
        canStart={canEdit && !circuit.voidedAt && eligible}
        canDecide={canOverride && !circuit.voidedAt}
        canChangeLights={demoMode && canEdit && !circuit.voidedAt}
        exclusion={exclusion}
        maxDemos={MAX_DEMOS_PER_CIRCUIT}
        agreedPending={agreedPending}
        removed={removedDemos.map((d) => ({
          id: d.id,
          sequence: d.sequence,
          reason: d.voidReason ?? "",
          on: formatDate(d.voidedAt!),
          by: d.voidedById ? (removers.get(d.voidedById) ?? null) : null,
        }))}
      />

      {!eligible && (
        <Card className="p-5 mb-6">
          <p className="text-sm text-[var(--text-muted)]">
            The eligibility decision happens on the{" "}
            {surveyHref ? (
              <Link href={surveyHref} className="underline">
                survey page
              </Link>
            ) : (
              "survey page"
            )}
            . A demo starts once the circuit passes it.
          </p>
        </Card>
      )}

      {demo && facts && lock && (
        <section className="max-w-none mb-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">Demo {demo.sequence} — commissioning</h2>
            {demo.rejected && <StatusChip tone="bad">Rejected</StatusChip>}
          </div>
          <DemoLockBar
            demoId={demo.id}
            why={lock.why}
            unlockedUntil={demo.unlockedUntil?.toISOString() ?? null}
            unlockedBy={demo.unlockedBy ? (demo.unlockedBy.name ?? demo.unlockedBy.email) : null}
            unlockReason={demo.unlockReason}
            canUnlock={canOverride}
          />
          {steps.map((step, i) => {
            let summary: string = step.summary;
            let chip: ReactNode = null;
            let body: ReactNode = null;
            switch (step.key) {
              case "eligibility":
                body = readOnly("Decided on the survey page.");
                break;
              case "meter": {
                const failed = demo.loadDiscrepancyPct !== null && demo.loadDiscrepancyPct > LOAD_TOLERANCE_PCT && !demo.loadValidationOverrideById ? demo.loadDiscrepancyPct : null;
                const surveyed = circuit.siteSurvey
                  ? surveyHappenedAt({
                      visitAt: circuit.siteSurvey.pipeline?.scheduledEvents[0]?.startAt ?? null,
                      rowCreatedAt: circuit.siteSurvey.createdAt,
                    })
                  : null;
                const form = editable ? (
                  <div className="space-y-3">
                  {surveyed && circuit.siteSurvey && (
                    <SurveyDateControl
                      pipelineId={circuit.siteSurvey.pipelineId}
                      surveyDate={surveyed.date ? iso(surveyed.date) : null}
                      label={surveyed.label}
                      canCorrect={canOverride}
                    />
                  )}
                  <DemoMeterForm
                    demoId={demo.id}
                    meters={meterOptions}
                    meteredLightCount={demo.meteredLightCount}
                    wattage={circuit.wattage}
                    inventory={circuit.devices.map((l) => ({ name: l.deviceType.name, count: l.count, wattage: l.wattage }))}
                    canOverride={canOverride}
                    failedPct={failed}
                    initial={{
                      meterId: demo.meterId,
                      installedOn: iso(demo.meterInstalledAt) || new Date().toISOString().slice(0, 10),
                      displayedLoad: demo.meterDisplayedLoad === null ? "" : String(demo.meterDisplayedLoad),
                      skipped: demo.meterSkipped,
                    }}
                  />
                  </div>
                ) : null;
                const record = demo.meterInstalledAt ? (
                  <div className="text-sm space-y-1">
                    <p>
                      {demo.meterSkipped ? "No meter — days typed from the paper report" : `Meter ${demo.meter?.name ?? "—"}`} · installed{" "}
                      <span className="num">{formatDate(demo.meterInstalledAt)}</span>
                      {demo.meterDisplayedLoad !== null && demo.loadDiscrepancyPct !== null && (
                        <span className="text-[var(--text-muted)]">
                          {" "}
                          · load {demo.meterDisplayedLoad} W ({demo.loadDiscrepancyPct.toFixed(1)}% from theoretical)
                        </span>
                      )}
                    </p>
                    {demo.loadValidationOverrideById && <p className="text-[var(--text-muted)]">Load test overridden by operations — {demo.loadValidationOverrideReason}</p>}
                  </div>
                ) : null;
                if (demo.loadValidationOverrideById) summary = "Load test overridden by operations";
                body = step.status === "done" ? (
                  <div className="space-y-3">
                    {record}
                    {editable && (
                      <details>
                        <summary className="text-sm underline cursor-pointer text-[var(--text-muted)]">Correct the meter or its install date</summary>
                        <div className="mt-3">{form}</div>
                      </details>
                    )}
                  </div>
                ) : (
                  form ?? readOnly(lockedNote ?? "Meter installation and the load test are the field team's action.")
                );
                break;
              }
              case "install-gate":
              case "completion-gate": {
                const kind = step.key === "install-gate" ? "demo_install" : "demo_install_completion";
                const pass = demo.gatePasses.find((g) => g.kind === kind);
                if (pass) {
                  const meta = statusMeta(GATE_PASS_STATUS, pass.status);
                  chip = <StatusChip tone={meta.tone}>{meta.label}</StatusChip>;
                  summary = "";
                  body = <GatePassCard gatePass={pass} canOverride={canOverride} />;
                } else if (step.status === "current") {
                  body = editable ? <GatePassForm demoId={demo.id} kind={kind} /> : readOnly(lockedNote ?? "Awaiting the field team to submit the gate pass on site.");
                }
                break;
              }
              case "pre-readings":
              case "post-readings": {
                const phase = step.key === "pre-readings" ? "pre" : "post";
                const r = readingsFor(phase);
                if (step.status !== "locked" && r && periodDTO) {
                  body = (
                    <div className="space-y-3">
                      <DemoReadingsPanel
                        demoId={demo.id}
                        phase={phase}
                        editable={editable}
                        periods={periodDTO}
                        suggested={r.suggested}
                        days={r.days}
                        missing={r.missing}
                        accepted={r.accepted}
                        theoretical={theoretical}
                        baseline={facts.preAverage}
                        exclusion={exclusion}
                      />
                      {/* The report is built from the accepted days each time it
                          opens, so it is never stale and there is nothing to
                          regenerate — which the screen has to say, or its
                          absence reads as a missing button (2026-09-27). */}
                      {r.accepted ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <Link href={`${base}/reports/${phase === "pre" ? "pre-install" : "post-install"}?demo=${demo.id}`} className="btn-secondary btn-sm">
                            {phase === "pre" ? "Open the pre-installation report" : "Open the post-installation savings report"}
                          </Link>
                          <span className="text-xs text-[var(--text-muted)]">
                            Built from the accepted days each time it opens — it always shows the current figures; there is nothing to regenerate.
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">
                          The {phase === "pre" ? "pre-installation" : "post-installation savings"} report opens once these days are accepted.
                        </p>
                      )}
                      {phase === "post" && openReview && urgency && (
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
                      )}
                    </div>
                  );
                }
                if (phase === "post" && openReview && urgency) chip = <StatusChip tone={urgency.tone}>{urgency.label}</StatusChip>;
                break;
              }
              case "assign-replacement": {
                if (step.status !== "locked") {
                  body = (
                    <div className="space-y-5">
                      {ownerName && (
                        <VisitDetails
                          visit={{
                            assigneeName: ownerName,
                            assigneeTeam: demo.replacementOwner ? teamMeta(demo.replacementOwner.team).label : "—",
                            assignedAt: demo.replacementAssignedAt,
                            assignedByName: demo.replacementAssignedBy?.name ?? demo.replacementAssignedBy?.email ?? null,
                            scheduledAt: visit?.startAt ?? null,
                            contactName: visit?.contactName ?? null,
                            contactPhone: visit?.contactPhone ?? null,
                            note: visit?.note ?? null,
                            leadContactName: circuit.society.name,
                            leadContactPhone: null,
                          }}
                        />
                      )}
                      {editable && (canAssign || isAssignee) ? (
                        <AssignReplacement
                          demoId={demo.id}
                          current={demo.replacementOwnerId && ownerName ? { id: demo.replacementOwnerId, name: ownerName } : null}
                          candidates={fieldCandidates.map((c) => ({ id: c.id, name: c.name ?? c.email, team: teamMeta(c.team).label }))}
                          visit={{
                            scheduledAt: isoDateTimeLocal(visit?.startAt ?? null),
                            contactName: visit?.contactName ?? "",
                            contactPhone: visit?.contactPhone ?? "",
                            note: visit?.note ?? "",
                          }}
                          canArrange={isAssignee || canOverride}
                        />
                      ) : (
                        readOnly(lockedNote ?? "Operations, or whoever is holding this deal's field work, hands the replacement to a crew.")
                      )}
                    </div>
                  );
                }
                break;
              }
              case "replacement": {
                if (step.status === "current") {
                  body = editable ? (
                    <div className="space-y-4">
                      {ownerName && !isAssignee && (
                        <PageRibbon tone="warn">
                          <strong>Assigned to {ownerName}.</strong> They are doing this replacement. You can record it for them, but
                          only if the work has actually been done.
                        </PageRibbon>
                      )}
                      <LightReplacementForm demoId={demo.id} lines={replacementFormLines} />
                    </div>
                  ) : (
                    readOnly(lockedNote ?? (ownerName ? `Awaiting ${ownerName} to record the replacement.` : "Awaiting the field team."))
                  );
                } else if (step.status === "done" && demo.lightReplacementDate) {
                  body = (
                    <div className="space-y-4">
                      <ReplacementRecord
                        demoId={demo.id}
                        lines={replacementFormLines}
                        date={isoDate(demo.lightReplacementDate)}
                        canCorrect={editable}
                      />
                      {editable && <ReplacementDateForm demoId={demo.id} current={isoDate(demo.lightReplacementDate)} />}
                    </div>
                  );
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
        </section>
      )}

      {circuit.benchmarkSavingsPct !== null && (
        <p className="text-sm mb-8">
          {liveMonitoringBlocker({ benchmarkSavingsPct: circuit.benchmarkSavingsPct, installationCertificateSigned: installationSignedOff }) === null ? (
            <>
              <Link href={`/admin/live-monitoring/${circuit.id}`} className="underline font-medium">
                Live monitoring →
              </Link>{" "}
              <span className="text-[var(--text-muted)]">— this circuit is live; its monthly readings count from the billing start.</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">
              {liveMonitoringBlocker({ benchmarkSavingsPct: circuit.benchmarkSavingsPct, installationCertificateSigned: installationSignedOff })}
            </span>
          )}
        </p>
      )}

      {resolvedReviews.length > 0 && (
        <section className="max-w-none mb-10">
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
        <section className="max-w-none mt-10">
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
                      <td className="num">{formatDate(e.effectiveDate)}</td>
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
                        <span className="num text-xs">{formatDate(e.recordedAt)}</span>
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
                        <td className="num">{formatDate(e.effectiveDate)}</td>
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
              Recording a verified light-count change is an operations action.
            </p>
          )}
        </section>
      )}

    </>
  );
}
