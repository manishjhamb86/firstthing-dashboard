import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Stat, StatRow } from "@/components/ui";
import { monitoringStart } from "@/lib/monitoring";
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
  const societies = await db.society.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      engagements: { select: { serviceLine: true, status: true } },
      // What each society's live circuits stand in for, and how many there
      // are — one live-circuit array, so the two columns cannot disagree
      // about what still exists (a removed circuit is in neither).
      circuits: { where: { voidedAt: null }, select: { representedLightCount: true } },
      // When billing started: the completion certificate's billing start,
      // else the contract's term start — the rule invoices bill from. Only a
      // contract that has actually run (active, or terminated after running).
      contracts: {
        where: { status: { in: ["active", "terminated"] } },
        select: {
          termStart: true,
          pipeline: { select: { installationProject: { select: { certificate: { select: { billingStartDate: true } } } } } },
        },
      },
      pipelines: { select: { agreement: { select: { signedAt: true } } } },
    },
  });

  const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  const earliest = (ds: (string | null)[]) => ds.filter((d): d is string => d !== null).sort()[0] ?? null;
  const rows: SocietyRow[] = societies.map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    flatCount: s.flatCount,
    lights: s.circuits.length === 0 ? null : s.circuits.reduce((n, c) => n + c.representedLightCount, 0),
    circuits: s.circuits.length,
    serviceLines: s.engagements.map((e) => `${e.serviceLine}:${e.status}`),
    status: s.status,
    billingStart: earliest(
      s.contracts.map((c) =>
        day(
          monitoringStart({
            certificateBillingStart: c.pipeline?.installationProject?.certificate?.billingStartDate ?? null,
            contractTermStart: c.termStart,
          }),
        ),
      ),
    ),
    signedOn: earliest(s.pipelines.map((p) => day(p.agreement?.signedAt))),
  }));

  const count = (st: string) => societies.filter((s) => s.status === st).length;
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
        <Stat label="Societies" value={societies.length} detail={`${count("active")} active · ${count("prospect")} prospect`} />
        <Stat label="Circuits metered" value={meteredCircuits} detail={meteredCircuits === 0 ? "none registered yet" : "across all societies"} />
        <Stat label="Service lines live" value={linesLive} detail={linesLive === 0 ? "nothing enrolled" : "at least one active engagement"} />
        <Stat label="No circuit yet" value={withoutCircuits} detail={withoutCircuits === 0 ? "every society has one" : "nothing to bill against"} />
      </StatRow>

      <SocietiesTable rows={rows} initialQuery={(q ?? "").trim()} initialTab={status ?? "all"} />
    </>
  );
}
