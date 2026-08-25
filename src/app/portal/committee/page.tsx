import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader, StatusChip } from "@/components/ui";
import { PortalTabs } from "../portal-tabs";
import { CommitteeClient } from "./committee-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Committee" };

// FEAT-108-AC-9 — the society's own membership, managed by the society.
// Society-level only: the list is scoped to the viewer's own societyId
// server-side (INV-05), and a portal account is a Profile, which can never
// mint an admin session (INV-01).
export default async function PortalCommitteePage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  const societyId = viewer.societyId;

  const [theme, society, accounts] = await Promise.all([
    resolveTheme(),
    db.society.findUnique({ where: { id: societyId } }),
    db.profile.findMany({
      where: { societyId, isActive: true },
      orderBy: [{ portalAuthority: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, portalAuthority: true },
    }),
  ]);
  if (!society) redirect("/login");

  const isOfficeBearer = viewer.role === "office_bearer";

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-20"
        style={{ background: "var(--chrome)", borderBottom: "1px solid var(--chrome-border)" }}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3 sm:px-8">
          <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />
          <div className="flex items-center gap-4">
            <ThemeSwitcher current={theme} />
            <SignOutButton className="text-sm font-medium hover:opacity-80" style={{ color: "var(--chrome-muted)" }} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-5 sm:p-8">
        <PageHeader
          title={society.name}
          subtitle="Who from your society can sign in."
          chip={
            isOfficeBearer ? (
              <StatusChip tone="ok">You hold the office-bearer</StatusChip>
            ) : (
              <StatusChip tone="info">View only</StatusChip>
            )
          }
        />
        <PortalTabs active="committee" />
        <CommitteeClient
          viewerIsOfficeBearer={isOfficeBearer}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            email: a.email,
            authority: a.portalAuthority ?? "committee",
            isSelf: a.id === viewer.id,
          }))}
        />
      </div>
    </div>
  );
}
