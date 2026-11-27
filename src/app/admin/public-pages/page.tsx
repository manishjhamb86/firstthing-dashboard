import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, PageHeader } from "@/components/ui";
import { isOperations } from "@/lib/admin-teams";
import { PublicPagesTable, type PublicPageRow } from "./public-pages-table";
import { PUBLIC_SECTIONS } from "@/lib/public-page-sections";
import { publicPageBase } from "@/lib/public-page-base";

export const metadata = { title: "Public pages" };

/**
 * Societies → Public pages (2026-11-27, user-asked: "from where can I edit
 * each society's page… there's no dedicated section"). Every society's
 * public page in one list, each opening its editor.
 */
export default async function PublicPagesList() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  const base = await publicPageBase();
  const societies = await db.society.findMany({
    where: { publicSlug: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true, status: true, publicSlug: true, publicPageEnabled: true, publicHiddenSections: true, publicShowLeadership: true },
  });
  const total = PUBLIC_SECTIONS.length + 1; // + RWA members
  const live = societies.filter((s) => s.publicPageEnabled && s.status !== "terminated").length;
  return (
    <>
      <PageHeader
        title="Public pages"
        subtitle={`Each society's own page at ${base.replace(/^https?:\/\//, "")}/<name> — what its RWA shows residents. ${live} of ${societies.length} visible to their society; the rest are hidden until made visible.`}
      />
      <Card className="overflow-hidden">
        <PublicPagesTable
          canEdit={!!actor && isOperations(actor.team)}
          rows={societies.map(
            (s): PublicPageRow => ({
              id: s.id,
              name: s.name,
              location: s.location,
              slug: s.publicSlug ?? "",
              status: s.status === "terminated" ? "closed" : s.publicPageEnabled ? "visible" : "hidden",
              shown: total - s.publicHiddenSections.length - (s.publicShowLeadership ? 0 : 1),
              total,
            }),
          )}
        />
      </Card>
    </>
  );
}
