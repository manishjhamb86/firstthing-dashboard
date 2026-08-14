import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "./new-lead-form";
import { requireAdminPage } from "@/lib/admin-permissions";

export default async function NewLeadPage() {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");

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
      <PageHeader title="Log a lead" subtitle="After a first meeting with a prospective society." />
      <NewLeadForm societies={societies} salesOwners={salesOwners} currentUserId={session.user.id} />
    </>
  );
}
