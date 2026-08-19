import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Building2, Users, Gauge, Layers } from "lucide-react";
import { Card, CardTitle, EmptyState, KpiTile, PageHeader, StatusChip } from "@/components/ui";
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
import { EnrollServiceLineForm } from "./enroll-service-line-form";
import { requireAdminPage } from "@/lib/admin-permissions";

const ALL_SERVICE_LINES = ["lighting", "pumps", "solar", "wastewater"];

// Independently checks auth() rather than relying solely on proxy.ts's
// optimistic matcher — see societies/page.tsx's comment for the full
// reasoning.
export default async function SocietyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();

  const { id } = await params;
  const society = await db.society.findUnique({ where: { id } });
  if (!society) notFound();

  const [accounts, engagements, pipelines, circuitCount] = await Promise.all([
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
  ]);
  const pipelineFor = new Map(pipelines.map((p) => [p.serviceLine as string, p]));
  const availableServiceLines = ALL_SERVICE_LINES.filter(
    (sl) => !engagements.some((e) => e.serviceLine === sl)
  );

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/admin/societies" className="hover:underline">
            Societies
          </Link>
        }
        title={society.name}
        subtitle={`${society.location} · ${society.flatCount} flats`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/societies/${society.id}/circuits`} className="btn-outline btn-sm">
              Circuit registry
            </Link>
            {/* Arriving from this society, the form should not ask again which
                society it is — the id rides along and is preselected. */}
            <Link href={`/admin/pipeline/new?societyId=${society.id}`} className="btn-outline btn-sm">
              Log a lead
            </Link>
            <AddPortalAccountButton societyId={society.id} variant="secondary" />
            <StatusControl societyId={society.id} status={society.status} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiTile
          label="Flats"
          value={society.flatCount.toLocaleString("en-IN")}
          icon={<Building2 size={20} strokeWidth={1.75} />}
          tone="accent"
        />
        <KpiTile
          label="Service lines"
          value={engagements.filter((e) => e.status === "active").length}
          detail={engagements.length > 0 ? `${engagements.length} enrolled` : "None enrolled"}
          icon={<Layers size={20} strokeWidth={1.75} />}
          tone="info"
        />
        <KpiTile
          label="Circuits"
          value={circuitCount}
          detail={circuitCount === 0 ? "None registered" : "Registered, not removed"}
          icon={<Gauge size={20} strokeWidth={1.75} />}
          tone="warn"
        />
        <KpiTile
          label="Portal accounts"
          value={accounts.length}
          detail={accounts.length === 0 ? "Nobody can sign in" : "Active"}
          icon={<Users size={20} strokeWidth={1.75} />}
          tone={accounts.length === 0 ? "bad" : "ok"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Everything about the ENGAGEMENT: what the society is signed up
            for, and every deal that has run on it. */}
        <div className="space-y-6 min-w-0">
          <Card className="p-6 min-w-0">
            <CardTitle>Service lines</CardTitle>

            {engagements.length === 0 ? (
              // FEAT-039-AC-2: the record shows available service lines to
              // enroll rather than assuming lighting.
              <div className="mb-4">
                <EmptyState title="Not enrolled in any service line yet">
                  Logging a lead enrolls the society in that service line automatically; other lines —
                  lighting, pumps, solar, or wastewater — can be enrolled below.
                </EmptyState>
              </div>
            ) : (
              <ul className="space-y-3">
                {engagements.map((e) => {
                  const status = statusMeta(ENGAGEMENT_STATUS, e.status);
                  const pipeline = pipelineFor.get(e.serviceLine);
                  return (
                    <li
                      key={e.id}
                      className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <span className="font-medium">
                          {SERVICE_LINE_LABEL[e.serviceLine] ?? e.serviceLine}
                        </span>
                        <StatusChip tone={status.tone}>{status.label}</StatusChip>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {pipeline ? (
                          <Link href={`/admin/pipeline/${pipeline.id}`} className="underline">
                            Open the deal →
                          </Link>
                        ) : (
                          <>
                            Enrolled, but no deal running — the survey that produces circuits belongs to a
                            pipeline.{" "}
                            <Link href={`/admin/pipeline/new?societyId=${society.id}`} className="underline">
                              Log a lead
                            </Link>
                            .
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Enrolment comes AFTER a lead, not before it: a society is
                engaged on a service line because a deal was opened and a
                meeting happened, so offering the control first invites
                recording an engagement that nothing backs. With no lead on
                record the card says what has to happen first instead. */}
            {pipelines.length > 0 ? (
              <EnrollServiceLineForm societyId={society.id} available={availableServiceLines} />
            ) : (
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
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {p.contactName} · logged {p.createdAt.toISOString().slice(0, 10)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
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
