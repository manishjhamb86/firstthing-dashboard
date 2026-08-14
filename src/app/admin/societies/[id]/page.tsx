import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../../admin-nav";
import { StatusControl } from "./status-control";
import { PortalAccountForm } from "./portal-account-form";
import { DeactivatePortalButton } from "./deactivate-portal-button";
import { EnrollServiceLineForm } from "./enroll-service-line-form";

const AUTHORITY_LABEL: Record<string, string> = {
  office_bearer: "Office-bearer",
  committee: "Committee",
  manager: "Manager",
};

const SERVICE_LINE_LABEL: Record<string, string> = {
  lighting: "Lighting",
  pumps: "Pumps",
  solar: "Solar",
  wastewater: "Wastewater",
};

const ALL_SERVICE_LINES = ["lighting", "pumps", "solar", "wastewater"];

// Independently checks auth() rather than relying solely on proxy.ts's
// optimistic matcher — see societies/page.tsx's comment for the full
// reasoning (also applies here: this route happened to render dynamically
// already since Next doesn't prerender an unlisted [id] param by default,
// but the missing server-side check itself was still a real gap).
export default async function SocietyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const { id } = await params;
  const society = await db.society.findUnique({ where: { id } });
  if (!society) notFound();

  const accounts = await db.profile.findMany({
    where: { societyId: id, isActive: true },
    orderBy: { name: "asc" },
  });

  const engagements = await db.engagement.findMany({
    where: { societyId: id },
    orderBy: { createdAt: "asc" },
  });
  const availableServiceLines = ALL_SERVICE_LINES.filter(
    (sl) => !engagements.some((e) => e.serviceLine === sl)
  );

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-1">
        <h1 className="text-2xl font-bold">{society.name}</h1>
        <StatusControl societyId={society.id} status={society.status} />
      </div>
      <p className="mb-8 text-[var(--text-muted)]">
        {society.location} · {society.flatCount} flats
      </p>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6 max-w-xl">
        <p className="text-sm mb-4 text-[var(--text-muted)]">Portal accounts</p>

        {accounts.length === 0 ? (
          // FEAT-108-AC-8: empty state explains the consequence and offers
          // to create the first one.
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-md)] p-6 text-center mb-4">
            <p className="font-medium mb-1">No portal accounts yet</p>
            <p className="text-sm text-[var(--text-muted)]">
              This society has no one who can sign in, view its data, or accept binding acts (GATE-04).
              Create the first account — usually the office-bearer — below.
            </p>
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
                    {a.portalAuthority ? AUTHORITY_LABEL[a.portalAuthority] : "—"} · {a.email}
                  </p>
                </div>
                <DeactivatePortalButton profileId={a.id} societyId={society.id} />
              </li>
            ))}
          </ul>
        )}

        <PortalAccountForm societyId={society.id} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6 max-w-xl mt-6">
        <p className="text-sm mb-4 text-[var(--text-muted)]">Service lines</p>

        {engagements.length === 0 ? (
          // FEAT-039-AC-2: the record shows available service lines to
          // enroll rather than assuming lighting.
          <div className="border border-dashed border-[var(--border)] rounded-[var(--r-md)] p-6 text-center mb-4">
            <p className="font-medium mb-1">Not enrolled in any service line yet</p>
            <p className="text-sm text-[var(--text-muted)]">
              Enroll this society in a service line below — lighting, pumps, solar, or wastewater — before a
              pipeline or circuit can be created for it.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {engagements.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
              >
                <span className="font-medium">{SERVICE_LINE_LABEL[e.serviceLine] ?? e.serviceLine}</span>
                <span className="text-sm text-[var(--text-muted)] capitalize">{e.status}</span>
              </li>
            ))}
          </ul>
        )}

        <EnrollServiceLineForm societyId={society.id} available={availableServiceLines} />
      </div>

      <Link
        href={`/admin/societies/${society.id}/circuits`}
        className="inline-block mt-6 text-sm font-semibold"
        style={{ color: "var(--accent)" }}
      >
        View circuit registry →
      </Link>
    </div>
  );
}
