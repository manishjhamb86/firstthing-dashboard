import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { SOCIETY_STATUS, statusMeta } from "@/lib/status-maps";
import { requireAdminPage } from "@/lib/admin-permissions";

// FEAT-085: society record & lifecycle list. proxy.ts's own matcher is
// optimistic-only (AGENTS.md) — this page independently checks auth(). The
// auth() call also forces per-request dynamic rendering; without it this
// page was once prerendered static at build time and served frozen data on
// stage (see PROJECT_CONTEXT.md, MS-02).
export default async function SocietiesPage() {
  await requireAdminPage();

  const societies = await db.society.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHeader
        title="Societies"
        subtitle="Every society on record, newest first."
        action={
          <Link href="/admin/societies/new" className="btn-primary">
            New society
          </Link>
        }
      />

      {societies.length === 0 ? (
        // FEAT-085-AC-2 / INV-06: every list surface defines an empty state.
        <EmptyState
          title="No societies yet"
          action={
            <Link href="/admin/societies/new" className="btn-ghost btn-sm">
              New society →
            </Link>
          }
        >
          Create one from a lead to get started.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Location</th>
                <th>Flats</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {societies.map((s) => {
                const status = statusMeta(SOCIETY_STATUS, s.status);
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/societies/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="text-[var(--text-muted)]">{s.location}</td>
                    <td className="num">{s.flatCount}</td>
                    <td>
                      <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
