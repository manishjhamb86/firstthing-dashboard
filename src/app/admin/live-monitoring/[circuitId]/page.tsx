import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, PageHeader, StatusChip } from "@/components/ui";
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
import { type StoredReadingDTO } from "../../societies/[id]/circuits/[circuitId]/stored-readings-panel";
import { deriveBenchmark } from "@/lib/circuit-demos";
import { ReadingsExplorer } from "@/components/readings-explorer";
import { RecordReadingsDialog } from "@/components/record-readings-dialog";

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
      demos: {
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, savingsPct: true, preInstallBaseline: true, rejected: true },
      },
    },
  });

  // A file waiting in the review queue — filed by the meter page's import.
  // Surfaced here because for a circuit in live monitoring, THIS is the
  // screen the review happens on.
  const pendingRawFile = await db.rawReadingFile.findFirst({
    where: {
      circuitId,
      status: { in: ["pending_normalization", "awaiting_mapping", "ready"] },
    },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, fileName: true, meterCsvImports: { select: { id: true }, take: 1 } },
  });
  const resumeFile = pendingRawFile
    ? {
        id: pendingRawFile.id,
        fileName: pendingRawFile.fileName,
        fromMeter: pendingRawFile.meterCsvImports.length > 0,
      }
    : null;

  if (!circuit || circuit.voidedAt) notFound();

  const pipeline = circuit.siteSurvey
    ? await db.pipeline.findUnique({
        where: { id: circuit.siteSurvey.pipelineId },
        select: {
          stage: true,
          contract: { select: { termStart: true, activatedAt: true } },
          installationProject: {
            select: { certificate: { select: { signedAt: true, billingStartDate: true } } },
          },
        },
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
              flagged: r.anomalyFlag,
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

  // The demo record behind the agreement: what the demos measured, before
  // any override, and the baseline they measured against.
  const demoDerived = deriveBenchmark(circuit.demos);
  const demoBaseline = circuit.preInstallBaseline;
  const baselineRescaled = baselineNow !== null && demoBaseline !== null && Math.abs(baselineNow - demoBaseline) > 0.005;

  // Savings by period, each over its own days against the baseline in force.
  const monthOf = (d: string) => d.slice(0, 7);
  const nowIso = new Date().toISOString();
  const thisMonth = monthOf(nowIso);
  const lastMonth = monthOf(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString());
  const thisYear = nowIso.slice(0, 4);
  const periodPct = (days: StoredReadingDTO[]) => {
    const s = periodSavingsSummary(baselineNow, days.map((d) => ({ kWh: d.kWh, excluded: d.excluded })));
    return s.savingsPct === null ? null : { pct: s.savingsPct, band: s.band, days: days.filter((d) => !d.excluded).length };
  };
  const savingsRows = [
    { label: "This month", value: periodPct(monitoringDays.filter((d) => monthOf(d.date) === thisMonth)) },
    { label: "Last month", value: periodPct(monitoringDays.filter((d) => monthOf(d.date) === lastMonth)) },
    { label: "This year", value: periodPct(monitoringDays.filter((d) => d.date.startsWith(thisYear))) },
    { label: "Overall", value: periodPct(monitoringDays) },
  ];

  const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  const contractSince = fmtDate(pipeline?.contract?.termStart ?? pipeline?.contract?.activatedAt);
  const billingStarted = fmtDate(pipeline?.installationProject?.certificate?.billingStartDate);

  const lastStoredDate =
    circuit.meterReadings.length > 0
      ? circuit.meterReadings[circuit.meterReadings.length - 1].date
      : null;
  const window = circuitReadingWindow({
    meterInstalledAt: circuit.meterInstalledAt,
    lightReplacementDate: circuit.lightReplacementDate,
    preInstallBaseline: circuit.preInstallBaseline,
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
        action={
          !blocker && canIngest ? (
            <RecordReadingsDialog label="Record readings" waiting={resumeFile !== null}>
              <p className="mb-3 text-sm text-[var(--text-muted)]">
                Billing started after the completion certificate (CON-22). A released month can no
                longer be changed (INV-03).
              </p>
              <CircuitReadingPanel
                circuitId={circuit.id}
                window={windowDTO}
                demoMode={demoOn}
                resumeFile={resumeFile}
              />
            </RecordReadingsDialog>
          ) : undefined
        }
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
          {/* Grouped, not one tile per figure (the user's call, 2026-08-28):
              the agreement, the demo record it rests on, and the savings by
              period each read as one story rather than eight loose numbers. */}
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <p className="lbl mb-3">The agreement</p>
              <p className="flex items-baseline gap-2">
                <span className="num text-[28px] font-semibold leading-none">
                  {circuit.benchmarkSavingsPct?.toFixed(1) ?? "—"}%
                </span>
                <span className="text-[13px] text-[var(--text-muted)]">benchmark, fixed for the term</span>
              </p>
              <dl className="mt-4 space-y-2 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-subtle)]">Contract in force since</dt>
                  <dd className="num">{contractSince ?? <span className="text-[var(--text-subtle)]">not recorded</span>}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-subtle)]">Billing started</dt>
                  <dd className="num">{billingStarted ?? <span className="text-[var(--text-subtle)]">not recorded</span>}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5">
              <p className="lbl mb-3">The demo behind it</p>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-subtle)]">
                    {baselineRescaled ? "Baseline at demo" : "Demo baseline · in force"}
                  </dt>
                  <dd className="num">{demoBaseline !== null ? `${demoBaseline.toFixed(2)} kWh/day` : "—"}</dd>
                </div>
                {baselineRescaled && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--text-subtle)]">Baseline in force (rescaled)</dt>
                    <dd className="num">{baselineNow?.toFixed(2)} kWh/day</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-subtle)]">Demo-measured benchmark</dt>
                  <dd className="num">
                    {demoDerived.raw !== null ? `${demoDerived.raw.toFixed(2)}%` : (
                      <span className="text-[var(--text-subtle)]">no demo on record</span>
                    )}
                  </dd>
                </div>
                {demoDerived.raw !== null &&
                  circuit.benchmarkSavingsPct !== null &&
                  Math.abs(demoDerived.raw - circuit.benchmarkSavingsPct) > 0.05 && (
                    <p className="pt-1 text-[12px] text-[var(--text-muted)]">
                      The agreed figure differs from what the demo measured — the agreement is what
                      billing follows; the measurement stays on record.
                    </p>
                  )}
              </dl>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="lbl">Savings</p>
                <span className="text-[12px] text-[var(--text-subtle)]">
                  against {baselineNow?.toFixed(2) ?? "—"} kWh/day
                </span>
              </div>
              <dl className="space-y-2 text-[13px]">
                {savingsRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4">
                    <dt className="text-[var(--text-subtle)]">{row.label}</dt>
                    <dd>
                      {row.value === null ? (
                        <span className="text-[var(--text-subtle)]">no days</span>
                      ) : (
                        <span
                          className="num inline-block rounded-[var(--r-sm)] px-2 py-0.5 text-[12px] font-semibold"
                          style={{
                            background: row.value.band ? SAVINGS_BAND_META[row.value.band].bg : "var(--neu-bg)",
                          }}
                        >
                          {row.value.pct.toFixed(1)}%
                          <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                            · {row.value.days}d
                          </span>
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 border-t pt-2 text-[12px] text-[var(--text-subtle)]" style={{ borderColor: "var(--border)" }}>
                {monitoringDays.length} days recorded
                {monitoringDays.filter((d) => d.excluded).length > 0 &&
                  ` · ${monitoringDays.filter((d) => d.excluded).length} excluded`}
                {monitoringDays.filter((d) => d.flagged).length > 0 &&
                  ` · ${monitoringDays.filter((d) => d.flagged).length} flagged`}
              </p>
            </Card>
          </div>

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
            {/* The readings are what this screen is FOR — they open at the
                top, latest first, with the recording flow behind the header
                button rather than a card pushing them below the fold. */}
            <ReadingsExplorer readings={monitoringDays} canEdit={canIngest} />
          </section>
        </>
      )}
    </>
  );
}
