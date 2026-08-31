import { formatDateTime } from "@/lib/format-date";
import { dealLabel } from "@/lib/deal-scope";
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
// the survey, the light replacement, the installation. Widening the deal
// page to them was the wrong fix for "assigned work you cannot see"; this is
// the right one, because it shows only the work that is actually theirs.
export const dynamic = "force-dynamic";

/**
 * One row per piece of field work, whatever kind it is.
 *
 * This page listed only SURVEYS, keyed off Pipeline.surveyOwnerId — so a
 * light replacement, which is assigned on the circuit, appeared nowhere and
 * the crew holding it saw "nothing assigned to you" (user-reported
 * 2026-08-25). A page titled "the surveys and installations assigned to you"
 * has to mean every kind of assignment, or it is lying.
 */
type WorkRow = {
  key: string;
  href: string;
  societyName: string;
  societyLocation: string;
  serviceLine: string;
  kind: "survey" | "replacement" | "installation";
  /** The chip: what this row needs. */
  need: { label: string; tone: "warn" | "info" | "neu" };
  assigneeName: string | null;
  visitAt: Date | null;
  contactName: string | null;
  /** For the fallback sort when nothing is booked. */
  touchedAt: Date;
};

export default async function FieldWorkPage() {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_survey")) redirect("/admin");
  const actor = await resolveAdmin();
  if (!actor) redirect("/admin");

  // Operations sees everything; a field account sees what it has been handed.
  const mineOnly = !isOperations(actor.team);

  const [pipelines, circuits] = await Promise.all([
    db.pipeline.findMany({
      where: {
        stage: { notIn: ["closed_lost"] },
        ...(mineOnly ? { surveyOwnerId: actor.id } : {}),
      },
      include: {
        society: { select: { id: true, name: true, location: true } },
        surveyOwner: { select: { id: true, name: true, email: true } },
        siteSurvey: { select: { id: true, areas: { select: { id: true } } } },
        installationProject: { select: { id: true, state: true } },
        // The visit lives on the schedule, not on the deal — one module for
        // every appointment (the user's call, 2026-08-25).
        scheduledEvents: {
          where: { kind: "survey_visit", status: "scheduled" },
          orderBy: { startAt: "asc" },
          take: 1,
          select: { startAt: true, contactName: true },
        },
      },
    }),
    // Light replacements: assigned on the circuit, not on the deal.
    db.circuit.findMany({
      where: {
        voidedAt: null,
        lightReplacementDate: null,
        ...(mineOnly ? { replacementOwnerId: actor.id } : { replacementOwnerId: { not: null } }),
      },
      include: {
        society: { select: { id: true, name: true, location: true } },
        replacementOwner: { select: { name: true, email: true } },
        scheduledEvents: {
          where: { kind: "installation_day", status: "scheduled" },
          orderBy: { startAt: "asc" },
          take: 1,
          select: { startAt: true, contactName: true },
        },
      },
    }),
  ]);

  const rows: WorkRow[] = [
    ...pipelines.map((p): WorkRow => {
      const areas = p.siteSurvey?.areas.length ?? 0;
      const visit = p.scheduledEvents[0] ?? null;
      return {
        key: `p-${p.id}`,
        href: p.installationProject
          ? `/admin/pipeline/${p.id}/installation`
          : `/admin/pipeline/${p.id}/survey`,
        societyName: p.society.name,
        societyLocation: p.society.location,
        serviceLine: dealLabel(p.serviceLine, p.dealScope),
        kind: p.installationProject ? "installation" : "survey",
        need: p.installationProject
          ? { label: "Installation", tone: "info" }
          : areas === 0
            ? { label: "Run the survey", tone: "warn" }
            : { label: `${areas} areas counted`, tone: "neu" },
        assigneeName: p.surveyOwner?.name ?? p.surveyOwner?.email ?? null,
        visitAt: p.installationProject ? null : (visit?.startAt ?? null),
        contactName: visit?.contactName ?? p.contactName,
        touchedAt: p.updatedAt,
      };
    }),
    ...circuits.map((c): WorkRow => {
      const visit = c.scheduledEvents[0] ?? null;
      return {
        key: `c-${c.id}`,
        href: `/admin/societies/${c.societyId}/circuits/${c.id}`,
        societyName: c.society.name,
        societyLocation: c.society.location,
        serviceLine: SERVICE_LINE_LABEL[c.serviceLine] ?? c.serviceLine,
        kind: "replacement",
        need: { label: `Replace ${c.meteredLightCount} × ${c.lightType}`, tone: "warn" },
        assigneeName: c.replacementOwner?.name ?? c.replacementOwner?.email ?? null,
        visitAt: visit?.startAt ?? null,
        contactName: visit?.contactName ?? null,
        touchedAt: c.replacementAssignedAt ?? c.createdAt,
      };
    }),
  ];

  // Soonest visit first — this is a list of places to be. Sorted here rather
  // than in the query because the date belongs to the related event.
  rows.sort((a, b) => {
    if (a.visitAt && b.visitAt) return a.visitAt.getTime() - b.visitAt.getTime();
    if (a.visitAt) return -1;
    if (b.visitAt) return 1;
    return b.touchedAt.getTime() - a.touchedAt.getTime();
  });

  const toDo = rows.filter((r) => r.kind !== "installation");
  const unscheduled = toDo.filter((r) => r.visitAt === null && r.assigneeName !== null);
  const unassigned = rows.filter((r) => r.assigneeName === null);

  return (
    <>
      <PageHeader
        title="Field work"
        subtitle={
          mineOnly
            ? "The surveys, replacements and installations assigned to you."
            : "Every deal's field work, across the team."
        }
        chip={
          unscheduled.length > 0 ? (
            <StatusChip tone="warn">
              {unscheduled.length} without a slot
            </StatusChip>
          ) : rows.length === 0 ? undefined : (
            <StatusChip tone="ok">Nothing waiting</StatusChip>
          )
        }
      />

      <StatRow>
        <Stat
          label={mineOnly ? "Assigned to you" : "Deals in the field"}
          value={rows.length}
          detail={rows.length === 0 ? "nothing handed over yet" : "open jobs"}
        />
        <Stat
          label="Surveys to run"
          value={rows.filter((r) => r.kind === "survey" && r.need.tone === "warn").length}
          detail="no lighting inventory yet"
        />
        <Stat
          label="Replacements"
          value={rows.filter((r) => r.kind === "replacement").length}
          detail="lights to swap out"
        />
        {/* Four tiles, always — the fourth is whichever one this viewer can
            act on. "Unassigned" is always 0 for a field account, and
            "Installing" is not what an ops lead is scanning this page for. */}
        {mineOnly ? (
          <Stat
            label="No visit booked"
            value={unscheduled.length}
            tone={unscheduled.length > 0 ? "warn" : "ok"}
            detail={unscheduled.length === 0 ? "everything has a slot" : "nobody has agreed a slot"}
          />
        ) : (
          <Stat
            label="Unassigned"
            value={unassigned.length}
            tone={unassigned.length > 0 ? "warn" : "ok"}
            detail={unassigned.length === 0 ? "everything has a name on it" : "nobody has been handed these"}
          />
        )}
      </StatRow>

      {rows.length === 0 ? (
        <EmptyState title={mineOnly ? "Nothing assigned to you" : "No field work yet"}>
          {mineOnly
            ? "A survey or a light replacement appears here once it is assigned to you. The deal itself stays with the sales team."
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
              {rows.map((r) => (
                <ClickableRow key={r.key} href={r.href}>
                  <td>
                    <span className="font-medium">{r.societyName}</span>
                    <p className="text-[13px] text-[var(--text-muted)]">{r.societyLocation}</p>
                  </td>
                  <td className="hidden md:table-cell">{r.serviceLine}</td>
                  <td>
                    <StatusChip tone={r.need.tone}>{r.need.label}</StatusChip>
                    {/* When they are due on site, and who to ask for — the
                        point of a list of your own visits (user-asked
                        2026-08-25). */}
                    {r.kind !== "installation" && (
                      <p className="text-[13px] mt-1">
                        {r.visitAt ? (
                          <span className="num">{formatDateTime(r.visitAt)}</span>
                        ) : (
                          <span style={{ color: "var(--warn-fg)" }}>No visit scheduled</span>
                        )}
                        {r.contactName && (
                          <span className="text-[var(--text-muted)]">
                            {" · ask for "}
                            {r.contactName}
                          </span>
                        )}
                      </p>
                    )}
                  </td>
                  {!mineOnly && (
                    <td className="hidden lg:table-cell">
                      {r.assigneeName ?? (
                        <span className="text-[13px] text-[var(--warn-fg)]">Nobody yet</span>
                      )}
                    </td>
                  )}
                  <td className="hidden sm:table-cell text-right whitespace-nowrap" aria-hidden>
                    <span className="row-link-cue text-sm font-semibold">Open →</span>
                  </td>
                </ClickableRow>
              ))}
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
