import { Fragment } from "react";
import { formatDate, isoDate } from "@/lib/format-date";
import { dealLabel } from "@/lib/deal-scope";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { keptAtDemoOf } from "@/lib/circuit-load";
import { alreadyInstalledCount } from "@/lib/installation-scope";
import { describeTally, installationTally } from "@/lib/installation-tally";
import { MAX_PHASES, loggedThrough, phaseFigures, phaseOfDay, type PhaseDay, type PhaseRecord } from "@/lib/installation-phases";
import { circuitName } from "@/lib/circuit-label";
import { demoBypass, isDemoMode } from "@/lib/demo-mode";
import { requireAdminPage } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { loadDealProgress } from "@/lib/pipeline-facts";
import { AddPortalAccountButton } from "@/components/add-portal-account-button";
import { NextStepCallout, StepComplete } from "@/components/deal-stepper";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import {
  BATCH_STATE,
  BLOCKER_STATUS,
  BLOCKER_TYPE_LABEL,
  DAY_GATE_STATUS,
  INSTALLATION_PROJECT_STATE,
  statusMeta,
} from "@/lib/status-maps";
import {
  completionBlockers,
  describeCompletionBlocker,
  evaluateDayGateChain,
  type BatchGateInput,
} from "@/lib/installation-gate";
import { publicS3Url } from "@/lib/s3";
import {
  AddPlannedDayForm,
  BatchCaptureForm,
  PhaseSignoffControl,
  CorrectPhaseControl,
  PlannedDayActions,
  ProjectSetupForm,
  RaiseBlockerForm,
  CorrectContractedCountControl,
  CorrectDatesControl,
  KeptOutcomeCard,
  type KeptLine,
  ReopenBatchControl,
  ResolveBlockerControls,
  SkipGateForm,
  StartBatchButton,
} from "./installation-controls";

function day(d: Date | null | undefined) {
  return formatDate(d);
}
function time(d: Date) {
  return d.toISOString().slice(11, 16);
}

export default async function InstallationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  if (!perms.includes("manage_pipeline") && !perms.includes("manage_survey")) redirect("/admin");
  const isOps = perms.includes("manage_pipeline") && perms.includes("manage_survey");
  const isField = perms.includes("manage_survey");
  // Correcting a recorded date (2026-09-27): data entry before go-live, an
  // operations act with a reason after it.
  const demoMode = await isDemoMode();
  // Correcting any row (2026-11-26, user's rule): every admin who works on
  // installations until the completion certificate is generated, then only
  // the main admin account. Settled once the project is loaded, below.
  let canCorrectDates = perms.includes("manage_survey") || perms.includes("manage_pipeline");
  const todayIso = new Date().toISOString().slice(0, 10);
  // Every line on this deal's circuits that kept fixtures at the demo.
  const keptCircuits = await db.circuit.findMany({
    where: { siteSurvey: { pipelineId: (await params).id }, voidedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      location: true,
      lightType: true, name: true,
      devices: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          count: true,
          excludedFromCalculation: true,
          replacementCount: true,
          keptReplacedCount: true,
          keptRemovedCount: true,
          keptRecordedAt: true,
          deviceType: { select: { name: true } },
        },
      },
    },
  });
  const keptLines: KeptLine[] = keptCircuits.flatMap((c) =>
    c.devices
      .filter((d) => keptAtDemoOf(d) > 0)
      .map((d) => ({
        deviceId: d.id,
        circuitLabel: circuitName(c),
        name: d.deviceType.name,
        kept: keptAtDemoOf(d),
        recorded: d.keptRecordedAt ? { replaced: d.keptReplacedCount ?? 0, removed: d.keptRemovedCount ?? 0 } : null,
      })),
  );

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      contract: true,
      siteSurvey: { include: { areas: { where: { voidedAt: null } } } },
      installationProject: {
        include: {
          onlooker: true,
          createdBy: true,
          skipApprover: true,
          certificate: { include: { recordedBy: true, completedBy: true } },
          plannedDays: { orderBy: { day: "asc" }, include: { assignedTo: true } },
          batches: {
            orderBy: { day: "asc" },
            include: { review: { include: { reviewedBy: true } }, submittedBy: true },
          },
          blockers: { orderBy: { raisedAt: "desc" }, include: { raisedBy: true, resolvedBy: true } },
          phases: { orderBy: { number: "asc" } },
        },
      },
    },
  });
  if (!pipeline) notFound();

  const project = pipeline.installationProject;
  if (project?.certificate) canCorrectDates = isSuperAdmin(session.user.email);
  const surveyed = (pipeline.siteSurvey?.areas ?? []).reduce((n, a) => n + a.count, 0);
  // A demo circuit's own lights are replaced before the full crew ever
  // arrives (2026-10-17, user-asked, then corrected): shown as its own
  // visible line in the plan rather than netted out of the contracted total —
  // see ProjectSetupForm's own comment.
  const alreadyInstalled = alreadyInstalledCount(keptCircuits);
  const accounts = await db.profile.findMany({
    where: { societyId: pipeline.societyId, isActive: true },
    select: { id: true, name: true, email: true, portalAuthority: true },
    orderBy: { name: "asc" },
  });

  const header = (
    <PageHeader
      backHref={`/admin/pipeline/${pipeline.id}`}
      title={pipeline.society.name}
      chip={
        project ? (
          <StatusChip tone={statusMeta(INSTALLATION_PROJECT_STATE, project.state).tone}>
            {statusMeta(INSTALLATION_PROJECT_STATE, project.state).label}
          </StatusChip>
        ) : undefined
      }
      // The project's own recorded scope, not a re-count of the survey's
      // areas. Those two disagreed on screen — the header said "0 lights
      // surveyed" directly above a Scope card reading SURVEYED 400 — because
      // a project can be set up with a scope that the survey rows no longer
      // (or do not yet) back. The project is the record installation runs
      // against, so it is the one the header quotes.
      subtitle={
        project
          ? `Installation · ${dealLabel(pipeline.serviceLine, pipeline.dealScope)} · ${project.contractedLightCount.toLocaleString("en-IN")} lights contracted`
          : `Installation · ${dealLabel(pipeline.serviceLine, pipeline.dealScope)} · ${surveyed.toLocaleString("en-IN")} lights surveyed`
      }
      // Top right, in line with the title — raising a blocker is a thing you
      // do from anywhere on this screen, not a control belonging to the
      // section that lists them (user-asked 2026-08-20).
      action={
        project && isField ? (
          <RaiseBlockerForm
            pipelineId={pipeline.id}
            areas={[...new Set(project.plannedDays.map((d) => d.areaKey))]}
            batches={project.batches.map((b) => ({ id: b.id, label: `Day ${b.day} · ${b.areaKey}` }))}
          />
        ) : undefined
      }
    />
  );

  // FEAT-033-AC-2 — before setup, the screen says what setup is outstanding
  // rather than rendering an empty page.
  if (!project) {
    const contractReady = pipeline.contract?.status === "active";
    return (
      <>
        {header}
        <div className="max-w-none space-y-5">
          {/* Two of the four happen elsewhere; the other two are the form
              below. Rendered as a bulleted paragraph the outstanding ones
              got lost in the prose — "it is not visualised properly so the
              information gets lost" (user-reported 2026-08-20). Blocked
              items are now the loud part of the page and carry their route;
              satisfied ones recede. */}
          {(() => {
            const items = [
              {
                label: "An executed, active contract",
                done: contractReady,
                detail: "Installation commits FirsThing's own capital, so this is a hard gate.",
                href: `/admin/pipeline/${pipeline.id}/agreement`,
                cta: "Execute the agreement",
                inline: false,
              },
              {
                label: "A named society onlooker",
                done: accounts.length > 0,
                detail: "This society has no active portal account, so nobody can approve a day's work.",
                href: `/admin/societies/${pipeline.societyId}`,
                cta: "Add a portal account",
                inline: true,
              },
            ];
            const blocked = items.filter((i) => !i.done);
            return (
              <>
                {blocked.length > 0 && (
                  <div
                    className="rounded-[var(--r-md)] border p-5"
                    style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
                  >
                    <p className="lbl mb-1" style={{ color: "var(--warn-fg)" }}>
                      {blocked.length} thing{blocked.length === 1 ? "" : "s"} blocking the installation
                    </p>
                    <p className="text-sm mb-4" style={{ color: "var(--warn-fg)" }}>
                      The project can&apos;t be set up until {blocked.length === 1 ? "it is" : "both are"} done.
                    </p>
                    <ul className="space-y-3">
                      {blocked.map((i) => (
                        <li
                          key={i.label}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--r-sm)] p-3"
                          style={{ background: "var(--surface)" }}
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold text-sm">{i.label}</span>
                            <span className="block text-xs text-[var(--text-muted)]">{i.detail}</span>
                          </span>
                          {/* The portal account can be created from here —
                              the same dialog the society page uses. Sending
                              the operator to another screen to come back was
                              a detour, not a route (user-asked 2026-08-20). */}
                          {i.inline ? (
                            <span className="shrink-0">
                              <AddPortalAccountButton
                                societyId={pipeline.societyId}
                                variant="secondary"
                                label={i.cta}
                              />
                            </span>
                          ) : (
                            <Link href={i.href} className="btn-primary btn-sm shrink-0">
                              {i.cta} →
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Card className="p-5">
                  <CardTitle>What setup needs</CardTitle>
                  <ul className="space-y-1.5 text-sm">
                    {items.map((i) => (
                      <li key={i.label} style={{ color: i.done ? "var(--ok-fg)" : "var(--text-muted)" }}>
                        {i.done ? "✓" : "•"} {i.label}
                      </li>
                    ))}
                    <li className="text-[var(--text-muted)]">
                      • The contracted scope, and a note if it differs from the {surveyed} lights the
                      survey found
                    </li>
                    <li className="text-[var(--text-muted)]">
                      • A day-by-day batch plan whose counts reconcile to that scope
                    </li>
                  </ul>
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    {blocked.length === 0
                      ? "The last two are filled in below."
                      : "The last two are filled in here once the items above are in place."}
                  </p>
                </Card>
              </>
            );
          })()}

          {isOps && contractReady && accounts.length > 0 && (
            <Card className="p-5">
              <CardTitle>Set up the installation</CardTitle>
              <ProjectSetupForm
                pipelineId={pipeline.id}
                societyName={pipeline.society.name}
                surveyedLightCount={surveyed}
                alreadyInstalledCount={alreadyInstalled}
                accounts={accounts}
              />
            </Card>
          )}
          {!isOps && (
            <p className="text-sm text-[var(--text-muted)]">
              Setting up an installation project is an operations lead action.
            </p>
          )}
        </div>
      </>
    );
  }

  const gateInputs = (bs: typeof project.batches): BatchGateInput[] =>
    bs.map((b) => ({
      id: b.id,
      areaKey: b.areaKey,
      state: b.state,
      submittedAt: b.submittedAt,
      reviewedAt: b.review?.reviewedAt ?? null,
    }));

  const now = new Date();
  // One evaluation of the flag per render, shared by every day's gate.
  const demoDeadline = await demoBypass("installation_review_deadline", { pipelineId: id });
  // Computed ONCE, as a chain, not per-row in isolation (2026-10-17,
  // user-caught: "shouldnt they all be blocked?") — a day blocked by its own
  // predecessor has no batch of its own either, so evaluating each day
  // against only its immediate predecessor's (then-empty) batches read every
  // day after the first block as "clear." See evaluateDayGateChain's own
  // comment for why a per-day call can't see this on its own.
  const dayGates = evaluateDayGateChain({
    ignoreDeadline: demoDeadline,
    now,
    days: project.plannedDays.map((d) => {
      const previous = project.batches.filter((b) => b.day === d.day - 1);
      const skipApplies = !!project.gateSkipBatchId && previous.some((b) => b.id === project.gateSkipBatchId);
      return { day: d.day, startAt: d.startAt, previousBatches: gateInputs(previous), skipUsedForDay: skipApplies };
    }),
  });
  const totalInstalled = project.batches.reduce((n, b) => n + b.installedCount, 0);
  // A logged day counts what was installed; only days not yet logged count
  // their plan (2026-11-26, user-caught — see installation-tally.ts).
  const tally = installationTally(
    [
      ...project.plannedDays.map((d) => {
        const b = project.batches.find((x) => x.plannedDayId === d.id && x.state !== "draft");
        return { plannedCount: d.plannedCount, installedCount: b ? b.installedCount : null };
      }),
      ...project.batches
        .filter((b) => !b.plannedDayId && b.state !== "draft")
        .map((b) => ({ plannedCount: 0, installedCount: b.installedCount })),
    ],
    alreadyInstalled,
    project.contractedLightCount,
  );
  const totalSkipped = project.batches.reduce((n, b) => n + b.skippedCount, 0);
  const openBlockers = project.blockers.filter((b) => b.status === "open");
  // Same standard as every other step page: say plainly that it is finished,
  // then point onward.
  const installationDone = !!project.certificate;
  const afterInstall = installationDone ? (await loadDealProgress(pipeline.id))?.next ?? null : null;

  const gateInput = {
    batches: gateInputs(project.batches),
    openBlockerCount: openBlockers.length,
    plannedDayCount: new Set(project.plannedDays.map((d) => d.day)).size,
    daysWithBatches: new Set(project.batches.map((b) => b.day)).size,
  };
  const blocks = completionBlockers(gateInput);

  // Installation phases (2026-11-26, user-specified): 1 to 5 sign-offs, each
  // closed at a day and starting billing for the lights installed by then.
  const loggedBatches = project.batches.filter((b) => b.submittedAt && b.state !== "draft");
  const phaseDays: PhaseDay[] = [...new Set([...project.plannedDays.map((d) => d.day), ...loggedBatches.map((b) => b.day)])]
    .sort((x, y) => x - y)
    .map((dayNo) => {
      const bs = loggedBatches.filter((b) => b.day === dayNo);
      return {
        day: dayNo,
        installedCount: bs.length ? bs.reduce((n, b) => n + b.installedCount, 0) : null,
        workedOn: bs.map((b) => b.submittedAt!).sort((x, y) => y.getTime() - x.getTime())[0] ?? null,
      };
    });
  const phaseRecords: PhaseRecord[] = project.phases.map((ph) => ({
    number: ph.number, throughDay: ph.throughDay, signedAt: ph.signedAt, lightsOverride: ph.lightsOverride, isFinal: ph.isFinal,
  }));
  const figures = phaseFigures(phaseDays, phaseRecords);
  const finished = phaseRecords.some((ph) => ph.isFinal);
  const lastPhase = figures.at(-1) ?? null;
  const openFrom = lastPhase ? (lastPhase.derived > lastPhase.cumulative ? lastPhase.throughDay : lastPhase.throughDay + 1) : 1;
  const signoffDay = finished
    ? null
    : (loggedBatches.map((b) => b.day).filter((x) => x >= openFrom).sort((x, y) => y - x)[0] ?? null);
  const describePhase = (n: number): string => {
    const f = figures.find((x) => x.number === n);
    const rec = project.phases.find((x) => x.number === n);
    if (!f || !rec) return `Phase ${n} — in progress`;
    const total = f.cumulative + alreadyInstalled;
    const added = n === 1 ? total : f.added;
    return [
      `Phase ${n}${f.isFinal ? " — the full installation" : " complete"}`,
      `${total.toLocaleString("en-IN")} lights in total${n > 1 ? ` (+${added.toLocaleString("en-IN")} this phase)` : ""}${f.lightsOverride !== null ? ` — as signed off; the logged days show ${(f.derived + alreadyInstalled).toLocaleString("en-IN")}` : ""}`,
      `signed off ${day(rec.signedAt)} by ${rec.signatoryName} (${rec.signatoryRole})`,
      `billing for these lights from ${day(rec.billingStartDate)}`,
    ].join(" · ");
  };

  return (
    <>
      {header}

      {/* One card, not two stacked — see the same merge on the KYC step. */}
      {(() => {
        const doneLine = finished
          ? `Installation finished${figures.length > 1 ? ` in ${figures.length} phases` : ""} — billing started ${day(project.certificate?.billingStartDate)}, the day after the first sign-off.`
          : installationDone
            ? `Phase ${figures.length} signed off — billing started ${day(project.certificate?.billingStartDate)} for the lights installed by then. Phase ${figures.length + 1} is in progress.`
            : undefined;
        if (afterInstall) return <NextStepCallout next={afterInstall} done={doneLine} />;
        return doneLine ? <StepComplete title={doneLine} /> : null;
      })()}

      <div className="max-w-none space-y-6">
        <Card className="p-5">
          <CardTitle>Scope</CardTitle>
          <dl className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-5 text-sm">
            <div>
              <dt className="lbl">Contracted</dt>
              <dd className="num">{project.contractedLightCount}</dd>
              {canCorrectDates && <CorrectContractedCountControl pipelineId={pipeline.id} contractedLightCount={project.contractedLightCount} />}
            </div>
            <div>
              <dt className="lbl">Surveyed</dt>
              {/* The survey as it stands now (2026-11-18, user-caught): a corrected
                  survey count must show here, not the copy taken at setup. */}
              <dd className="num">{surveyed}</dd>
            </div>
            <div>
              {/* Named for what it counts. "Installed 0" sat on the same
                  screen as the certificate's "Total installed 400" — two
                  different quantities wearing one word, which is the same
                  unnamed-figure problem as the baseline pair (2026-08-21).
                  This one is the running total from the logged batches. */}
              <dt className="lbl">Logged in batches</dt>
              <dd className="num">{totalInstalled}</dd>
            </div>
            <div>
              {/* The demo's own lights, replaced before the crew arrived
                  (2026-11-18, user-asked) — so logged + demo reads against
                  contracted on this card, not only in the plan line below. */}
              <dt className="lbl">Installed on the demo</dt>
              <dd className="num">{alreadyInstalled}</dd>
              {alreadyInstalled > 0 && (
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  <span className="num">{totalInstalled + alreadyInstalled}</span> with the logged days
                </p>
              )}
            </div>
            <div>
              <dt className="lbl">Skipped, still owed</dt>
              <dd className="num">{totalSkipped}</dd>
            </div>
          </dl>
          {project.scopeVarianceNote && (
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              <strong>Scope differs from the survey:</strong> {project.scopeVarianceNote} — the survey itself is
              unchanged; it records what exists, this records what is contracted.
            </p>
          )}
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Onlooker: <strong>{project.onlooker.name ?? project.onlooker.email}</strong>. They review each day&apos;s
            work; the next day cannot start until they have.
          </p>
          {project.gateSkipUsedAt && (
            <p className="mt-2 text-sm" style={{ color: "var(--warn-fg)" }}>
              The one review-gate skip was used on {day(project.gateSkipUsedAt)} by{" "}
              {project.skipApprover?.name ?? project.skipApprover?.email ?? "—"} — {project.gateSkipReason}. There is no
              second.
            </p>
          )}
        </Card>

        {/* ── The plan, day by day, each with its CON-21 gate ── */}
        <Card className="p-5">
          <CardTitle>Days</CardTitle>
          {(() => {
            // Always visible: whether the installation still adds up to its
            // contracted scope. Logged days count what was installed, not
            // what was planned (2026-11-26, user-caught: a day planned at 300
            // that installed 100 does not leave 200 owed on top of the next
            // day's own fresh plan).
            return (
              <p className="mt-1 mb-3 text-[13px]" style={{ color: tally.gap === 0 ? "var(--text-muted)" : "var(--warn-fg)" }}>
                {describeTally(tally)}
              </p>
            );
          })()}
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Date</th>
                  <th>Area</th>
                  <th>Planned</th>
                  <th>Logged</th>
                  <th>Photos</th>
                  <th>Society</th>
                  <th>Can start</th>
                </tr>
              </thead>
              <tbody>
                {project.plannedDays.length === 0 && (
                  // INV-06 — every list surface defines its empty state. This
                  // one rendered a header row over nothing at all.
                  <tr>
                    <td colSpan={8} className="text-[var(--text-muted)]">
                      No days planned yet — publish a batch plan and each day appears here with its
                      review gate.
                    </td>
                  </tr>
                )}
                {/* One table for the plan and the logged work (2026-11-26,
                    user-asked: the same day was listed twice, here and under
                    "Logged batches", each with its own edit buttons). Each day
                    is three rows: the figures, the corrections, then what
                    happened — who logged it, photos, the society's review and
                    the gate. */}
                {[
                  ...project.plannedDays.map((d) => ({ d, batch: project.batches.find((b) => b.plannedDayId === d.id) ?? null })),
                  ...project.batches
                    .filter((b) => !b.plannedDayId && b.state !== "draft")
                    .map((b) => ({ d: null, batch: b })),
                ].map(({ d, batch }, rowIndex, all) => {
                  const dayNo = d?.day ?? batch!.day;
                  // A band opens each phase (2026-11-26) — signed off, or in
                  // progress — once the installation has any phase at all.
                  const dayOf = (r: (typeof all)[number]) => r.d?.day ?? r.batch!.day;
                  const thisPhase = phaseOfDay(dayNo, phaseRecords);
                  const prevPhase = rowIndex === 0 ? 0 : phaseOfDay(dayOf(all[rowIndex - 1]), phaseRecords);
                  const bands =
                    phaseRecords.length > 0 && thisPhase !== prevPhase
                      ? Array.from({ length: thisPhase - prevPhase }, (_, k) => prevPhase + 1 + k)
                      : [];
                  const trailing =
                    rowIndex === all.length - 1 && phaseRecords.length > 0
                      ? phaseRecords.map((ph) => ph.number).filter((n) => n > thisPhase)
                      : [];
                  const gate = d ? dayGates.get(d.day)! : null;
                  const gateMeta = gate ? statusMeta(DAY_GATE_STATUS, gate.status) : null;
                  const batchMeta = batch ? statusMeta(BATCH_STATE, batch.state) : null;
                  const logged = batch && batch.state !== "draft" ? batch : null;
                  const photos = (logged?.photoKeys as string[] | null) ?? [];
                  const actions = [
                    d && !batch && isField && gate!.canStart && (
                      <StartBatchButton key="start" pipelineId={pipeline.id} plannedDayId={d.id} />
                    ),
                    d && !batch && gate && !gate.canStart && (gate.outstanding.length > 0 || gate.disputed.length > 0) && isOps && !project.gateSkipUsedAt && (
                      <SkipGateForm key="skip" pipelineId={pipeline.id} plannedDayId={d.id} />
                    ),
                    d && canCorrectDates && (
                      <PlannedDayActions
                        key="plan"
                        logged={logged?.submittedAt ? { batchId: logged.id, installedCount: logged.installedCount } : null}
                        pipelineId={pipeline.id}
                        plannedDayId={d.id}
                        plannedDate={isoDate(d.plannedDate)}
                        startTime={d.startAt.toISOString().slice(11, 16)}
                        plannedCount={d.plannedCount}
                      />
                    ),
                    canCorrectDates && logged?.submittedAt && (
                      <CorrectDatesControl
                        key="dates"
                        kind="batch"
                        label="Work & approval dates"
                        pipelineId={pipeline.id}
                        batchId={logged.id}
                        workedOn={logged.submittedAt.toISOString().slice(0, 10)}
                        approvedOn={logged.review?.reviewedAt.toISOString().slice(0, 10) ?? null}
                        today={todayIso}
                        live={!demoMode}
                      />
                    ),
                    logged?.state === "disputed" && isField && <ReopenBatchControl key="reopen" pipelineId={pipeline.id} batchId={logged.id} />,
                    logged?.submittedAt && dayNo === signoffDay && isOps && (
                      <PhaseSignoffControl
                        key="phase"
                        pipelineId={pipeline.id}
                        throughDay={dayNo}
                        phaseNumber={phaseRecords.length + 1}
                        canClosePhase={phaseRecords.length + 1 < MAX_PHASES}
                        workedOn={logged.submittedAt.toISOString().slice(0, 10)}
                        today={todayIso}
                        loggedSoFar={loggedThrough(phaseDays, dayNo)}
                        demoLights={alreadyInstalled}
                      />
                    ),
                  ].filter(Boolean);
                  // Everything after the corrections in ONE line (2026-11-26,
                  // user-caught: a day ran to four rows): where, who logged
                  // it, the society's review, then anything to watch.
                  const infoParts: React.ReactNode[] = [];
                  if (logged) {
                    infoParts.push(
                      <span key="sub">
                        {logged.locationDetail ? `${logged.locationDetail} · ` : ""}submitted {day(logged.submittedAt)} by{" "}
                        {logged.submittedBy?.name ?? logged.submittedBy?.email ?? "—"}
                      </span>,
                    );
                    if (logged.review)
                      infoParts.push(
                        <span key="rev" className="text-[var(--text)]">
                          {logged.review.decision === "approved" ? "Approved" : "Disputed"} by{" "}
                          {logged.review.reviewedBy.name ?? logged.review.reviewedBy.email} on {day(logged.review.reviewedAt)}
                          {logged.review.note ? ` — ${logged.review.note}` : ""}
                          {logged.review.evidenceLocation ? ` (${logged.review.evidenceLocation})` : ""}
                        </span>,
                      );
                    if (logged.skippedCount > 0)
                      infoParts.push(<span key="skip" style={{ color: "var(--warn-fg)" }}>{logged.skippedCount} skipped — {logged.skippedReason}</span>);
                    if (logged.photosWaivedReason)
                      infoParts.push(<span key="waive" style={{ color: "var(--warn-fg)" }}>No photos — recorded after the fact: {logged.photosWaivedReason}</span>);
                  }
                  if (gate?.reason) infoParts.push(<span key="gate">{gate.reason}</span>);
                  const info =
                    infoParts.length > 0 ? (
                      <p className="text-[13px] text-[var(--text-muted)]">
                        {infoParts.map((x, i) => (
                          <Fragment key={i}>
                            {i > 0 && " · "}
                            {x}
                          </Fragment>
                        ))}
                      </p>
                    ) : null;
                  return (
                    <Fragment key={d?.id ?? batch!.id}>
                      {bands.map((n) => (
                        <tr key={`band-${n}`} className="phase-band">
                          <td colSpan={8}>{describePhase(n)}</td>
                        </tr>
                      ))}
                      <tr className={actions.length || info ? "day-main" : undefined}>
                        <td className="num">{dayNo}</td>
                        <td>
                          {d ? (
                            <>
                              {day(d.plannedDate)}
                              <span className="text-[var(--text-subtle)]"> {time(d.startAt)}</span>
                            </>
                          ) : (
                            day(batch!.submittedAt)
                          )}
                        </td>
                        <td>{d?.areaKey ?? batch!.areaKey}</td>
                        <td className="num">{d ? d.plannedCount : "—"}</td>
                        <td className="num">{logged ? logged.installedCount : "—"}</td>
                        <td>
                          {photos.length > 0
                            ? photos.map((k, i) => (
                                <a key={k} href={publicS3Url(k)} target="_blank" rel="noreferrer" className="mr-2 underline underline-offset-2">
                                  {photos.length === 1 ? "View" : i + 1}
                                </a>
                              ))
                            : logged
                              ? <span className="text-[var(--text-subtle)]">None</span>
                              : "—"}
                        </td>
                        <td>{batchMeta ? <StatusChip tone={batchMeta.tone}>{batchMeta.label}</StatusChip> : "—"}</td>
                        <td>{gateMeta ? <StatusChip tone={gateMeta.tone}>{gateMeta.label}</StatusChip> : "—"}</td>
                      </tr>
                      {actions.length > 0 && (
                        <tr className="day-sub">
                          <td />
                          <td colSpan={7}>
                            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">{actions}</div>
                          </td>
                        </tr>
                      )}
                      {info && (
                        <tr className="day-sub">
                          <td />
                          <td colSpan={7}>{info}</td>
                        </tr>
                      )}
                      {trailing.map((n) => (
                        <tr key={`band-${n}`} className="phase-band">
                          <td colSpan={8}>{describePhase(n)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canCorrectDates && (
            <AddPlannedDayForm pipelineId={pipeline.id} areas={[...new Set(project.plannedDays.map((d) => d.areaKey))]} />
          )}
          {[...dayGates.values()].some((g) => !g.canStart) && (
            <div
              className="mt-4 rounded-[var(--r-md)] border p-4 text-sm"
              style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-fg)" }}
            >
              A day is blocked by the previous day&apos;s review. The crew should know before they travel, not on
              arrival.
            </div>
          )}
        </Card>

        {/* ── Batch capture (PER-04) ── */}
        {project.batches
          .filter((b) => b.state === "draft")
          .map((b) => (
            <Card key={b.id} className="p-5">
              <CardTitle>
                Day {b.day} · {b.areaKey} — record the day&apos;s work
              </CardTitle>
              {isField ? (
                <BatchCaptureForm
                  pipelineId={pipeline.id}
                  batchId={b.id}
                  societyName={pipeline.society.name}
                  plannedCount={project.plannedDays.find((d) => d.id === b.plannedDayId)?.plannedCount ?? 0}
                  isOldRecord={(() => {
                    const pd = project.plannedDays.find((d) => d.id === b.plannedDayId)?.plannedDate;
                    return pd != null && pd.toISOString().slice(0, 10) < todayIso;
                  })()}
                  plannedDate={project.plannedDays.find((d) => d.id === b.plannedDayId)?.plannedDate?.toISOString().slice(0, 10) ?? null}
                  today={todayIso}
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Logging a batch is field staff&apos;s action.</p>
              )}
            </Card>
          ))}

        {/* ── FEAT-036 blockers ──
            Folded to a single line when there is nothing to list: a card
            wrapping a dashed "No blockers" box took a screenful to say
            nothing was wrong. It opens out only when there is a line item. */}
        {project.blockers.length === 0 ? (
          <Card className="p-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">Blockers &amp; requirement changes</span>
              <StatusChip tone="ok">None</StatusChip>
              <span className="text-[var(--text-muted)]">
                Running to plan — day {new Set(project.batches.map((b) => b.day)).size} of{" "}
                {new Set(project.plannedDays.map((d) => d.day)).size}.
              </span>
            </p>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
              <CardTitle className="mb-0">Blockers &amp; requirement changes</CardTitle>
              <StatusChip tone={openBlockers.length > 0 ? "warn" : "neu"}>
                {openBlockers.length > 0
                  ? `${openBlockers.length} open`
                  : `${project.blockers.length} resolved`}
              </StatusChip>
            </div>
            <div className="space-y-4">
              {project.blockers.map((b) => {
                const meta = statusMeta(BLOCKER_STATUS, b.status);
                const scheduleImpacting =
                  b.status === "open" && b.affectedDate !== null && b.affectedDate < now;
                return (
                  <div key={b.id} className="border-t border-[var(--border)] pt-4 first:border-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <strong>{BLOCKER_TYPE_LABEL[b.type]}</strong>
                      <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      {b.areaKey && <span className="text-sm text-[var(--text-muted)]">{b.areaKey}</span>}
                      {scheduleImpacting && <StatusChip tone="bad">Schedule-impacting</StatusChip>}
                    </div>
                    <p className="mt-1 text-sm">{b.detail}</p>
                    <p className="mt-1 text-sm text-[var(--text-subtle)]">
                      Raised {day(b.raisedAt)} by {b.raisedBy.name ?? b.raisedBy.email}
                      {b.affectedDate ? ` · affects ${day(b.affectedDate)}` : ""}
                    </p>

                    {/* FEAT-036-AC-5 — a count discrepancy always shows its
                        money, and never offers a way to close it here. */}
                    {b.type === "count_discrepancy" && b.discoveredLightCount && (
                      <div
                        className="mt-3 rounded-[var(--r-md)] border p-3 text-sm"
                        style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
                      >
                        <strong>
                          {b.discoveredLightCount - project.contractedLightCount > 0 ? "+" : ""}
                          {b.discoveredLightCount - project.contractedLightCount} lights against the contracted{" "}
                          {project.contractedLightCount}.
                        </strong>{" "}
                        This changes the represented count, which changes extrapolation, which changes every future
                        bill. It needs a contract amendment or the contract&apos;s own rescale clause — it cannot be
                        closed as an operational note here.
                      </div>
                    )}

                    {b.status === "open" && isOps && b.type !== "count_discrepancy" && (
                      <div className="mt-3">
                        <ResolveBlockerControls pipelineId={pipeline.id} blockerId={b.id} canWaive />
                      </div>
                    )}
                    {b.status !== "open" && b.resolution && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {b.status === "waived" ? "Waived" : "Resolved"} by{" "}
                        {b.resolvedBy?.name ?? b.resolvedBy?.email ?? "—"} — {b.resolution}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── Fixtures kept during the demo (2026-09-27) ── */}
        {keptLines.length > 0 && (
          <Card className="p-5">
            <CardTitle>Fixtures kept during the demo</CardTitle>
            {isField ? (
              <KeptOutcomeCard pipelineId={pipeline.id} lines={keptLines} live={!demoMode} />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Recorded by the field team at the full installation.</p>
            )}
          </Card>
        )}

        {/* ── Sign-offs: the installation's phases (2026-11-26) ── */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <CardTitle>Installation complete</CardTitle>
            {finished && (
              <Link href={`/admin/pipeline/${pipeline.id}/installation/certificate`} className="btn-tone-info">
                Work completion certificate
              </Link>
            )}
          </div>
          {figures.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Signed off from the Days table above: on the day a phase ends, mark that phase complete — billing starts the
              next day for the lights installed so far — or, on the last day, mark the installation finished. Up to{" "}
              {MAX_PHASES} phases.{!isOps && " Signing off is an operations lead action."}
              {blocks.length > 0 && figures.length === 0 && (
                <span className="mt-2 block">Still open: {blocks.map(describeCompletionBlocker).join(" ")}</span>
              )}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Phase</th>
                      <th>Days</th>
                      <th>Lights installed</th>
                      <th>Signed off</th>
                      <th>Billing for these lights from</th>
                      {canCorrectDates && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {figures.map((f, i) => {
                      const rec = project.phases.find((x) => x.number === f.number)!;
                      const prevThrough = i === 0 ? 0 : figures[i - 1].throughDay;
                      const total = f.cumulative + alreadyInstalled;
                      return (
                        <tr key={f.number}>
                          <td className="font-semibold">
                            {f.isFinal ? `Phase ${f.number} — full installation` : `Phase ${f.number}`}
                          </td>
                          <td className="num">
                            {f.throughDay === prevThrough ? `rest of day ${f.throughDay}` : prevThrough + 1 === f.throughDay ? `day ${f.throughDay}` : `days ${prevThrough + 1}–${f.throughDay}`}
                          </td>
                          <td>
                            <span className="num">{total.toLocaleString("en-IN")}</span>
                            <span className="block text-[12px] text-[var(--text-muted)]">
                              {f.number === 1
                                ? alreadyInstalled > 0
                                  ? `${f.cumulative.toLocaleString("en-IN")} + ${alreadyInstalled} demo`
                                  : "full installation"
                                : `+${f.added.toLocaleString("en-IN")} this phase`}
                              {f.lightsOverride !== null && ` · as signed off (logged days: ${(f.derived + alreadyInstalled).toLocaleString("en-IN")})`}
                            </span>
                          </td>
                          <td>
                            <span className="num">{day(rec.signedAt)}</span>
                            <span className="block text-[12px] text-[var(--text-muted)]">
                              {rec.signatoryName} ({rec.signatoryRole})
                            </span>
                          </td>
                          <td>
                            <span className="num">{day(rec.billingStartDate)}</span>
                            <span className="block text-[12px] text-[var(--text-muted)]">
                              first month {rec.proratedDays} of {rec.daysInMonth} days
                            </span>
                          </td>
                          {canCorrectDates && (
                            <td>
                              <CorrectPhaseControl
                                pipelineId={pipeline.id}
                                number={f.number}
                                loggedCount={f.derived}
                                lightsOverride={f.lightsOverride}
                                signatoryName={rec.signatoryName}
                                signatoryRole={rec.signatoryRole}
                                signedOn={rec.signedAt.toISOString().slice(0, 10)}
                                today={todayIso}
                                demoLights={alreadyInstalled}
                                live={!demoMode}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!finished && (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Phase {figures.length + 1} is in progress — mark it complete, or the installation finished, from its last
                  day in the Days table.
                </p>
              )}
              {project.certificate && canCorrectDates && (
                <CorrectDatesControl
                  kind="certificate"
                  pipelineId={pipeline.id}
                  signedOn={project.certificate.signedAt.toISOString().slice(0, 10)}
                  days={project.batches
                    .filter((b) => b.submittedAt)
                    .sort((a, b) => a.day - b.day)
                    .map((b) => ({
                      batchId: b.id,
                      day: b.day,
                      workedOn: b.submittedAt!.toISOString().slice(0, 10),
                      approvedOn: b.review?.reviewedAt.toISOString().slice(0, 10) ?? null,
                    }))}
                  today={todayIso}
                  live={!demoMode}
                />
              )}
              {project.certificate?.waiverReason && (
                <p className="mt-4 text-sm" style={{ color: "var(--warn-fg)" }}>
                  Signed with a waived blocker: {project.certificate.waiverReason}
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
