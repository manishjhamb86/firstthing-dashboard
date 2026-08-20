import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, KpiTile, PageHeader, StatusChip } from "@/components/ui";
import { READING_ANOMALY_KIND, READING_ANOMALY_STATUS, READING_UPLOAD_STATUS } from "@/lib/status-maps";
import { coverageOf, describeCoverage, monthlyFigure } from "@/lib/reading-coverage";
import { RawFileLink } from "./raw-file-link";

// FEAT-047 — the provenance chain, walkable in one direction: a monthly
// figure → the days that make it → the upload that produced them → the
// original file. Every link on that path is on this page, because a figure
// whose evidence takes three screens to reach is a figure nobody checks.
export default async function CircuitReadingHistory({
  params,
  searchParams,
}: {
  params: Promise<{ circuitId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  await requireAdminPage("manage_pipeline");
  const { circuitId } = await params;
  const { period: periodParam } = await searchParams;

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: { society: { select: { id: true, name: true } } },
  });
  if (!circuit) notFound();

  const files = await db.rawReadingFile.findMany({
    where: { circuitId },
    include: {
      uploadedBy: { select: { name: true, email: true } },
      _count: { select: { readings: true } },
      supersededBy: { select: { id: true, fileName: true, uploadedAt: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });

  // Circuit-flow uploads (CON-45) carry a derived date range instead of a
  // chosen month; this month-scoped billing view lists only the month-scoped
  // uploads.
  const periods = [...new Set(files.map((f) => f.period).filter((p): p is string => p !== null))]
    .sort()
    .reverse();
  const period = periodParam && periods.includes(periodParam) ? periodParam : periods[0];

  const [readings, anomalies, acceptance] = period
    ? await Promise.all([
        db.meterReading.findMany({
          where: { circuitId, date: monthRange(period) },
          include: { rawFile: { select: { id: true, fileName: true } } },
          orderBy: { date: "asc" },
        }),
        db.readingAnomaly.findMany({
          where: { circuitId, period },
          orderBy: [{ date: "asc" }],
        }),
        db.coverageAcceptance.findUnique({ where: { circuitId_period: { circuitId, period } } }),
      ])
    : [[], [], null];

  const days = readings.map((r) => ({ date: r.date, kWh: r.kWh, excluded: r.excludedAt !== null }));
  const coverage = period ? coverageOf(days, period) : null;
  const figure = period ? monthlyFigure(days, period, { coverageAccepted: !!acceptance }) : null;

  return (
    <>
      <PageHeader
        backHref={`/admin/societies/${circuit.society.id}/circuits/${circuit.id}`}
        title={`${circuit.lightType} readings`}
        subtitle={
          circuit.location
            ? `${circuit.location} · ${circuit.meteredLightCount} metered of ${circuit.representedLightCount} represented`
            : `${circuit.meteredLightCount} metered of ${circuit.representedLightCount} represented`
        }
        action={
          <Link href="/admin/readings" className="btn-secondary">
            Reading upload
          </Link>
        }
      />

      {periods.length > 1 && (
        <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="period" className="lbl">
              Period
            </label>
            <select id="period" name="period" defaultValue={period} className="field field-auto">
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            Show
          </button>
        </form>
      )}

      {period && (
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <KpiTile
            label={`${period} total`}
            // FEAT-046-AC-2/AC-5 — "no data" and "not billable from this" are
            // both said out loud, never rendered as a zero.
            value={figure ? `${figure.totalKwh.toFixed(1)} kWh` : "No figure"}
            detail={
              figure
                ? `${figure.meanDailyKwh.toFixed(2)} kWh/day over ${figure.coverage.coverageDays} days with data`
                : readings.length === 0
                  ? "No readings — this is an absence of data, not zero consumption."
                  : "Below the 20-day floor and not explicitly accepted, so no billing-grade figure is computed."
            }
          />
          <KpiTile
            label="Coverage"
            value={coverage ? `${coverage.coverageDays}/${coverage.daysInMonth}` : "—"}
            detail={coverage ? describeCoverage(coverage) : undefined}
          />
          <KpiTile
            label="Flags"
            value={anomalies.filter((a) => a.status === "open").length}
            detail={
              acceptance
                ? `Low coverage accepted: ${acceptance.reason}`
                : `${anomalies.length} raised in total for this month`
            }
          />
        </div>
      )}

      <Card className="p-6 mb-6">
        <CardTitle>Uploads</CardTitle>
        {files.length === 0 ? (
          // FEAT-047-AC-2
          <EmptyState title="No uploads for this circuit yet">
            Once a vendor export is uploaded, every version of it stays here — including any that
            were later replaced.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Uploaded</th>
                  <th>File</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="text-right">Days</th>
                  <th>Mapping</th>
                  <th>Raw file</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const meta = READING_UPLOAD_STATUS[f.status] ?? { label: f.status, tone: "neu" as const };
                  const mapping = f.confirmedMapping as Record<string, unknown> | null;
                  return (
                    <tr key={f.id}>
                      <td className="num">
                        {f.uploadedAt.toISOString().slice(0, 16).replace("T", " ")}
                        <div className="text-xs text-[var(--text-muted)]">
                          {f.uploadedBy.name ?? f.uploadedBy.email}
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate" title={f.fileName}>
                        {f.fileName}
                        {f.vendor && (
                          <div className="text-xs text-[var(--text-muted)]">{f.vendor}</div>
                        )}
                      </td>
                      <td className="num">{f.period}</td>
                      <td>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                        {/* FEAT-047-AC-5 — a replaced upload keeps its place
                            in the history, and says what replaced it. */}
                        {f.supersededBy && (
                          <div className="mt-1 text-xs text-[var(--text-muted)]">
                            Replaced by {f.supersededBy.fileName} on{" "}
                            {f.supersededBy.uploadedAt.toISOString().slice(0, 10)}
                          </div>
                        )}
                        {f.aiError && (
                          <div className="mt-1 text-xs" style={{ color: "var(--warn-fg)" }}>
                            {f.aiError}
                          </div>
                        )}
                      </td>
                      <td className="num text-right">{f._count.readings || "—"}</td>
                      <td className="text-xs text-[var(--text-muted)]">
                        {mapping ? (
                          <>
                            col {String(mapping.dateColumn)}
                            {mapping.timeColumn !== null ? `+${String(mapping.timeColumn)}` : ""} →{" "}
                            {String(mapping.valueColumn)} · {String(mapping.valueUnit)} ·{" "}
                            {String(mapping.valueKind)}
                            {f.mappingOverridden && (
                              <div style={{ color: "var(--warn-fg)" }}>
                                overridden by the operator
                              </div>
                            )}
                            {f.aiConfidence && <div>AI: {f.aiConfidence} confidence</div>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {/* FEAT-047-AC-4 — never a bare S3 URL. The object
                            lives under the private Ingest/ prefix and is
                            reachable only through an admin-gated signed link. */}
                        <RawFileLink rawFileId={f.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {period && (
        <Card className="p-6 mb-6">
          <CardTitle>Daily readings — {period}</CardTitle>
          {readings.length === 0 ? (
            <EmptyState title="No readings for this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="text-right">kWh</th>
                    <th className="text-right">Intervals</th>
                    <th>State</th>
                    <th>From</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id}>
                      <td className="num">{r.date.toISOString().slice(0, 10)}</td>
                      <td className="num text-right">{r.kWh.toFixed(3)}</td>
                      <td className="num text-right">{r.intervalCount ?? "—"}</td>
                      <td>
                        {r.excludedAt ? (
                          <StatusChip tone="neu">Excluded</StatusChip>
                        ) : r.anomalyFlag ? (
                          <StatusChip tone="warn">Flagged</StatusChip>
                        ) : (
                          <StatusChip tone="ok">Counted</StatusChip>
                        )}
                        {r.supersededValue !== null && (
                          <div className="mt-1 text-xs text-[var(--text-muted)]">
                            was {r.supersededValue.toFixed(3)} kWh
                          </div>
                        )}
                        {r.excludedReason && (
                          <div className="mt-1 text-xs text-[var(--text-muted)]">{r.excludedReason}</div>
                        )}
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">{r.rawFile.fileName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {period && anomalies.length > 0 && (
        <Card className="p-6">
          <CardTitle>Flags raised — {period}</CardTitle>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Finding</th>
                  <th>Detail</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a) => {
                  const kind = READING_ANOMALY_KIND[a.kind] ?? { label: a.kind, tone: "neu" as const };
                  const status = READING_ANOMALY_STATUS[a.status] ?? { label: a.status, tone: "neu" as const };
                  return (
                    <tr key={a.id}>
                      <td className="num">{a.date ? a.date.toISOString().slice(0, 10) : "—"}</td>
                      <td>
                        <StatusChip tone={kind.tone}>{kind.label}</StatusChip>
                      </td>
                      <td className="max-w-[420px] text-sm">{a.detail}</td>
                      <td>
                        <StatusChip tone={status.tone}>{status.label}</StatusChip>
                        {a.resolutionReason && (
                          <div className="mt-1 text-xs text-[var(--text-muted)]">{a.resolutionReason}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}
