import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
import { currentInspectionPeriod, inspectionReminderPeriod, societiesMissingInspection } from "@/lib/notifications";
import {
  classifyPortfolioFaultRates,
  currentMonthSummary,
  type SocietyFaultHistory,
} from "@/lib/inspection-intelligence";
import { InspectionSocietyFilter } from "./society-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspections" };

// The monthly, per-society motion-sensor-light inspection — digitising the
// real paper checklist FirsThing's inspectors already carry into the field.
// Field work (manage_survey), same gate as gate passes, benchmark rescale
// entry and circuit replacement recording.
export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string; societyId?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_survey")) redirect("/admin");

  // Where the collapsed "N societies have no <period> inspection" reminder
  // lands. The notification carries the count; this is the who. Both read
  // `societiesMissingInspection`, so the number on the bell and the rows
  // here are the same query rather than two that can disagree.
  const { missing: missingParam, societyId: societyFilter } = await searchParams;
  const missingPeriod =
    missingParam && /^\d{4}-\d{2}$/.test(missingParam) ? missingParam : null;
  const missing = missingPeriod ? await societiesMissingInspection(missingPeriod) : [];
  const currentReminderPeriod = inspectionReminderPeriod();

  // ---- The summary header (2026-10-06, user-asked) ----
  // Current-month status: done / pending / delayed over every society with
  // an active contract. "Delayed" reuses the SAME overdue-last-period set
  // the bell's own reminder already computes, so the two can never disagree
  // about who is genuinely behind versus simply not-yet-visited this month.
  const activeContracts = await db.contract.findMany({
    where: { status: "active" },
    select: { societyId: true },
    distinct: ["societyId"],
  });
  const activeSocietyIds = activeContracts.map((c) => c.societyId);
  const currentPeriod = currentInspectionPeriod();
  const doneThisMonthRows =
    activeSocietyIds.length > 0
      ? await db.inspection.findMany({
          where: {
            societyId: { in: activeSocietyIds },
            period: currentPeriod,
            voidedAt: null,
            totalLightsChecked: { not: null },
          },
          select: { societyId: true },
        })
      : [];
  const missingLastPeriod = await societiesMissingInspection(inspectionReminderPeriod());
  const monthSummary = currentMonthSummary({
    activeSocietyIds,
    doneThisMonthIds: new Set(doneThisMonthRows.map((r) => r.societyId)),
    missingLastMonthIds: new Set(missingLastPeriod.map((m) => m.societyId)),
  });

  // Portfolio-wide fault-rate history — every finalised inspection on
  // record, across every society (not only currently-active ones: a
  // society whose faults contributed to a since-ended engagement is
  // exactly the "bad experience" case worth surfacing, not something a
  // narrower scope should quietly drop).
  const allFinalised = await db.inspection.findMany({
    where: { voidedAt: null, totalLightsChecked: { not: null } },
    orderBy: { inspectedAt: "asc" },
    select: {
      societyId: true,
      society: { select: { name: true } },
      totalLightsChecked: true,
      _count: { select: { findings: true } },
    },
  });
  const faultHistoryBySociety = new Map<string, SocietyFaultHistory>();
  for (const insp of allFinalised) {
    // A total of 0 has no meaningful rate to compute (guards a divide-by-zero
    // rather than reading a 0-checked visit as either spotless or chronic).
    if (!insp.totalLightsChecked || insp.totalLightsChecked <= 0) continue;
    const entry = faultHistoryBySociety.get(insp.societyId) ?? {
      societyId: insp.societyId,
      name: insp.society.name,
      faultRates: [],
    };
    entry.faultRates.push(insp._count.findings / insp.totalLightsChecked);
    faultHistoryBySociety.set(insp.societyId, entry);
  }
  const faultSummary = classifyPortfolioFaultRates([...faultHistoryBySociety.values()]);

  const [inspections, allSocieties] = await Promise.all([
    db.inspection.findMany({
      where: societyFilter ? { societyId: societyFilter } : undefined,
      orderBy: [{ inspectedAt: "desc" }],
      take: 100,
      include: {
        society: { select: { name: true, location: true } },
        _count: { select: { findings: true } },
      },
    }),
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Inspections"
        subtitle="One monthly visit per society and area — only faulty or notable fixtures are recorded."
        action={
          <Link href="/admin/inspections/new" className="btn-primary">
            New inspection
          </Link>
        }
        chip={
          missingPeriod === null ? (
            <Link href={`/admin/inspections?missing=${currentReminderPeriod}`}>
              <StatusChip tone="warn">Who has not filed?</StatusChip>
            </Link>
          ) : undefined
        }
      />

      {/* Compacted into one short strip (2026-10-06, user-caught: two full-height
          cards pushed the actual listing below the fold) — the numbers read
          inline rather than as big tiles, since they are a glance-and-move-on
          summary, not the page's own content. */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-[13px]">
          <p>
            <span className="lbl mr-2">{monthLabel(`${currentPeriod}-01`)}</span>
            <span className="num font-semibold" style={{ color: "var(--ok-fg)" }}>
              {monthSummary.doneCount}
            </span>{" "}
            done ·{" "}
            <span className="num font-semibold" style={{ color: "var(--accent)" }}>
              {monthSummary.pendingCount}
            </span>{" "}
            pending ·{" "}
            <span className="num font-semibold" style={{ color: monthSummary.delayedCount > 0 ? "var(--bad-fg)" : "var(--accent)" }}>
              {monthSummary.delayedCount}
            </span>{" "}
            delayed
            <span className="text-[var(--text-muted)]"> (of {monthSummary.totalActive} active societies)</span>
          </p>
          <p className="max-w-lg text-[var(--text-muted)]">
            {faultSummary.normalCount + faultSummary.chronicCount === 0 ? (
              <>
                <span className="lbl mr-2" style={{ color: "var(--text)" }}>
                  Fault pattern
                </span>
                No society has enough history to judge a pattern yet ({faultSummary.notEnoughHistoryCount} building history).
              </>
            ) : faultSummary.chronicCount === 0 ? (
              <>
                <span className="lbl mr-2" style={{ color: "var(--text)" }}>
                  Fault pattern
                </span>
                <span className="num font-semibold" style={{ color: "var(--ok-fg)" }}>
                  {faultSummary.normalCount}
                </span>{" "}
                normal — nothing alarming.
              </>
            ) : (
              <>
                <span className="lbl mr-2" style={{ color: "var(--text)" }}>
                  Fault pattern
                </span>
                <span className="num font-semibold" style={{ color: "var(--ok-fg)" }}>
                  {faultSummary.normalCount}
                </span>{" "}
                normal ·{" "}
                <span className="num font-semibold" style={{ color: "var(--bad-fg)" }}>
                  {faultSummary.chronicCount}
                </span>{" "}
                repeated faults every visit, above the portfolio&rsquo;s typical rate.
              </>
            )}
          </p>
        </div>
        {faultSummary.chronic.length > 0 && (
          <ul className="mt-2 flex flex-col border-t pt-1" style={{ borderColor: "var(--border-subtle)" }}>
            {faultSummary.chronic.map((c) => (
              <li key={c.societyId} className="flex flex-wrap items-center justify-between gap-2 py-1 text-[12.5px]">
                <span className="font-medium">{c.name}</span>
                <span className="text-[var(--text-muted)]">
                  <span className="num" style={{ color: "var(--bad-fg)" }}>
                    {c.recentFaultRatePct.toFixed(1)}%
                  </span>{" "}
                  faulty, last {c.inspectionsConsidered} visits
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {missingPeriod !== null && (
        <Card className="mb-6 p-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              Not filed for {monthLabel(`${missingPeriod}-01`)}
            </h2>
            <Link href="/admin/inspections" className="text-[13px] font-semibold underline">
              Show all inspections →
            </Link>
          </div>
          {missing.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">
              Every society with an active contract has a finalised inspection for this month.
            </p>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-[var(--text-muted)]">
                {missing.length} societ{missing.length === 1 ? "y" : "ies"} with an active contract
                {missing.length === 1 ? " has" : " have"} no finalised inspection for this month. A
                started-but-abandoned draft does not count.
              </p>
              <ul className="flex flex-col">
                {missing.map((m, i) => (
                  <li
                    key={m.societyId}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                    style={i < missing.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                  >
                    <span className="text-[13.5px] font-medium">{m.name}</span>
                    <Link
                      href={`/admin/inspections/new?societyId=${m.societyId}`}
                      className="btn-ghost btn-sm"
                    >
                      File it →
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <InspectionSocietyFilter options={allSocieties.map((s) => ({ id: s.id, label: s.name }))} />

      {inspections.length === 0 ? (
        <EmptyState title={societyFilter ? "No inspections for this society yet" : "No inspections filed yet"}>
          {societyFilter
            ? "Nothing on record for this society — try a different one, or clear the filter."
            : "The first monthly visit appears here once an inspector records one."}
        </EmptyState>
      ) : (
        <>
          {/* Desktop/tablet: the full table. Below sm, a table this wide only
              ever overflows or clips its right-hand columns — the status chip
              and the checked/faulty counts were running off the edge of the
              phone entirely (2026-10-07, user-caught, across many list pages
              at once). The exact pattern this codebase already proved on the
              inspection findings table itself (2026-09-12): one stacked card
              per row at phone width, the same data re-prioritized rather than
              squeezed. */}
          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Area</th>
                  <th>Month</th>
                  <th>Inspected</th>
                  <th>Inspector</th>
                  <th className="text-right">Checked</th>
                  <th className="text-right">Faulty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((i) => (
                  <tr key={i.id} className={i.voidedAt ? "opacity-50" : ""}>
                    <td>
                      <Link href={`/admin/inspections/${i.id}`} className="font-medium hover:underline">
                        {i.society.name}
                      </Link>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {i.society.location}
                      </p>
                    </td>
                    <td>{i.area || "Whole society"}</td>
                    <td>{monthLabel(`${i.period}-01`)}</td>
                    <td>{formatDate(i.inspectedAt)}</td>
                    <td>{i.inspectorName}</td>
                    <td className="num text-right">{i.totalLightsChecked ?? "—"}</td>
                    <td className="num text-right">{i.totalLightsChecked === null ? "—" : i._count.findings}</td>
                    <td>
                      {i.voidedAt ? (
                        <StatusChip tone="neu">Voided</StatusChip>
                      ) : i.totalLightsChecked === null ? (
                        <StatusChip tone="info">In progress</StatusChip>
                      ) : i._count.findings === 0 ? (
                        <StatusChip tone="ok">Clean</StatusChip>
                      ) : (
                        <StatusChip tone="warn">{i._count.findings} faulty</StatusChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Phone: the society (what you're scanning for) and its status
              chip lead; area/month/inspector — secondary, identifying detail
              — sit on one muted line; the two counts close the card, since
              they're only meaningful once the chip has already said
              in-progress/clean/faulty. */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {inspections.map((i) => (
              <Card key={i.id} className={`p-3.5 ${i.voidedAt ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/inspections/${i.id}`} className="min-w-0 font-medium hover:underline">
                    {i.society.name}
                  </Link>
                  <div className="shrink-0">
                    {i.voidedAt ? (
                      <StatusChip tone="neu">Voided</StatusChip>
                    ) : i.totalLightsChecked === null ? (
                      <StatusChip tone="info">In progress</StatusChip>
                    ) : i._count.findings === 0 ? (
                      <StatusChip tone="ok">Clean</StatusChip>
                    ) : (
                      <StatusChip tone="warn">{i._count.findings} faulty</StatusChip>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {i.area || "Whole society"} · {monthLabel(`${i.period}-01`)} · {formatDate(i.inspectedAt)}
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {i.inspectorName}
                </p>
                {i.totalLightsChecked !== null && (
                  <p className="mt-1.5 text-[12.5px]">
                    <span className="num font-medium">{i.totalLightsChecked}</span> checked ·{" "}
                    <span className="num font-medium">{i._count.findings}</span> faulty
                  </p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
