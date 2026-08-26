import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import { PageHeader, StatusChip } from "@/components/ui";
import { PortalShell } from "../portal-shell";
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
    <PortalShell theme={theme} email={viewer.email} societyName={society.name}>
      <PageHeader
        title="Committee"
        subtitle="Who from your society can sign in."
        chip={
          isOfficeBearer ? (
            <StatusChip tone="ok">You hold the office-bearer</StatusChip>
          ) : (
            <StatusChip tone="info">View only</StatusChip>
          )
        }
      />
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
    </PortalShell>
  );
}
