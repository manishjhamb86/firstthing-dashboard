import { formatDateTime } from "@/lib/format-date";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClickableRow } from "@/components/clickable-row";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { loadFieldWork } from "@/lib/field-work";

// The field team's own way in.
//
// An engineer or inspector does not get the deal — that is the marketing
// team's record (the user's call, 2026-08-24). What they get is the work:
// the survey, the light replacement, the installation. Widening the deal
// page to them was the wrong fix for "assigned work you cannot see"; this is
// the right one, because it shows only the work that is actually theirs.
export const dynamic = "force-dynamic";

// The rows come from src/lib/field-work.ts, which the field app's My work
// reads too — one answer to "what has been handed to this person?".
export default async function FieldWorkPage() {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_survey")) redirect("/admin");
  const actor = await resolveAdmin();
  if (!actor) redirect("/admin");

  // Operations sees everything; a field account sees what it has been handed.
  const mineOnly = !isOperations(actor.team);

  const rows = await loadFieldWork(actor.id, mineOnly);

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
        <>
          {/* Desktop/tablet table. Below sm, a stacked card per job
              (2026-10-07, user-caught — "What is needed"'s visit date/
              contact line ran off a phone's right edge with no way to
              scroll to it): the society leads, the status chip sits beside
              it, and the visit/contact/service-line/assignee detail is one
              set of muted lines beneath — nothing fixed-width to overflow. */}
          <Card className="hidden overflow-x-auto sm:block">
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

          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                className="card block p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.societyName}</p>
                    <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {r.societyLocation}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusChip tone={r.need.tone}>{r.need.label}</StatusChip>
                  </div>
                </div>
                {r.kind !== "installation" && (
                  <p className="mt-1.5 text-[12.5px]">
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
                <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {r.serviceLine}
                  {!mineOnly &&
                    (r.assigneeName ? ` · ${r.assigneeName}` : "")}
                  {!mineOnly && !r.assigneeName && (
                    <span style={{ color: "var(--warn-fg)" }}> · Nobody yet</span>
                  )}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 text-[13px] text-[var(--text-muted)]">
        The commercial record — the offer, the agreement, the contract — stays with the sales team.
        {" "}
        <Link href="/admin/demo-monitoring" className="underline">
          Circuits mid-commissioning
        </Link>{" "}
        are on the monitoring board.
      </p>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">
        On a phone?{" "}
        <Link href="/field" className="underline">
          Open the field app
        </Link>{" "}
        — it installs to the home screen and keeps pages you have opened for when there is no signal.
      </p>
    </>
  );
}
