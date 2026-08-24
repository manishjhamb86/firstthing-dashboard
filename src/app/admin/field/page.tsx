import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ClickableRow } from "@/components/clickable-row";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";

// The field team's own way in.
//
// An engineer or inspector does not get the deal — that is the marketing
// team's record (the user's call, 2026-08-24). What they get is the work:
// the survey, the demo commissioning and the installation. Widening the deal
// page to them was the wrong fix for "assigned work you cannot see"; this is
// the right one, because it shows only the deals that are actually theirs.
export const dynamic = "force-dynamic";

export default async function FieldWorkPage() {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_survey")) redirect("/admin");
  const actor = await resolveAdmin();
  if (!actor) redirect("/admin");

  // Operations sees everything; a field account sees what it has been handed.
  const mineOnly = !isOperations(actor.team);
  const pipelines = await db.pipeline.findMany({
    where: {
      stage: { notIn: ["closed_lost"] },
      ...(mineOnly ? { surveyOwnerId: actor.id } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      society: { select: { id: true, name: true, location: true } },
      surveyOwner: { select: { id: true, name: true, email: true } },
      siteSurvey: { select: { id: true, areas: { select: { id: true } } } },
      installationProject: { select: { id: true, state: true } },
    },
  });

  const surveysToRun = pipelines.filter((p) => (p.siteSurvey?.areas.length ?? 0) === 0);
  const installing = pipelines.filter((p) => p.installationProject !== null);
  const unassigned = pipelines.filter((p) => p.surveyOwnerId === null);

  return (
    <>
      <PageHeader
        title="Field work"
        subtitle={
          mineOnly
            ? "The surveys and installations assigned to you."
            : "Every deal's field work, across the team."
        }
        chip={
          surveysToRun.length > 0 ? (
            <StatusChip tone="warn">
              {surveysToRun.length} survey{surveysToRun.length === 1 ? "" : "s"} to run
            </StatusChip>
          ) : pipelines.length === 0 ? undefined : (
            <StatusChip tone="ok">Nothing waiting</StatusChip>
          )
        }
      />

      <StatRow>
        <Stat
          label={mineOnly ? "Assigned to you" : "Deals in the field"}
          value={pipelines.length}
          detail={pipelines.length === 0 ? "nothing handed over yet" : "open deals"}
        />
        <Stat
          label="Surveys to run"
          value={surveysToRun.length}
          tone={surveysToRun.length > 0 ? "warn" : "ok"}
          detail={surveysToRun.length === 0 ? "every survey has an inventory" : "no lighting inventory yet"}
        />
        <Stat label="Installing" value={installing.length} detail="projects under way" />
        <Stat
          label="Unassigned"
          value={mineOnly ? 0 : unassigned.length}
          tone={!mineOnly && unassigned.length > 0 ? "warn" : "ok"}
          detail={mineOnly ? "you only see your own" : "nobody has been handed these"}
        />
      </StatRow>

      {pipelines.length === 0 ? (
        <EmptyState title={mineOnly ? "Nothing assigned to you" : "No field work yet"}>
          {mineOnly
            ? "A survey appears here once the deal's owner assigns it to you. The deal itself stays with the sales team."
            : "A deal reaches the field once its demo proposal is agreed and the survey is assigned."}
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th className="hidden md:table-cell">Service line</th>
                <th>What is needed</th>
                {!mineOnly && <th className="hidden lg:table-cell">Assigned to</th>}
                <th className="hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => {
                const areas = p.siteSurvey?.areas.length ?? 0;
                const href = p.installationProject
                  ? `/admin/pipeline/${p.id}/installation`
                  : `/admin/pipeline/${p.id}/survey`;
                return (
                  <ClickableRow key={p.id} href={href}>
                    <td>
                      <span className="font-medium">{p.society.name}</span>
                      <p className="text-[13px] text-[var(--text-muted)]">{p.society.location}</p>
                    </td>
                    <td className="hidden md:table-cell">
                      {SERVICE_LINE_LABEL[p.serviceLine] ?? p.serviceLine}
                    </td>
                    <td>
                      {p.installationProject ? (
                        <StatusChip tone="info">Installation</StatusChip>
                      ) : areas === 0 ? (
                        <StatusChip tone="warn">Run the survey</StatusChip>
                      ) : (
                        <StatusChip tone="neu">{areas} areas counted</StatusChip>
                      )}
                    </td>
                    {!mineOnly && (
                      <td className="hidden lg:table-cell">
                        {p.surveyOwner ? (
                          (p.surveyOwner.name ?? p.surveyOwner.email)
                        ) : (
                          <span className="text-[13px] text-[var(--warn-fg)]">Nobody yet</span>
                        )}
                      </td>
                    )}
                    <td className="hidden sm:table-cell text-right whitespace-nowrap" aria-hidden>
                      <span className="row-link-cue text-sm font-semibold">Open →</span>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 text-[13px] text-[var(--text-muted)]">
        The commercial record — the offer, the agreement, the contract — stays with the sales team.
        {" "}
        <Link href="/admin/demo-monitoring" className="underline">
          Circuits mid-commissioning
        </Link>{" "}
        are on the monitoring board.
      </p>
    </>
  );
}
