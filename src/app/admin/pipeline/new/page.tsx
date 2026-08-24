import { isDemoMode } from "@/lib/demo-mode";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { teamsFor } from "@/lib/admin-teams";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "./new-lead-form";
import { requireAdminPage } from "@/lib/admin-permissions";

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ societyId?: string }>;
}) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");

  const { societyId } = await searchParams;
  const [societies, salesOwners] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    // A lead belongs to admin or sales — "This belongs to either admin or
    // marketing team" (the user, 2026-08-24). Permission alone listed every
    // back-office account, including the engineers and inspectors who run the
    // demo but never own the deal.
    db.adminUser.findMany({
      where: {
        permissions: { has: "manage_pipeline" },
        team: { in: teamsFor("lead") },
        isActive: true,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, team: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        backHref="/admin/pipeline"
        title="Log a lead"
        subtitle="After a first meeting with a prospective society."
      />
      <NewLeadForm
        demoMode={await isDemoMode()}
        societies={societies}
        salesOwners={salesOwners}
        currentUserId={session.user.id}
        // Arriving from a society's own page, that society is already the
        // answer — verified against the list rather than trusted, so a stale
        // or hand-edited id cannot preselect something that is not there.
        initialSocietyId={societies.some((s) => s.id === societyId) ? societyId : undefined}
      />
    </>
  );
}
