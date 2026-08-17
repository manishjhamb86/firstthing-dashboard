import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Building2, Users, Gauge, Layers } from "lucide-react";
import { Card, CardTitle, EmptyState, KpiTile, PageHeader, StatusChip } from "@/components/ui";
import {
  ENGAGEMENT_STATUS,
  PORTAL_AUTHORITY_LABEL,
  SERVICE_LINE_LABEL,
  statusMeta,
} from "@/lib/status-maps";
import { StatusControl } from "./status-control";
import { PortalAccountForm } from "./portal-account-form";
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
    db.pipeline.findMany({ where: { societyId: id }, select: { id: true, serviceLine: true, stage: true } }),
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
        action={<StatusControl societyId={society.id} status={society.status} />}
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
        <Card className="p-6 min-w-0">
          <CardTitle>Portal accounts</CardTitle>

          {accounts.length === 0 ? (
            // FEAT-108-AC-8: empty state explains the consequence and offers
            // to create the first one.
            <div className="mb-4">
              <EmptyState title="No portal accounts yet">
                This society has no one who can sign in, view its data, or accept binding acts (GATE-04).
                Create the first account — usually the office-bearer — below.
              </EmptyState>
            </div>
          ) : (
            <ul className="space-y-3">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
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

          <PortalAccountForm societyId={society.id} />
        </Card>

        <Card className="p-6 min-w-0">
          <CardTitle>Service lines</CardTitle>

          {engagements.length === 0 ? (
            // FEAT-039-AC-2: the record shows available service lines to
            // enroll rather than assuming lighting.
            <div className="mb-4">
              <EmptyState title="Not enrolled in any service line yet">
                Logging a lead enrolls the society in that service line automatically; other lines — lighting,
                pumps, solar, or wastewater — can be enrolled manually below.
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
                      <span className="font-medium">{SERVICE_LINE_LABEL[e.serviceLine] ?? e.serviceLine}</span>
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
                          <Link href="/admin/pipeline/new" className="underline">
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

          <EnrollServiceLineForm societyId={society.id} available={availableServiceLines} />

          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
            <Link href={`/admin/societies/${society.id}/circuits`} className="btn-ghost btn-sm">
              View circuit registry →
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
