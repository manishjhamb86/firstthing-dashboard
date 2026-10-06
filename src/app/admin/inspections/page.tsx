import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
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

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <CardTitle>{monthLabel(`${currentPeriod}-01`)} so far</CardTitle>
          <StatRow>
            <Stat label="Done" value={monthSummary.doneCount} tone="ok" detail={`of ${monthSummary.totalActive} active societies`} />
            <Stat label="Pending" value={monthSummary.pendingCount} tone="accent" detail="not yet visited this month" />
            <Stat
              label="Delayed"
              value={monthSummary.delayedCount}
              tone={monthSummary.delayedCount > 0 ? "bad" : "accent"}
              detail="missed last month too"
            />
          </StatRow>
        </Card>

        <Card className="p-5">
          <CardTitle>Fault pattern, overall</CardTitle>
          {faultSummary.normalCount + faultSummary.chronicCount === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">
              No society has enough finalised inspections yet to judge a pattern ({faultSummary.notEnoughHistoryCount} still building history).
            </p>
          ) : faultSummary.chronicCount === 0 ? (
            <p className="text-[13px]">
              <span className="num font-semibold" style={{ color: "var(--ok-fg)" }}>
                {faultSummary.normalCount}
              </span>{" "}
              societ{faultSummary.normalCount === 1 ? "y has" : "ies have"} a normal inspection pattern overall — nothing alarming.
              {faultSummary.notEnoughHistoryCount > 0 &&
                ` ${faultSummary.notEnoughHistoryCount} ${faultSummary.notEnoughHistoryCount === 1 ? "is" : "are"} still building history.`}
            </p>
          ) : (
            <>
              <p className="mb-2 text-[13px]">
                <span className="num font-semibold" style={{ color: "var(--ok-fg)" }}>
                  {faultSummary.normalCount}
                </span>{" "}
                normal ·{" "}
                <span className="num font-semibold" style={{ color: "var(--bad-fg)" }}>
                  {faultSummary.chronicCount}
                </span>{" "}
                society{faultSummary.chronicCount === 1 ? "" : "ies"} with repeated faults every visit, well above the portfolio&rsquo;s own typical rate
                {faultSummary.notEnoughHistoryCount > 0 &&
                  ` (${faultSummary.notEnoughHistoryCount} still building history)`}
                .
              </p>
              <ul className="flex flex-col">
                {faultSummary.chronic.map((c, i) => (
                  <li
                    key={c.societyId}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]"
                    style={i < faultSummary.chronic.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[var(--text-muted)]">
                      <span className="num" style={{ color: "var(--bad-fg)" }}>
                        {c.recentFaultRatePct.toFixed(1)}%
                      </span>{" "}
                      faulty, last {c.inspectionsConsidered} visits — a real pattern, likely a poor resident experience worth a closer look.
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

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
        <Card className="overflow-x-auto p-0">
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
      )}
    </>
  );
}
