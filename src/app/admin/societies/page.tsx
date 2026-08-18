import Link from "next/link";
import { db } from "@/lib/db";
import { ClickableRow } from "@/components/clickable-row";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { SOCIETY_STATUS, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { requireAdminPage } from "@/lib/admin-permissions";

// FEAT-085: society record & lifecycle list. proxy.ts's own matcher is
// optimistic-only (AGENTS.md) — this page independently checks auth(). The
// auth() call also forces per-request dynamic rendering; without it this
// page was once prerendered static at build time and served frozen data on
// stage (see PROJECT_CONTEXT.md, MS-02).
//
// Page-by-page design pass (2026-08-17): at the 200-society target this is
// a working list, not a roll-call — so it gains a status filter and a name
// search (both server-side via searchParams, no client JS), and each row
// carries what someone actually scans for: which service lines are live and
// how many circuits are metered. Counts come from _count, not N+1 queries.

const STATUS_TABS = ["all", "prospect", "active", "suspended", "terminated"] as const;

export default async function SocietiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdminPage();
  const { status, q } = await searchParams;

  const activeTab = STATUS_TABS.includes((status ?? "all") as (typeof STATUS_TABS)[number])
    ? (status ?? "all")
    : "all";
  const query = (q ?? "").trim();

  const [societies, statusGroups] = await Promise.all([
    db.society.findMany({
      where: {
        ...(activeTab === "all" ? {} : { status: activeTab as never }),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { location: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        engagements: { select: { serviceLine: true, status: true } },
        _count: { select: { circuits: true } },
      },
    }),
    db.society.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (tab: string) =>
    tab === "all"
      ? statusGroups.reduce((n, g) => n + g._count._all, 0)
      : (statusGroups.find((g) => g.status === tab)?._count._all ?? 0);

  const filtered = activeTab !== "all" || query !== "";

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

      {/* Filter row — a GET form, so a filtered view is a shareable URL and
          the back button behaves. */}
      <form method="get" className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => {
            const isActive = tab === activeTab;
            const label = tab === "all" ? "All" : statusMeta(SOCIETY_STATUS, tab).label;
            const href = tab === "all" ? "/admin/societies" : `/admin/societies?status=${tab}`;
            return (
              <Link
                key={tab}
                href={query ? `${href}${tab === "all" ? "?" : "&"}q=${encodeURIComponent(query)}` : href}
                aria-current={isActive ? "true" : undefined}
                className="rounded-[var(--r-pill)] border px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? "var(--accent)" : "var(--surface)",
                  borderColor: isActive ? "var(--accent)" : "var(--border)",
                  color: isActive ? "var(--text-on-accent)" : "var(--text-muted)",
                }}
              >
                {label}
                <span className="num ml-1.5 opacity-70">{countFor(tab)}</span>
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {activeTab !== "all" && <input type="hidden" name="status" value={activeTab} />}
          <label htmlFor="soc-q" className="sr-only">
            Search societies
          </label>
          <input
            id="soc-q"
            name="q"
            defaultValue={query}
            placeholder="Search name or location"
            className="field field-auto w-56"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </div>
      </form>

      {societies.length === 0 ? (
        // FEAT-085-AC-2 / INV-06: every list surface defines an empty state —
        // and a filtered-to-nothing list is a different state from an empty
        // system, so it says so and offers a way back.
        filtered ? (
          <EmptyState
            title="No societies match"
            action={
              <Link href="/admin/societies" className="btn-ghost btn-sm">
                Clear filters →
              </Link>
            }
          >
            Nothing on record matches {query ? <strong>“{query}”</strong> : "this status"}.
          </EmptyState>
        ) : (
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
        )
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th className="hidden md:table-cell">Flats</th>
                <th className="hidden lg:table-cell">Service lines</th>
                <th className="hidden md:table-cell">Circuits</th>
                <th>Status</th>
                <th className="hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {societies.map((s) => {
                const st = statusMeta(SOCIETY_STATUS, s.status);
                return (
                  <ClickableRow key={s.id} href={`/admin/societies/${s.id}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[13px] font-bold"
                          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                        >
                          {s.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/societies/${s.id}`}
                            className="font-medium hover:underline"
                          >
                            {s.name}
                          </Link>
                          <p className="text-[13px] text-[var(--text-muted)]">{s.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="num hidden md:table-cell">{s.flatCount.toLocaleString("en-IN")}</td>
                    <td className="hidden lg:table-cell">
                      {s.engagements.length === 0 ? (
                        <span className="text-[13px] text-[var(--text-subtle)]">None enrolled</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {s.engagements.map((e) => (
                            <span
                              key={e.serviceLine}
                              className="rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-semibold"
                              style={{
                                background: e.status === "active" ? "var(--ok-bg)" : "var(--neu-bg)",
                                color: e.status === "active" ? "var(--ok-fg)" : "var(--neu-fg)",
                              }}
                            >
                              {SERVICE_LINE_LABEL[e.serviceLine] ?? e.serviceLine}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="num hidden md:table-cell">
                      {s._count.circuits === 0 ? (
                        <span className="text-[var(--text-subtle)]">—</span>
                      ) : (
                        s._count.circuits
                      )}
                    </td>
                    <td>
                      <StatusChip tone={st.tone}>{st.label}</StatusChip>
                    </td>
                    {/* Decoration only — the whole row is the link. */}
                    <td className="hidden sm:table-cell text-right whitespace-nowrap" aria-hidden>
                      <span className="row-link-cue text-sm font-semibold">Open →</span>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
