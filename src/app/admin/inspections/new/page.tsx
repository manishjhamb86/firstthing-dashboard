import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { NewInspectionForm } from "./new-inspection-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New inspection" };

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ societyId?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_survey")) redirect("/admin");

  const { societyId } = await searchParams;
  const societies = await db.society.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });

  return (
    <>
      <PageHeader
        backHref="/admin/inspections"
        title="New inspection"
        subtitle="One row per faulty or notable fixture — a healthy light is never listed."
      />
      <NewInspectionForm societies={societies} initialSocietyId={societyId} />
    </>
  );
}
