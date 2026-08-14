import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
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

const ALL_SERVICE_LINES = ["lighting", "pumps", "solar", "wastewater"];

// Independently checks auth() rather than relying solely on proxy.ts's
// optimistic matcher — see societies/page.tsx's comment for the full
// reasoning.
export default async function SocietyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const { id } = await params;
  const society = await db.society.findUnique({ where: { id } });
  if (!society) notFound();

  const [accounts, engagements] = await Promise.all([
    db.profile.findMany({ where: { societyId: id, isActive: true }, orderBy: { name: "asc" } }),
    db.engagement.findMany({ where: { societyId: id }, orderBy: { createdAt: "asc" } }),
  ]);
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

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card className="p-6">
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

        <Card className="p-6">
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
                return (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                  >
                    <span className="font-medium">{SERVICE_LINE_LABEL[e.serviceLine] ?? e.serviceLine}</span>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
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
