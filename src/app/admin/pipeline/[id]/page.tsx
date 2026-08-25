import { isDemoMode } from "@/lib/demo-mode";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";
import { ProposalForm } from "./proposal-form";
import { ApproveLeadButton } from "./approve-lead-button";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations, mayAct, teamMeta, teamsFor, whoseTurn } from "@/lib/admin-teams";
import { AssignSurvey } from "./assign-survey";
import { LeadDetailsForm } from "./lead-details-form";
import { formatDate, isoDate } from "@/lib/format-date";
import Link from "next/link";
import { DEAL_PROGRESS_INCLUDE, toDealProgress } from "@/lib/pipeline-facts";
import { DealStepper, NextStepCallout, WaitingOnCallout } from "@/components/deal-stepper";

const OUTCOME_LABEL: Record<string, string> = {
  agreed: "Agreed — advanced to survey",
  undecided: "Undecided — still following up",
  declined: "Declined",
};

export default async function PipelineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string; edit?: string }>;
}) {
  const session = await requireAdminPage();
  // The deal is the marketing team's — an engineer gets the survey, the demo
  // and the installation, not the commercial record (the user's call,
  // 2026-08-24). They reach their own work from /admin/field, which is why
  // widening this page was the wrong fix for "assigned work you cannot see".
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin");

  const { id } = await params;
  // The proposal form is a step you OPEN, not furniture. It used to render
  // unconditionally at the lead stage, so Cancel could only navigate away and
  // the box was back the moment you returned — "why does this box come back
  // even when I cancelled it" (user-reported 2026-08-24). The step is in the
  // URL now: the callout opens it, Cancel drops the parameter, and coming
  // back later lands on the callout rather than a half-filled form.
  const sp = await searchParams;
  const openProposal = sp.step === "proposal";
  const editingLead = sp.edit === "lead";
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      salesOwner: true,
      loggedBy: true,
      ...DEAL_PROGRESS_INCLUDE,
    },
  });
  if (!pipeline) notFound();

  const candidates = pipeline.siteSurvey
    ? await db.circuit.findMany({
        where: { siteSurveyId: pipeline.siteSurvey.id, voidedAt: null },
        select: { id: true, state: true, location: true, lightType: true },
      })
    : [];


  // The sequencing decision lives in one pure module, not scattered across
  // conditionals here — see src/lib/deal-progress.ts. The facts mapping is
  // shared with the KYC screen (src/lib/pipeline-facts.ts).
  const progress = toDealProgress(pipeline, candidates);

  // Who may confirm a lead logged on someone else's behalf, and whether doing
  // so is acting for them. Resolved from the row, like every other gate here.
  const actor = await resolveAdmin();
  const ownerName = pipeline.salesOwner.name ?? pipeline.salesOwner.email;
  // Who the field work is on, and whether the next step is this account's to
  // take at all.
  const fieldCandidates = actor
    ? await db.adminUser.findMany({
        where: { team: { in: teamsFor("survey") }, isActive: true, deletedAt: null },
        select: { id: true, name: true, email: true, team: true },
        orderBy: { name: "asc" },
      })
    : [];
  const surveyOwnerName = pipeline.surveyOwner?.name ?? pipeline.surveyOwner?.email ?? null;
  // Who a lead may be handed to: admin or sales, holding manage_pipeline.
  // Queried only when the form is actually open.
  // Correcting the record is operations' own act, deliberately stricter than
  // mayAct's "assignee, creator or ops" — the owner and creator fields exist
  // so that the people they name cannot quietly rewrite them (the user,
  // 2026-08-25: "make sure all these edit options are for admin only").
  const canCorrect =
    actor !== null && isOperations(actor.team) && actor.permissions.includes("manage_pipeline");
  const leadOwners = editingLead
    ? await db.adminUser.findMany({
        where: {
          permissions: { has: "manage_pipeline" },
          team: { in: teamsFor("lead") },
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, name: true, email: true, team: true },
        orderBy: { name: "asc" },
      })
    : [];
  const turn =
    actor && progress.next
      ? whoseTurn({
          owner: progress.next.owner,
          actorId: actor.id,
          actorTeam: actor.team,
          // Once the survey is handed to someone it is THEIR step — operations
          // included, which is on the field team list and so used to see a
          // plain "Run the site survey · Continue" with no sign that an
          // inspector was already holding it (user-reported 2026-08-25).
          assigneeName: progress.next.owner === "field" ? surveyOwnerName : null,
          assigneeId: progress.next.owner === "field" ? pipeline.surveyOwnerId : null,
        })
      : null;

  const approval = actor
    ? mayAct({
        actorId: actor.id,
        actorTeam: actor.team,
        ownerId: pipeline.salesOwnerId,
        creatorId: pipeline.loggedById,
      })
    : ({ allowed: false, reason: "" } as const);

  return (
    <>
      {/* The whole deal is frozen behind this, so it leads the page rather
          than sitting under the header competing with the step map. */}
      {/* No ribbon here as well. The waiting callout below says who it is
          assigned to, who logged it and what has to happen — a ribbon
          repeating that is the duplication reported twice already. */}

      <PageHeader
        backHref="/admin/pipeline"
        title={pipeline.society.name}
        // The map's own current step, not Pipeline.stage — see the phase
        // field in deal-progress.ts for why the two used to disagree.
        chip={<StatusChip tone={progress.phase.tone}>{progress.phase.label}</StatusChip>}
        subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · ${pipeline.society.location}`}
      />

      {/* The one thing the operator came here to learn: what to do now — or,
          when the next step is somebody else's, who it is waiting on. A blue
          "Continue" card for a step that happens on this very page linked to
          this very page and did nothing (user-reported 2026-08-24). */}
      {!pipeline.authoritative ? (
        <WaitingOnCallout
          who={ownerName}
          title="This lead is waiting to be confirmed"
          loggedBy={pipeline.loggedBy.name ?? pipeline.loggedBy.email}
          detail={
            approval.allowed && approval.onBehalf
              ? `${ownerName} is meant to confirm this after their meeting. You can do it for them, but only once the meeting has actually happened.`
              : approval.allowed
                ? "Confirm it once the meeting has happened — the deal cannot advance until you do."
                : `Only ${ownerName}, whoever logged it, or an operations account can confirm this.`
          }
        >
          {approval.allowed && (
            <ApproveLeadButton
              pipelineId={pipeline.id}
              onBehalfOf={approval.onBehalf ? ownerName : null}
            />
          )}
        </WaitingOnCallout>
      ) : progress.next && openProposal && pipeline.stage === "lead" ? (
        // The lead stage's workspace, opened from the callout. It REPLACES
        // the callout rather than sitting under it: one step is one box, and
        // a blue "Continue" card above the very form it points at was the
        // duplication reported on the catalog page and again here.
        <div className="mb-8">
          <ProposalForm
            pipelineId={pipeline.id}
            demoMode={await isDemoMode()}
            hint={progress.next.detail}
          />
        </div>
      ) : progress.next && progress.next.label === "Assign the survey" ? (
        // The step itself is the assignment, so the control lives in the
        // callout rather than sending the reader somewhere to find it.
        <NextStepCallout next={progress.next} inline>
          <AssignSurvey
            pipelineId={pipeline.id}
            current={null}
            candidates={fieldCandidates.map((c) => ({
              id: c.id,
              name: c.name ?? c.email,
              team: teamMeta(c.team).label,
            }))}
            compact
          />
        </NextStepCallout>
      ) : progress.next && turn && !turn.mine ? (
        <WaitingOnCallout
          who={turn.waitingOn}
          title={progress.next.label}
          detail={`${progress.next.detail} ${turn.note}`}
          href={turn.canOverride ? progress.next.href : undefined}
        />
      ) : (
        progress.next && <NextStepCallout next={progress.next} />
      )}

      <div className="grid gap-6 lg:grid-cols-12 items-start mb-6">
        {/* The deal's map — every stage in spine order, exactly one current,
            locked stages unlinked and saying what unlocks them. This
            replaces the old row of six identical buttons. */}
        <div className="lg:col-span-7 min-w-0">
          <Card className="p-6">
            <CardTitle>Deal progress</CardTitle>
            <DealStepper steps={progress.steps} />
          </Card>
        </div>

        <div className="lg:col-span-5 min-w-0 space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Lead details</CardTitle>
              {/* None of this could be corrected after logging it — a lead on
                  the wrong account had no route to the right one, and CON-24
                  refuses a second lead for the same society and service line
                  (user-asked 2026-08-24). */}
              {canCorrect && !editingLead && (
                <Link
                  href={`/admin/pipeline/${pipeline.id}?edit=lead`}
                  className="text-sm font-medium shrink-0"
                  style={{ color: "var(--accent)" }}
                >
                  Edit
                </Link>
              )}
            </div>
            {editingLead && canCorrect ? (
              <LeadDetailsForm
                pipelineId={pipeline.id}
                owners={leadOwners.map((o) => ({
                  id: o.id,
                  name: o.name ?? o.email,
                  team: teamMeta(o.team).label,
                }))}
                current={{
                  contactName: pipeline.contactName,
                  contactPhone: pipeline.contactPhone ?? "",
                  meetingDate: isoDate(pipeline.meetingDate),
                  loggedOn: isoDate(pipeline.createdAt),
                  salesOwnerId: pipeline.salesOwnerId,
                  notes: pipeline.notes ?? "",
                }}
              />
            ) : (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Contact</dt>
                  <dd>
                    {pipeline.contactName}
                    {pipeline.contactPhone ? ` · ${pipeline.contactPhone}` : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Meeting date</dt>
                  <dd className="num">{formatDate(pipeline.meetingDate)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Owner</dt>
                  {/* The team, not just the name: every account predating the
                      team column defaulted to operations, so an account named
                      "Inspector" could legitimately own a lead and nothing on
                      screen said why. */}
                  <dd className="text-right">
                    {ownerName}
                    <span className="block text-xs text-[var(--text-muted)]">
                      {teamMeta(pipeline.salesOwner.team).label}
                    </span>
                  </dd>
                </div>
                {pipeline.notes && (
                  <div>
                    <dt className="text-[var(--text-muted)] mb-1">Notes</dt>
                    <dd>{pipeline.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </Card>

          {/* the recorded proposal, once one exists — previously the outcome
              vanished from the UI the moment the stage moved on */}
          {pipeline.proposalOutcome && (
            <Card className="p-6">
              <CardTitle>Demo proposal</CardTitle>
              <p className="text-sm font-medium mb-1">
                {OUTCOME_LABEL[pipeline.proposalOutcome] ?? pipeline.proposalOutcome}
              </p>
              {pipeline.proposalDecidedAt && (
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  Decided {formatDate(pipeline.proposalDecidedAt)}
                </p>
              )}
              {pipeline.proposalSummary && (
                <p className="text-sm text-[var(--text-muted)]">{pipeline.proposalSummary}</p>
              )}
              {pipeline.closedLostReason && (
                <p className="text-sm mt-2" style={{ color: "var(--bad-fg)" }}>
                  {pipeline.closedLostReason}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
