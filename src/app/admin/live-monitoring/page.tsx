import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin-permissions";
import { LIVE_MONITORING_WHERE } from "@/lib/live-monitoring";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { classifyDay, periodSavingsSummary } from "@/lib/circuit-load";
import { LiveList, type LiveSocietyRow } from "./live-list";

// Live monitoring — the circuits past commissioning AND past installation,
// whose monthly readings feed billing.
//
// Its own tab, not a section under the demo board (the user's call,
// 2026-08-21). The two answer different questions: the board is a finite
// chase toward a benchmark, per circuit; this is an ongoing per-society
// question — are we holding the benchmark we bill on. Different cadence,
// different audience, and only this one ever matters to a contract.
export default async function LiveMonitoringPage() {
  const session = await requireAdminPage();
  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin");

  const now = new Date();
  const circuits = await db.circuit.findMany({
    where: LIVE_MONITORING_WHERE,
    include: {
      society: { select: { id: true, name: true, location: true } },
      rescaleEvents: true,
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const bySociety = new Map<string, LiveSocietyRow>();
  for (const c of circuits) {
    // Only the post-replacement days: those are what a savings figure is
    // measured from.
    const days =
      c.meterInstalledAt && c.lightReplacementDate
        ? c.meterReadings.filter(
            (r) => classifyDay(r.date, c.meterInstalledAt!, c.lightReplacementDate) === "post_install",
          )
        : [];
    const baseline = effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, now);
    const summary = periodSavingsSummary(
      baseline,
      days.map((d) => ({ kWh: d.kWh, excluded: d.excludedAt !== null })),
    );
    const last = days.length > 0 ? days[days.length - 1].date : null;

    const row = bySociety.get(c.societyId) ?? {
      id: c.society.id,
      name: c.society.name,
      location: c.society.location,
      circuits: [],
    };
    row.circuits.push({
      id: c.id,
      label: c.location || c.lightType,
      serviceLine: c.serviceLine,
      benchmarkPct: c.benchmarkSavingsPct,
      measuredPct: summary.savingsPct,
      warn: summary.warn,
      days: days.length,
      lastReading: last ? last.toISOString().slice(0, 10) : null,
    });
    bySociety.set(c.societyId, row);
  }

  const societies = [...bySociety.values()].sort((a, b) => a.name.localeCompare(b.name));
  const serviceLines = [...new Set(circuits.map((c) => c.serviceLine as string))].sort();
  const belowBand = societies.filter((s) => s.circuits.some((c) => c.warn)).length;
  const liveCircuits = societies.reduce((n, s) => n + s.circuits.length, 0);
  const measured = societies.reduce((n, s) => n + s.circuits.filter((c) => c.measuredPct != null).length, 0);

  return (
    <>
      <PageHeader
        title="Live monitoring"
        subtitle="Installed, signed off and billing."
        chip={
          societies.length === 0 ? undefined : belowBand > 0 ? (
            <Link href="/admin/live-monitoring?warn=1" aria-label="Show only circuits below band">
              <StatusChip tone="warn">
                {belowBand} societ{belowBand === 1 ? "y" : "ies"} below band
              </StatusChip>
            </Link>
          ) : (
            <StatusChip tone="ok">All on target</StatusChip>
          )
        }
      />

      <StatRow>
        <Stat label="Societies billing" value={societies.length} detail={societies.length === 0 ? "none live yet" : "signed off and invoicing"} />
        <Stat label="Circuits live" value={liveCircuits} detail={`${serviceLines.length} service line${serviceLines.length === 1 ? "" : "s"}`} />
        <Stat label="Measured this month" value={measured} detail={measured === liveCircuits ? "every circuit reported" : `${liveCircuits - measured} awaiting readings`} />
        <Stat label="Below band" value={belowBand} tone={belowBand > 0 ? "warn" : "ok"} detail={belowBand === 0 ? "all inside CON-20" : "societies under 60%"} />
      </StatRow>

      <LiveList societies={societies} serviceLines={serviceLines} />
    </>
  );
}
