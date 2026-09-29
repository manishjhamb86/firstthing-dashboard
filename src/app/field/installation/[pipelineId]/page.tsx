import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/ui";
import { dealLabel } from "@/lib/deal-scope";
import { demoBypass } from "@/lib/demo-mode";
import { formatDate } from "@/lib/format-date";
import { istWallClock } from "@/lib/field-today";
import {
  completionBlockers,
  describeCompletionBlocker,
  evaluateDayGate,
  type BatchGateInput,
} from "@/lib/installation-gate";
import { BATCH_STATE, BLOCKER_TYPE_LABEL, DAY_GATE_STATUS, statusMeta } from "@/lib/status-maps";
import { requireFieldPage } from "../../access";
import { InstallationForms, type FieldDay } from "./installation-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Installation" };

/**
 * An installation on the phone (docs/engineering/19-field-app.md §15): each
 * planned day with its review gate, the day's record (counts, photos),
 * blockers, and — for the operations lead — the completion certificate. All
 * three are saved on the phone and applied by the back office's own code
 * (src/lib/installation-core.ts) when they reach the office.
 *
 * The gates shown here are as the office knew them when the page was last
 * loaded with signal; the office judges them again when the work arrives.
 */
export default async function FieldInstallationPage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const admin = await requireFieldPage();
  const { pipelineId } = await params;
  const isOps = admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey");

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    select: {
      serviceLine: true,
      dealScope: true,
      society: { select: { name: true, location: true } },
      installationProject: {
        select: {
          gateSkipBatchId: true,
          onlooker: { select: { name: true, email: true } },
          certificate: { select: { signedAt: true, signatoryName: true, billingStartDate: true } },
          plannedDays: {
            orderBy: [{ day: "asc" }, { startAt: "asc" }],
            select: {
              id: true,
              day: true,
              plannedDate: true,
              startAt: true,
              areaKey: true,
              plannedCount: true,
              assignedTo: { select: { name: true, email: true } },
            },
          },
          batches: {
            select: {
              id: true,
              plannedDayId: true,
              day: true,
              areaKey: true,
              state: true,
              submittedAt: true,
              installedCount: true,
              review: { select: { reviewedAt: true } },
            },
          },
          blockers: {
            where: { status: "open" },
            orderBy: { raisedAt: "desc" },
            select: { id: true, type: true, detail: true, areaKey: true },
          },
        },
      },
    },
  });
  if (!pipeline) notFound();
  const project = pipeline.installationProject;

  const header = (
    <header className="mb-4">
      <p className="text-[var(--text-muted)]">
        {pipeline.society.name} · {pipeline.society.location}
      </p>
      <h1 className="text-[24px] font-bold leading-tight">Installation</h1>
      <p className="text-[var(--text-muted)]">{dealLabel(pipeline.serviceLine, pipeline.dealScope)}</p>
    </header>
  );
  if (!project) {
    return (
      <>
        {header}
        <p className="card p-4">No installation plan yet — the office publishes the batch plan before the crew records days.</p>
      </>
    );
  }

  const gateInputs = (bs: typeof project.batches): BatchGateInput[] =>
    bs.map((b) => ({
      id: b.id,
      areaKey: b.areaKey,
      state: b.state as BatchGateInput["state"],
      submittedAt: b.submittedAt,
      reviewedAt: b.review?.reviewedAt ?? null,
    }));
  const now = new Date();
  const demoDeadline = await demoBypass("installation_review_deadline", { pipelineId });
  const today = istWallClock(now).toISOString().slice(0, 10);

  const days: FieldDay[] = project.plannedDays.map((d) => {
    const batch = project.batches.find((b) => b.plannedDayId === d.id) ?? null;
    const previous = project.batches.filter((b) => b.day === d.day - 1);
    const skipApplies = !!project.gateSkipBatchId && previous.some((b) => b.id === project.gateSkipBatchId);
    const gate = evaluateDayGate({ ignoreDeadline: demoDeadline, previousBatches: gateInputs(previous), startAt: d.startAt, now, skipUsedForDay: skipApplies });
    const plannedDate = d.plannedDate.toISOString().slice(0, 10);
    return {
      id: d.id,
      day: d.day,
      plannedDate,
      plannedLabel: formatDate(d.plannedDate),
      time: d.startAt.toISOString().slice(11, 16),
      areaKey: d.areaKey,
      plannedCount: d.plannedCount,
      assignee: d.assignedTo ? (d.assignedTo.name ?? d.assignedTo.email) : null,
      recorded: batch && batch.state !== "draft" ? { state: batch.state, installedCount: batch.installedCount } : null,
      gate: { status: gate.status, canStart: gate.canStart, reason: gate.reason },
      past: plannedDate < today,
    };
  });

  const blocks = completionBlockers({
    batches: gateInputs(project.batches),
    openBlockerCount: project.blockers.length,
    plannedDayCount: new Set(project.plannedDays.map((d) => d.day)).size,
    daysWithBatches: new Set(project.batches.map((b) => b.day)).size,
  });
  const installed = project.batches.reduce((n, b) => n + b.installedCount, 0);
  const planned = project.plannedDays.reduce((n, d) => n + d.plannedCount, 0);

  return (
    <>
      {header}

      <section className="card p-4 mb-4 space-y-1">
        <p>
          <span className="num font-semibold">{installed}</span> of <span className="num">{planned}</span> lights recorded
        </p>
        <p className="text-[var(--text-muted)]">
          Each day goes to{" "}
          {project.onlooker ? <span className="font-semibold">{project.onlooker.name ?? project.onlooker.email}</span> : "the society's onlooker"} to
          approve — the next day starts only once they have.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="lbl mb-2">Days</h2>
        <ul className="space-y-2">
          {days.map((d) => {
            const gateMeta = statusMeta(DAY_GATE_STATUS, d.gate.status);
            const batchMeta = d.recorded ? statusMeta(BATCH_STATE, d.recorded.state) : null;
            return (
              <li key={d.id} className="card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold min-w-0">
                    Day {d.day} · {d.plannedLabel} <span className="text-[var(--text-subtle)] num">{d.time}</span>
                  </p>
                  {batchMeta ? <StatusChip tone={batchMeta.tone}>{batchMeta.label}</StatusChip> : <StatusChip tone={gateMeta.tone}>{gateMeta.label}</StatusChip>}
                </div>
                <p className="text-[var(--text-muted)]">
                  {d.areaKey} · <span className="num">{d.plannedCount}</span> lights{d.assignee ? ` · ${d.assignee}` : ""}
                  {d.recorded ? ` · ${d.recorded.installedCount} recorded` : ""}
                </p>
                {!d.recorded && !d.gate.canStart && d.gate.reason && <p style={{ color: "var(--bad-fg)" }}>{d.gate.reason}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {project.blockers.length > 0 && (
        <section className="card p-4 mb-4">
          <h2 className="font-semibold mb-2">Open blockers</h2>
          <ul className="space-y-2">
            {project.blockers.map((b) => (
              <li key={b.id}>
                <span className="font-semibold">{BLOCKER_TYPE_LABEL[b.type] ?? b.type}</span>
                {b.areaKey ? ` · ${b.areaKey}` : ""} — {b.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <InstallationForms
        pipelineId={pipelineId}
        label={`${pipeline.society.name} · ${dealLabel(pipeline.serviceLine, pipeline.dealScope)}`}
        today={today}
        days={days}
        isOps={isOps}
        certificate={
          project.certificate
            ? { signedLabel: formatDate(project.certificate.signedAt), signatory: project.certificate.signatoryName, billingLabel: formatDate(project.certificate.billingStartDate) }
            : null
        }
        completionBlocks={blocks.map(describeCompletionBlocker)}
      />
    </>
  );
}
