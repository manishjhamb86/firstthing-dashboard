import { redirect } from "next/navigation";
import { loadInspectionChoices } from "@/lib/inspection-choices";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { isoDateTimeLocal } from "@/lib/format-date";
import { inspectionNow } from "@/lib/inspection-file";
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
  // India's wall clock: the terms a typed visit time is stored in.
  const now = inspectionNow();
  const { societies, circuits } = await loadInspectionChoices();

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
