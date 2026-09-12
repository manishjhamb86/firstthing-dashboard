import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { isoDateTimeLocal } from "@/lib/format-date";
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
  const now = new Date();
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
      <NewInspectionForm
        societies={societies}
        circuits={circuits}
        initialSocietyId={societyId}
        actorLabel={actor.name ?? actor.email}
        // Computed once, here, on the server — a Client Component calling
        // `new Date()` itself for its initial state disagrees with the SSR
        // pass the moment a request straddles a minute boundary, which
        // React reports as a real hydration mismatch (found by the e2e).
        initialPeriod={`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`}
        initialInspectedAt={isoDateTimeLocal(now)}
      />
    </>
  );
}
