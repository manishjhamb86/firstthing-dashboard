import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Stat, StatRow } from "@/components/ui";
import { loadSocietyStandings } from "@/lib/society-standing-loader";
import type { SocietyRow } from "@/lib/society-list";
import { SocietiesTable } from "./societies-table";
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
// how many circuits are metered — all read from one live-circuit array, so
// no two columns on this page can disagree about what still exists.

export default async function SocietiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdminPage();
  const { status, q } = await searchParams;

  // Every society, once: the table filters as you type and sorts by any
  // header in the browser (2026-09-26, user-asked), so there is no search
  // round trip. At the 200-society target this is a few kilobytes.
  const [societies, standings] = await Promise.all([
    db.society.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        engagements: { select: { serviceLine: true, status: true } },
        // What each society's live circuits stand in for, and how many there
        // are — one live-circuit array, so the two columns cannot disagree
        // about what still exists (a removed circuit is in neither).
        circuits: { where: { voidedAt: null }, select: { representedLightCount: true } },
      },
    }),
    // When billing started, whether anything was paid, and so what each
    // society IS — shared with the Portfolio so the two cannot disagree.
    loadSocietyStandings(),
  ]);

  const rows: SocietyRow[] = societies.map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    flatCount: s.flatCount,
    lights: s.circuits.length === 0 ? null : s.circuits.reduce((n, c) => n + c.representedLightCount, 0),
    circuits: s.circuits.length,
    serviceLines: s.engagements.map((e) => `${e.serviceLine}:${e.status}`),
    status: s.status,
    standing: standings.get(s.id)?.standing ?? "prospect",
    paying: standings.get(s.id)?.paying ?? false,
    billingStart: standings.get(s.id)?.billingStart ?? null,
    signedOn: standings.get(s.id)?.signedOn ?? null,
  }));

  const count = (st: string) => rows.filter((r) => r.standing === st).length;
  const payingCount = rows.filter((r) => r.paying).length;
  const meteredCircuits = rows.reduce((n, r) => n + r.circuits, 0);
  const linesLive = new Set(
    societies.flatMap((s) => s.engagements.filter((e) => e.status === "active").map((e) => e.serviceLine)),
  ).size;
  const withoutCircuits = rows.filter((r) => r.circuits === 0).length;

  return (
    <>
      <PageHeader
        title="Societies"
        subtitle="Every society on record, newest billing start first. Click a heading to sort by it."
        action={
          <Link href="/admin/societies/new" className="btn-primary">
            New society
          </Link>
        }
      />

      <StatRow>
        <Stat label="Societies" value={societies.length} detail={`${count("active")} active (billing started) · ${payingCount} paying · ${count("prospect")} prospect`} />
        <Stat label="Circuits metered" value={meteredCircuits} detail={meteredCircuits === 0 ? "none registered yet" : "across all societies"} />
        <Stat label="Service lines live" value={linesLive} detail={linesLive === 0 ? "nothing enrolled" : "at least one active engagement"} />
        <Stat label="No circuit yet" value={withoutCircuits} detail={withoutCircuits === 0 ? "every society has one" : "nothing to bill against"} />
      </StatRow>

      <SocietiesTable rows={rows} initialQuery={(q ?? "").trim()} initialTab={status ?? "all"} />
    </>
  );
}
