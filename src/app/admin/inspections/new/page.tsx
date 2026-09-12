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
  const [societies, circuits] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.circuit.findMany({
      where: { voidedAt: null },
      orderBy: { location: "asc" },
      select: {
        id: true,
        societyId: true,
        location: true,
        lightType: true,
        meteredLightCount: true,
        representedLightCount: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        backHref="/admin/inspections"
        title="New inspection"
        subtitle="Start with who, where and when — the checklist and the tally come once the walk-through is done."
      />
      <NewInspectionForm societies={societies} circuits={circuits} initialSocietyId={societyId} />
    </>
  );
}
