import { isDemoMode } from "@/lib/demo-mode";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
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
    db.adminUser.findMany({
      where: { permissions: { has: "manage_pipeline" }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
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
