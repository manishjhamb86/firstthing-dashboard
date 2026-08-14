import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../../admin-nav";
import { StatusControl } from "./status-control";
import { PortalAccountForm } from "./portal-account-form";
import { DeactivatePortalButton } from "./deactivate-portal-button";

const AUTHORITY_LABEL: Record<string, string> = {
  office_bearer: "Office-bearer",
  committee: "Committee",
  manager: "Manager",
};

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

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <div className="flex items-center justify-between mb-1">
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
                className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
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
    </div>
  );
}
