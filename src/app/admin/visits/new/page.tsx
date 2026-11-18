import { requireAdminPage } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { istWallClock } from "@/lib/field-today";
import { VisitForm } from "../visit-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log a visit" };

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<{ societyId?: string }> }) {
  await requireAdminPage();
  const { societyId } = await searchParams;
  const societies = await db.society.findMany({ where: { status: { not: "terminated" } }, orderBy: { name: "asc" }, select: { id: true, name: true, location: true } });
  const now = istWallClock(new Date()).toISOString().slice(0, 16);
  return (
    <>
      <PageHeader backHref="/admin/visits" title="Log a visit" subtitle="It counts once someone else approves it." />
      <VisitForm
        societies={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
        initial={{
          societyId: societies.some((s) => s.id === societyId) ? societyId! : "",
          visitedAt: now,
          purpose: "feedback_upsell",
          agenda: "",
          outcome: "",
          metName: "",
          metRole: "",
          rating: null,
          interests: [],
          followUps: "",
          photoKeys: [],
          photoUrls: {},
        }}
      />
    </>
  );
}
