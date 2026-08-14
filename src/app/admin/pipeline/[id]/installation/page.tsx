import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import {
  BATCH_STATE,
  BLOCKER_STATUS,
  BLOCKER_TYPE_LABEL,
  DAY_GATE_STATUS,
  INSTALLATION_PROJECT_STATE,
  SERVICE_LINE_LABEL,
  statusMeta,
} from "@/lib/status-maps";
import {
  completionBlockers,
  describeCompletionBlocker,
  evaluateDayGate,
  type BatchGateInput,
} from "@/lib/installation-gate";
import { publicS3Url } from "@/lib/s3";
import {
  BatchCaptureForm,
  CompletionForm,
  ProjectSetupForm,
  RaiseBlockerForm,
  ReopenBatchControl,
  ResolveBlockerControls,
  SkipGateForm,
  StartBatchButton,
} from "./installation-controls";

function day(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "—";
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

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      contract: true,
      siteSurvey: { include: { areas: true } },
      installationProject: {
        include: {
          onlooker: true,
          createdBy: true,
          skipApprover: true,
          certificate: { include: { recordedBy: true } },
          plannedDays: { orderBy: { day: "asc" }, include: { assignedTo: true } },
          batches: {
            orderBy: { day: "asc" },
            include: { review: { include: { reviewedBy: true } }, submittedBy: true },
          },
          blockers: { orderBy: { raisedAt: "desc" }, include: { raisedBy: true, resolvedBy: true } },
        },
      },
    },
  });
  if (!pipeline) notFound();

  const project = pipeline.installationProject;
  const surveyed = (pipeline.siteSurvey?.areas ?? []).reduce((n, a) => n + a.count, 0);
  const accounts = await db.profile.findMany({
    where: { societyId: pipeline.societyId, isActive: true },
    select: { id: true, name: true, email: true, portalAuthority: true },
    orderBy: { name: "asc" },
  });

  const header = (
    <PageHeader
      breadcrumb={
        <Link href={`/admin/pipeline/${pipeline.id}`} className="hover:underline">
          {pipeline.society.name}
        </Link>
      }
      title="Installation"
      chip={
        project ? (
          <StatusChip tone={statusMeta(INSTALLATION_PROJECT_STATE, project.state).tone}>
            {statusMeta(INSTALLATION_PROJECT_STATE, project.state).label}
          </StatusChip>
        ) : undefined
      }
      subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · ${surveyed} lights surveyed`}
    />
  );

  // FEAT-033-AC-2 — before setup, the screen says what setup is outstanding
  // rather than rendering an empty page.
  if (!project) {
    const contractReady = pipeline.contract?.status === "active";
    return (
      <>
        {header}
        <div className="max-w-3xl space-y-5">
          <EmptyState title="No installation plan yet">
            <p>Setting up the project needs four things, and the plan cannot publish without any of them:</p>
            <ul className="mt-3 text-left inline-block space-y-1">
              <li>
                {contractReady ? "✓" : "•"} An executed, active contract{" "}
                {contractReady ? "" : "— installation commits FirsThing's own capital, so this is a hard gate."}
              </li>
              <li>• The contracted scope, and a note if it differs from the {surveyed} lights the survey found</li>
              <li>• A day-by-day batch plan whose counts reconcile to that scope</li>
              <li>
                • A named society onlooker{" "}
                {accounts.length === 0 ? "— this society has no active portal account yet." : ""}
              </li>
            </ul>
          </EmptyState>

          {isOps && contractReady && accounts.length > 0 && (
            <Card className="p-5">
              <CardTitle>Set up the installation</CardTitle>
              <ProjectSetupForm
                pipelineId={pipeline.id}
                societyName={pipeline.society.name}
                surveyedLightCount={surveyed}
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
  const totalInstalled = project.batches.reduce((n, b) => n + b.installedCount, 0);
  const totalSkipped = project.batches.reduce((n, b) => n + b.skippedCount, 0);
  const openBlockers = project.blockers.filter((b) => b.status === "open");

  const blocks = completionBlockers({
    batches: gateInputs(project.batches),
    openBlockerCount: openBlockers.length,
    plannedDayCount: new Set(project.plannedDays.map((d) => d.day)).size,
    daysWithBatches: new Set(project.batches.map((b) => b.day)).size,
  });

  return (
    <>
      {header}

      <div className="max-w-4xl space-y-6">
        <Card className="p-5">
          <CardTitle>Scope</CardTitle>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-4 text-sm">
            <div>
              <dt className="lbl">Contracted</dt>
              <dd className="num">{project.contractedLightCount}</dd>
            </div>
            <div>
              <dt className="lbl">Surveyed</dt>
              <dd className="num">{project.surveyedLightCount}</dd>
            </div>
            <div>
              <dt className="lbl">Installed</dt>
              <dd className="num">{totalInstalled}</dd>
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
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Date</th>
                  <th>Area</th>
                  <th>Planned</th>
                  <th>Logged</th>
                  <th>Society</th>
                  <th>Can start</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {project.plannedDays.map((d) => {
                  const batch = project.batches.find((b) => b.plannedDayId === d.id);
                  const previous = project.batches.filter((b) => b.day === d.day - 1);
                  const skipApplies =
                    !!project.gateSkipBatchId && previous.some((b) => b.id === project.gateSkipBatchId);
                  const gate = evaluateDayGate({
                    previousBatches: gateInputs(previous),
                    startAt: d.startAt,
                    now,
                    skipUsedForDay: skipApplies,
                  });
                  const gateMeta = statusMeta(DAY_GATE_STATUS, gate.status);
                  const batchMeta = batch ? statusMeta(BATCH_STATE, batch.state) : null;
                  return (
                    <tr key={d.id}>
                      <td className="num">{d.day}</td>
                      <td>
                        {day(d.plannedDate)}
                        <span className="text-[var(--text-subtle)]"> {time(d.startAt)}</span>
                      </td>
                      <td>{d.areaKey}</td>
                      <td className="num">{d.plannedCount}</td>
                      <td className="num">{batch ? batch.installedCount : "—"}</td>
                      <td>{batchMeta ? <StatusChip tone={batchMeta.tone}>{batchMeta.label}</StatusChip> : "—"}</td>
                      <td>
                        <StatusChip tone={gateMeta.tone}>{gateMeta.label}</StatusChip>
                      </td>
                      <td>
                        {!batch && isField && gate.canStart && (
                          <StartBatchButton pipelineId={pipeline.id} plannedDayId={d.id} />
                        )}
                        {!batch && !gate.canStart && isOps && !project.gateSkipUsedAt && (
                          <SkipGateForm pipelineId={pipeline.id} plannedDayId={d.id} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {project.plannedDays.some((d) => {
            const previous = project.batches.filter((b) => b.day === d.day - 1);
            return !evaluateDayGate({ previousBatches: gateInputs(previous), startAt: d.startAt, now }).canStart;
          }) && (
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
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Logging a batch is field staff&apos;s action.</p>
              )}
            </Card>
          ))}

        {/* ── Submitted batches ── */}
        {project.batches.filter((b) => b.state !== "draft").length > 0 && (
          <Card className="p-5">
            <CardTitle>Logged batches</CardTitle>
            <div className="space-y-4">
              {project.batches
                .filter((b) => b.state !== "draft")
                .map((b) => {
                  const meta = statusMeta(BATCH_STATE, b.state);
                  const photos = (b.photoKeys as string[]) ?? [];
                  return (
                    <div key={b.id} className="border-t border-[var(--border)] pt-4 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <strong>
                          Day {b.day} · {b.areaKey}
                        </strong>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                        <span className="num text-sm">{b.installedCount} installed</span>
                        {b.skippedCount > 0 && (
                          <span className="num text-sm" style={{ color: "var(--warn-fg)" }}>
                            {b.skippedCount} skipped — {b.skippedReason}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {b.locationDetail ? `${b.locationDetail} · ` : ""}
                        submitted {day(b.submittedAt)} by {b.submittedBy?.name ?? b.submittedBy?.email ?? "—"} ·{" "}
                        {photos.length} photo{photos.length === 1 ? "" : "s"}
                      </p>
                      {photos.length > 0 && (
                        <p className="mt-1 text-sm">
                          {photos.map((k, i) => (
                            <a
                              key={k}
                              href={publicS3Url(k)}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline mr-3"
                            >
                              Photo {i + 1}
                            </a>
                          ))}
                        </p>
                      )}
                      {b.review && (
                        <p className="mt-1 text-sm">
                          {b.review.decision === "approved" ? "Approved" : "Disputed"} by{" "}
                          {b.review.reviewedBy.name ?? b.review.reviewedBy.email} on {day(b.review.reviewedAt)}
                          {b.review.note ? ` — ${b.review.note}` : ""}
                          {b.review.evidenceLocation ? ` (${b.review.evidenceLocation})` : ""}
                        </p>
                      )}
                      {b.state === "disputed" && isField && (
                        <ReopenBatchControl pipelineId={pipeline.id} batchId={b.id} />
                      )}
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

        {/* ── FEAT-036 blockers ── */}
        <Card className="p-5">
          <CardTitle>Blockers & requirement changes</CardTitle>
          {project.blockers.length === 0 ? (
            <EmptyState title="No blockers">
              Installation is running to plan — day {new Set(project.batches.map((b) => b.day)).size} of{" "}
              {new Set(project.plannedDays.map((d) => d.day)).size}.
            </EmptyState>
          ) : (
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
          )}

          {isField && (
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <CardTitle>Raise a blocker</CardTitle>
              <RaiseBlockerForm
                pipelineId={pipeline.id}
                areas={[...new Set(project.plannedDays.map((d) => d.areaKey))]}
                batches={project.batches.map((b) => ({ id: b.id, label: `Day ${b.day} · ${b.areaKey}` }))}
              />
            </div>
          )}
        </Card>

        {/* ── FEAT-037 completion ── */}
        <Card className="p-5">
          <CardTitle>Completion & billing start</CardTitle>
          {project.certificate ? (
            <>
              <p className="text-sm">
                Signed {day(project.certificate.signedAt)} by {project.certificate.signatoryName} (
                {project.certificate.signatoryRole}), recorded by{" "}
                {project.certificate.recordedBy.name ?? project.certificate.recordedBy.email}.
              </p>
              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
                <div>
                  <dt className="lbl">Billing starts</dt>
                  <dd className="num">{day(project.certificate.billingStartDate)}</dd>
                </div>
                <div>
                  <dt className="lbl">First month</dt>
                  <dd className="num">
                    {project.certificate.proratedDays} of {project.certificate.daysInMonth} days
                  </dd>
                </div>
                <div>
                  <dt className="lbl">Total installed</dt>
                  <dd className="num">{project.certificate.totalInstalledCount}</dd>
                </div>
              </dl>
              {project.certificate.waiverReason && (
                <p className="mt-4 text-sm" style={{ color: "var(--warn-fg)" }}>
                  Signed with a waived blocker: {project.certificate.waiverReason}
                </p>
              )}
            </>
          ) : blocks.length > 0 ? (
            // FEAT-037-AC-2 — what's outstanding, named, rather than a
            // disabled button with no explanation.
            <div>
              <p className="text-sm text-[var(--text-muted)] mb-3">Not ready to complete:</p>
              <ul className="text-sm space-y-1">
                {blocks.map((b) => (
                  <li key={b.kind}>• {describeCompletionBlocker(b)}</li>
                ))}
              </ul>
            </div>
          ) : isOps ? (
            <CompletionForm pipelineId={pipeline.id} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Everything is settled. Recording the signed certificate is an operations lead action — the
              society&apos;s signature is captured as evidence, not as a system action they perform.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
