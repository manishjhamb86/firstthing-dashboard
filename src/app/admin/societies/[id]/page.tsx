import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import {
  ENGAGEMENT_STATUS,
  PIPELINE_STAGE,
  PORTAL_AUTHORITY_LABEL,
  SERVICE_LINE_LABEL,
  statusMeta,
} from "@/lib/status-maps";
import { StatusControl } from "./status-control";
import { AddPortalAccountButton } from "./add-portal-account-button";
import { DeactivatePortalButton } from "./deactivate-portal-button";
import { EnrollServiceLineButton } from "./enroll-service-line-form";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { formatDate } from "@/lib/format-date";
import { TankLevelBar } from "@/components/tank-visual";
import { loadDealProgress } from "@/lib/pipeline-facts";
import { NextStepCallout } from "@/components/deal-stepper";
import type { NextAction } from "@/lib/deal-progress";

const ALL_SERVICE_LINES = ["lighting", "pumps", "solar", "wastewater"];

// Independently checks auth() rather than relying solely on proxy.ts's
// optimistic matcher — see societies/page.tsx's comment for the full
// reasoning.
export default async function SocietyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  // Correcting a recorded fact is an operations act — "make sure all these
  // edit options are for admin only" (the user, 2026-08-25).
  const viewer = await resolveAdmin();
  const canCorrect =
    viewer !== null && isOperations(viewer.team) && viewer.permissions.includes("manage_pipeline");

  const { id } = await params;
  const society = await db.society.findUnique({ where: { id } });
  if (!society) notFound();

  const [accounts, engagements, pipelines, circuitCount, waterTanks] = await Promise.all([
    db.profile.findMany({ where: { societyId: id, isActive: true }, orderBy: { name: "asc" } }),
    db.engagement.findMany({ where: { societyId: id }, orderBy: { createdAt: "asc" } }),
    // An engagement records that the society is engaged on a service line;
    // the deal that actually moves it (survey → circuits → contract) is the
    // Pipeline, one per (society, serviceLine) under CON-24. Without this
    // the panel showed "Active" with no route onward, which reads as though
    // enrolling were the whole step.
    db.pipeline.findMany({
      where: { societyId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        serviceLine: true,
        stage: true,
        contactName: true,
        createdAt: true,
        authoritative: true,
      },
    }),
    db.circuit.count({ where: { societyId: id, voidedAt: null } }),
    // Water tank monitoring (2026-08-25): the tanks assigned to this society,
    // the same rows its portal renders.
    db.waterTank.findMany({
      where: { societyId: id, hasLevelSignal: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pipelineFor = new Map(pipelines.map((p) => [p.serviceLine as string, p]));

  // What to actually do next, per open deal — resolved from the same
  // sequencing module every other screen uses.
  //
  // This page showed four counts, three cards and no instruction at all
  // ("I genuinely can't figure out what's the next step ... every state
  // should be clear enough to point the user in the right direction" —
  // user-reported 2026-08-20). A society is where someone lands from the
  // list, so it has to say where the work is, not just what exists.
  const openDeals = pipelines.filter((p) => p.stage !== "closed_lost" && p.stage !== "active_billing");
  const nextSteps = (
    await Promise.all(
      openDeals.map(async (p) => {
        const progress = await loadDealProgress(p.id);
        return progress?.next
          ? { serviceLine: p.serviceLine as string, next: progress.next }
          : null;
      }),
    )
  ).filter((x): x is { serviceLine: string; next: NextAction } => x !== null);

  // Nothing is running yet — the first move depends on which piece is
  // missing, and saying which beats a page of empty cards.
  const coldStart =
    pipelines.length === 0
      ? accounts.length === 0
        ? {
            label: "Log the first lead",
            detail:
              "A deal is what produces a survey, circuits and a contract. Enrolling a service line on its own does not start one.",
            href: `/admin/pipeline/new?societyId=${society.id}`,
            owner: "sales" as const,
          }
        : {
            label: "Log the first lead",
            detail: "Portal access exists, but no deal has been logged for this society yet.",
            href: `/admin/pipeline/new?societyId=${society.id}`,
            owner: "sales" as const,
          }
      : null;

  return (
    <>
      <PageHeader
        backHref="/admin/societies"
        title={society.name}
        subtitle={`${society.location} · ${society.flatCount} flats`}
        action={
          // One action and the status control, like every other page's
          // header. "Log a lead" and "Add portal account" both lived here AND
          // in the card that owns them — the same duplication reported on the
          // catalog (2026-08-21) — so they stay with their own cards, where
          // the thing they act on actually is.
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/societies/${society.id}/circuits`} className="btn-outline btn-sm">
              Circuit registry
            </Link>
            <StatusControl societyId={society.id} status={society.status} />
          </div>
        }
      />

      {/* The one thing this page was missing: where the work is. One
          callout per open deal, so a society running two service lines does
          not have to guess which is being described. */}
      {coldStart && <NextStepCallout next={coldStart} />}
      {nextSteps.map((s) => (
        <NextStepCallout
          key={s.serviceLine}
          next={s.next}
          eyebrow={SERVICE_LINE_LABEL[s.serviceLine] ?? s.serviceLine}
        />
      ))}

      <StatRow>
        <Stat
          label="Flats"
          value={society.flatCount.toLocaleString("en-IN")}
        />
        <Stat
          label="Service lines"
          value={engagements.filter((e) => e.status === "active").length}
          detail={engagements.length > 0 ? `${engagements.length} enrolled` : "None enrolled"}
        />
        <Stat
          label="Circuits"
          value={circuitCount}
          detail={circuitCount === 0 ? "None registered" : "Registered, not removed"}
        />
        <Stat
          label="Portal accounts"
          value={accounts.length}
          detail={accounts.length === 0 ? "Nobody can sign in" : "Active"}
          tone={accounts.length === 0 ? "bad" : "ok"}
        />
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-2 items-start [&>*]:min-w-0">
        {/* Everything about the ENGAGEMENT: what the society is signed up
            for, and every deal that has run on it. */}
        <div className="space-y-6 min-w-0">
          <Card className="p-6 min-w-0">
            <CardTitle>Service lines</CardTitle>

            {/* Every line, always — enrolled or not. The dropdown showed
                only what was already there and hid the rest. */}
            <ul className="space-y-0">
              {ALL_SERVICE_LINES.map((line) => {
                const engagement = engagements.find((e) => e.serviceLine === line);
                const pipeline = pipelineFor.get(line);
                const status = engagement ? statusMeta(ENGAGEMENT_STATUS, engagement.status) : null;
                const canEnrol = pipelines.length > 0;
                return (
                  <li
                    key={line}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] py-3 first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0">
                      <span
                        className={engagement ? "font-medium" : "font-medium text-[var(--text-muted)]"}
                      >
                        {SERVICE_LINE_LABEL[line] ?? line}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                        {!engagement ? (
                          canEnrol ? (
                            "Not enrolled"
                          ) : (
                            "Not enrolled — enrolment follows a lead"
                          )
                        ) : pipeline ? (
                          <Link href={`/admin/pipeline/${pipeline.id}`} className="underline">
                            Open the deal →
                          </Link>
                        ) : (
                          <>
                            Enrolled, but no deal running.{" "}
                            <Link
                              href={`/admin/pipeline/new?societyId=${society.id}`}
                              className="underline"
                            >
                              Log a lead
                            </Link>
                            .
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 shrink-0">
                      {status && <StatusChip tone={status.tone}>{status.label}</StatusChip>}
                      {/* Enrolment comes AFTER a lead, not before it: a
                          society is engaged on a line because a deal was
                          opened and a meeting happened. Without one on
                          record the row says so instead of offering the
                          control. */}
                      {canEnrol && (!engagement || engagement.status !== "active") && (
                        <EnrollServiceLineButton
                          societyId={society.id}
                          serviceLine={line}
                          label={engagement ? "Enroll again" : "Enroll"}
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {pipelines.length === 0 && (
              <p className="mt-4 pt-4 border-t border-[var(--border-subtle)] text-sm text-[var(--text-muted)]">
                Enrolling a service line comes after a lead — log one and hold the meeting first, and
                logging it enrols the society on that line automatically.
              </p>
            )}
          </Card>

          <Card className="p-6 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <CardTitle className="mb-0">Leads</CardTitle>
              <Link href={`/admin/pipeline/new?societyId=${society.id}`} className="btn-ghost btn-sm">
                Log a lead
              </Link>
            </div>

            {pipelines.length === 0 ? (
              <EmptyState title="No leads logged">
                A lead is the deal record — it is what produces the survey, and the survey is what
                produces circuits.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {pipelines.map((p) => {
                  const st = statusMeta(PIPELINE_STAGE, p.stage);
                  return (
                    <li
                      key={p.id}
                      className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <Link href={`/admin/pipeline/${p.id}`} className="font-medium hover:underline">
                          {SERVICE_LINE_LABEL[p.serviceLine] ?? p.serviceLine}
                        </Link>
                        <span className="flex items-center gap-2">
                          {!p.authoritative && <StatusChip tone="warn">Pending approval</StatusChip>}
                          <StatusChip tone={st.tone}>{st.label}</StatusChip>
                        </span>
                      </div>
                      {/* The logged date is correctable, by operations, on
                          the deal itself — the link goes straight to the
                          form rather than leaving the reader to find it
                          (user-asked 2026-08-25). */}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {p.contactName} · logged {formatDate(p.createdAt)}
                        {canCorrect && (
                          <>
                            {" · "}
                            <Link
                              href={`/admin/pipeline/${p.id}?edit=lead`}
                              className="font-medium"
                              style={{ color: "var(--accent)" }}
                            >
                              Edit
                            </Link>
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Water tank monitoring (user-specified 2026-08-25): the sensors
              assigned to this society — the exact set its portal renders
              (INV-05's scoping key is the assignment made on these rows). */}
          {waterTanks.length > 0 && (
            <Card className="p-6 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <CardTitle className="mb-0">Water tanks</CardTitle>
                <Link href="/admin/water-tanks" className="btn-ghost btn-sm">
                  Open tank monitoring
                </Link>
              </div>
              <ul className="space-y-3">
                {waterTanks.map((t) => (
                  <li
                    key={t.id}
                    className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <Link href={`/admin/water-tanks/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <span className="flex items-center gap-3">
                        <TankLevelBar pct={t.lastLevelPercent ?? 0} />
                        {t.lastOnline ? (
                          <StatusChip tone="ok">Online</StatusChip>
                        ) : (
                          <StatusChip tone="warn">Offline</StatusChip>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Last report{" "}
                      <span className="num">
                        {t.lastReportedAt ? formatDate(t.lastReportedAt) : "—"}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Everything about WHO at the society can sign in. */}
        <Card className="p-6 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <CardTitle className="mb-0">Portal accounts</CardTitle>
            <AddPortalAccountButton societyId={society.id} variant="secondary" />
          </div>

          {accounts.length === 0 ? (
            // FEAT-108-AC-8: empty state explains the consequence and offers
            // to create the first one.
            <EmptyState title="No portal accounts yet">
              This society has no one who can sign in, view its data, or accept binding acts (GATE-04).
              Add the first account — usually the office-bearer.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:ptate-0"
                >
                  <div>
                    <p className="font-medium">{a.name ?? a.email}</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {a.portalAuthority ? PORTAL_AUTHORITY_LABEL[a.portalAuthority] : "—"} · {a.email}
                    </p>
                  </div>
                  <DeactivatePortalButton profileId={a.id} societyId={society.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

    </>
  );
}
