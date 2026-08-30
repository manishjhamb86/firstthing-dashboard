import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { PageHeader, StatusChip } from "@/components/ui";
import { CommitteeClient } from "../committee/committee-client";
import { AccessEditor } from "./access-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Society admin" };

// Members and their access, in one place (customer-portal revamp,
// 2026-08-29): the committee management the portal already had
// (FEAT-108-AC-10 — add, deactivate, transfer) plus the new per-member
// module grants. society_admin sees it; only the office-bearer edits —
// both re-checked server-side in the actions.
export default async function PortalAdminPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "society_admin")) redirect("/portal");
  const societyId = viewer.societyId;

  const accounts = await db.profile.findMany({
    where: { societyId, isActive: true },
    orderBy: [{ portalAuthority: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, portalAuthority: true, grants: true },
  });

  const isOfficeBearer = viewer.role === "office_bearer";

  return (
    <>
      <PageHeader
        title="Society admin"
        subtitle="Who from your society can sign in, and what each member can access."
        chip={
          isOfficeBearer ? (
            <StatusChip tone="ok">You hold the office-bearer</StatusChip>
          ) : (
            <StatusChip tone="info">View only</StatusChip>
          )
        }
      />

      <div className="mb-6">
        <AccessEditor
          canEdit={isOfficeBearer}
          members={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            email: a.email,
            authority: a.portalAuthority ?? "committee",
            grants: a.grants,
            isSelf: a.id === viewer.id,
          }))}
        />
      </div>

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
    </>
  );
}
