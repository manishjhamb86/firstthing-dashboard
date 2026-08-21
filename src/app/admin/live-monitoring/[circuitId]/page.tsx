import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, KpiTile, PageHeader, StatusChip } from "@/components/ui";
import { isDemoMode } from "@/lib/demo-mode";
import { liveMonitoringBlocker } from "@/lib/live-monitoring";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import {
  circuitReadingWindow,
  classifyDay,
  periodSavingsSummary,
  savingsBand,
  savingsPct,
  SAVINGS_BAND_META,
} from "@/lib/circuit-load";
import {
  CircuitReadingPanel,
  type ReadingWindowDTO,
} from "../../societies/[id]/circuits/[circuitId]/circuit-reading-panel";
import { StoredReadingsPanel, type StoredReadingDTO } from "../../societies/[id]/circuits/[circuitId]/stored-readings-panel";

// Live monitoring for one circuit — the monthly readings that feed billing.
//
// Deliberately NOT on the circuit page: that page is the commissioning
// sequence, and this only exists once the sequence is finished AND the
// installation is signed off (CON-22). See src/lib/live-monitoring.ts.
export default async function LiveMonitoringCircuitPage({
  params,
}: {
  params: Promise<{ circuitId: string }>;
}) {
  const session = await requireAdminPage();
  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin");
  // Committing a monthly month is billing ingest — FEAT-043-AC-4's ops-lead
  // action. The actions re-check this for themselves; this only decides
  // whether the panel is offered.
  const canIngest =
    (session.user.adminPermissions?.includes("manage_survey") ?? false) &&
    (session.user.adminPermissions?.includes("manage_pipeline") ?? false);

  const demoOn = await isDemoMode();
  const { circuitId } = await params;
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      society: { select: { id: true, name: true } },
      siteSurvey: { select: { pipelineId: true } },
      rescaleEvents: true,
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
  });
  if (!circuit || circuit.voidedAt) notFound();

  const pipeline = circuit.siteSurvey
    ? await db.pipeline.findUnique({
        where: { id: circuit.siteSurvey.pipelineId },
        select: { stage: true, installationProject: { select: { certificate: { select: { signedAt: true } } } } },
      })
    : null;
  const installationSignedOff =
    pipeline?.stage === "active_billing" || !!pipeline?.installationProject?.certificate;

  const blocker = liveMonitoringBlocker({
    benchmarkSavingsPct: circuit.benchmarkSavingsPct,
    installationCertificateSigned: installationSignedOff,
  });

  const circuitHref = `/admin/societies/${circuit.societyId}/circuits/${circuit.id}`;
  const baselineNow = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, new Date());

  // Only the monitoring days — the commissioning ones stay on the circuit
  // page, where the steps that produced them are.
  const monitoringDays: StoredReadingDTO[] =
    circuit.meterInstalledAt && circuit.lightReplacementDate
      ? circuit.meterReadings
          .filter(
            (r) =>
              classifyDay(r.date, circuit.meterInstalledAt!, circuit.lightReplacementDate) ===
              "post_install",
          )
          .map((r) => {
            const b = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, r.date);
            const pct = b === null ? null : savingsPct(b, r.kWh);
            return {
              id: r.id,
              date: r.date.toISOString().slice(0, 10),
              kWh: r.kWh,
              intervalCount: r.intervalCount,
              expectedIntervals: r.expectedIntervals,
              phase: "monitoring" as const,
              excluded: r.excludedAt !== null,
              excludedReason: r.excludedReason,
              released: r.usedInCalculationId !== null,
              superseded: r.supersededAt !== null,
              variancePct: null,
              varianceBand: null,
              savingsPct: pct,
              savingsBand: pct === null ? null : savingsBand(pct),
            };
          })
      : [];

  const summary = periodSavingsSummary(
    baselineNow,
    monitoringDays.map((d) => ({ kWh: d.kWh, excluded: d.excluded })),
  );
  const band = summary.band ? SAVINGS_BAND_META[summary.band] : null;

  const lastStoredDate =
    circuit.meterReadings.length > 0
      ? circuit.meterReadings[circuit.meterReadings.length - 1].date
      : null;
  const window = circuitReadingWindow({
    meterInstalledAt: circuit.meterInstalledAt,
    lightReplacementDate: circuit.lightReplacementDate,
    benchmarkSavingsPct: circuit.benchmarkSavingsPct,
    lastStoredDate,
    demo: demoOn,
  });
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const windowDTO: ReadingWindowDTO | null = window
    ? {
        kind: window.kind,
        from: day(window.from),
        to: day(window.to),
        empty: window.empty,
        demoExtended: window.demoExtended,
        startBasis:
          window.kind === "monitoring" && lastStoredDate
            ? `one day before the last stored reading (${day(
                lastStoredDate,
              )}), so a part-day at the end of the previous file is re-read in full`
            : `the day after the lights were replaced (${
                circuit.lightReplacementDate ? day(circuit.lightReplacementDate) : "—"
              })`,
      }
    : null;

  return (
    <>
      <PageHeader
        backHref="/admin/live-monitoring"
        title={circuit.location || circuit.lightType}
        chip={
          blocker ? (
            <StatusChip tone="warn">Not live yet</StatusChip>
          ) : (
            <StatusChip tone="ok">Live monitoring</StatusChip>
          )
        }
        subtitle={`${circuit.society.name} · ${circuit.lightType} · ${circuit.meteredLightCount} metered of ${circuit.representedLightCount} represented`}
      />

      {blocker ? (
        <Card className="p-5 max-w-2xl">
          <p className="text-sm">{blocker}</p>
          <p className="mt-3 text-sm">
            <Link href={circuitHref} className="underline">
              Open the circuit&apos;s commissioning page →
            </Link>
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 mb-6 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Benchmark"
              value={circuit.benchmarkSavingsPct?.toFixed(1) ?? "—"}
              detail="% savings, fixed for the term"
            />
            <KpiTile
              label="Baseline in force"
              value={baselineNow?.toFixed(2) ?? "—"}
              detail="kWh/day"
            />
            <KpiTile
              label="Days recorded"
              value={monitoringDays.length}
              detail={monitoringDays.filter((d) => d.excluded).length > 0
                ? `${monitoringDays.filter((d) => d.excluded).length} excluded`
                : "none excluded"}
            />
            <KpiTile
              label="Measured savings"
              value={summary.savingsPct != null ? summary.savingsPct.toFixed(1) : "—"}
              detail={band ? `% · ${band.label}` : "% — no days yet"}
            />
          </div>

          <section className="max-w-none mb-8">
            <h2 className="text-[15px] font-semibold mb-1">Record this month&apos;s readings</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              Billing started after the completion certificate (CON-22). Every day here is reviewed
              before it is saved, and a released month can no longer be changed (INV-03).
            </p>
            {canIngest ? (
              <CircuitReadingPanel
                circuitId={circuit.id}
                window={windowDTO}
                demoMode={demoOn}
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Monthly readings feed billing — recording them is an operations-lead action.
              </p>
            )}
          </section>

          <section className="max-w-none">
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm">
              <Link href={circuitHref} className="underline">
                Commissioning record →
              </Link>
              {monitoringDays.length > 0 && (
                <Link href={`${circuitHref}/reports/monthly`} className="underline">
                  Monthly savings report →
                </Link>
              )}
            </div>
            <StoredReadingsPanel
              readings={monitoringDays}
              canEdit={canIngest}
              summaries={
                summary.averageKwh === null
                  ? []
                  : [
                      {
                        phase: "monitoring",
                        label: "monitoring",
                        averageKwh: summary.averageKwh,
                        savingsPct: summary.savingsPct,
                        savingsBand: summary.band,
                        warn: summary.warn,
                      },
                    ]
              }
            />
          </section>
        </>
      )}
    </>
  );
}
