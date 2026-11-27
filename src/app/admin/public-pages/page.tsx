import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, PageHeader, StatusChip } from "@/components/ui";
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
        subtitle={`Each society's own page at ${base.replace(/^https?:\/\//, "")}/<name> — what its RWA shows residents. ${live} of ${societies.length} live.`}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Address</th>
                <th>Status</th>
                <th>Sections shown</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {societies.map((s) => {
                const shown = total - s.publicHiddenSections.length - (s.publicShowLeadership ? 0 : 1);
                const isLive = s.publicPageEnabled && s.status !== "terminated";
                return (
                  <tr key={s.id}>
                    <td>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                        {s.location}
                      </p>
                    </td>
                    <td className="tabular-nums">/{s.publicSlug}</td>
                    <td>
                      <StatusChip tone={isLive ? "ok" : "neu"}>{isLive ? "Live" : s.status === "terminated" ? "Off — society closed" : "Off"}</StatusChip>
                    </td>
                    <td className="tabular-nums">
                      {shown} of {total}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {isLive && (
                        <a href={`/${s.publicSlug}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                          Open
                        </a>
                      )}
                      <Link href={`/admin/public-pages/${s.id}`} className="btn-secondary btn-sm">
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
