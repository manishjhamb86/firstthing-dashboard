import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../admin-nav";

const STATUS_LABEL: Record<string, string> = {
  prospect: "Prospect",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
};

// FEAT-085: society record & lifecycle list. proxy.ts's own matcher is
// optimistic-only (AGENTS.md) — this page independently checks auth(),
// matching admin/page.tsx and admin/users/page.tsx, rather than relying
// solely on the proxy. This also has a real side effect worth knowing:
// without any cookies()/auth() call, Next.js's static analysis had been
// prerendering this page at *build* time (confirmed live on stage —
// `pnpm build`'s route table showed it as `○` static, and it served
// build-time-frozen society data until the next deploy, a real bug found
// verifying MS-02 against stage, not local dev). auth() forces per-request
// dynamic rendering as a side effect, same as it does on the other two.
export default async function SocietiesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const societies = await db.society.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Societies</h1>
        <Link
          href="/admin/societies/new"
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] rounded-[var(--r-md)] px-4 py-2 text-sm font-semibold transition-colors"
        >
          New society
        </Link>
      </div>

      {societies.length === 0 ? (
        // FEAT-085-AC-2 / INV-06: every list surface defines an empty state.
        <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-10 text-center max-w-xl">
          <p className="font-semibold mb-1">No societies yet</p>
          <p className="text-sm mb-4 text-[var(--text-muted)]">Create one from a lead to get started.</p>
          <Link href="/admin/societies/new" className="text-[var(--accent)] font-semibold text-sm">
            New society →
          </Link>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] max-w-2xl divide-y divide-[var(--border-subtle)]">
          {societies.map((s) => (
            <Link
              key={s.id}
              href={`/admin/societies/${s.id}`}
              className="flex items-center justify-between p-4 hover:bg-[var(--surface-hover)]"
            >
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {s.location} · {s.flatCount} flats
                </p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
