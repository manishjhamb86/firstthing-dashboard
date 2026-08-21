import Link from "next/link";
import { db } from "@/lib/db";
import { ListToolbar } from "@/components/list-toolbar";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { READING_UPLOAD_STATUS } from "@/lib/status-maps";
import { UploadPanel } from "./upload-panel";

// SCR-080's R0 slice. The screen's own spec also covers bulk multi-circuit
// upload (FEAT-099) and the full reconciliation report (FEAT-107) — both R1,
// deliberately not built here. What R0 owes is one file, one circuit, one
// period, with the duplicate case handled explicitly (FEAT-043-AC-5) rather
// than silently double-counted.
export default async function ReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireAdminPage("manage_pipeline");
  const isOps = session.user.adminPermissions.includes("manage_survey");
  const { period: periodParam } = await searchParams;

  const now = new Date();
  // Defaults to last month: readings are uploaded at month end or on the
  // first of the following month (CON-43), so the month just finished is
  // what an operator is almost always here for. It is still a selection —
  // INV-04 means the period is never *inferred from the file*, not that the
  // field can't have a sensible starting value.
  const defaultPeriod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
  const period = /^\d{4}-\d{2}$/.test(periodParam ?? "") ? (periodParam as string) : defaultPeriod;

  const [circuits, uploads, openAnomalies] = await Promise.all([
    db.circuit.findMany({
      where: { voidedAt: null, state: { in: ["benchmark_confirmed", "active_billing"] } },
      select: {
        id: true,
        lightType: true,
        location: true,
        state: true,
        society: { select: { id: true, name: true } },
      },
      orderBy: [{ society: { name: "asc" } }, { lightType: "asc" }],
    }),
    db.rawReadingFile.findMany({
      where: { period },
      include: {
        circuit: { select: { id: true, lightType: true, society: { select: { name: true } } } },
        uploadedBy: { select: { name: true, email: true } },
        _count: { select: { readings: true, anomalies: true } },
      },
      orderBy: { uploadedAt: "desc" },
    }),
    db.readingAnomaly.count({ where: { period, status: { in: ["open", "sent_back"] }, blocksBilling: true } }),
  ]);

  const daysIngested = uploads
    .filter((u) => u.status === "committed")
    .reduce((sum, u) => sum + u._count.readings, 0);

  const committedCircuitIds = new Set(
    uploads.filter((u) => u.status === "committed").map((u) => u.circuitId),
  );
  const awaiting = circuits.filter((c) => !committedCircuitIds.has(c.id));

  return (
    <>
      <PageHeader
        title="Meter readings"
        subtitle={`${period} · ${committedCircuitIds.size} of ${circuits.length} billable circuits have readings`}
        chip={
          openAnomalies > 0 ? (
            <StatusChip tone="bad">{openAnomalies} blocking this month</StatusChip>
          ) : undefined
        }
        action={
          <Link href="/admin/readings/anomalies" className="btn-secondary">
            Anomaly review
          </Link>
        }
      />

      <StatRow>
        {[
          {
            label: "Circuits covered",
            value: `${committedCircuitIds.size}/${circuits.length}`,
            detail: circuits.length === 0 ? "none billable yet" : `for ${period}`,
          },
          { label: "Days ingested", value: daysIngested.toLocaleString("en-IN"), detail: "committed readings" },
          {
            label: "Awaiting readings",
            value: awaiting.length,
            detail: awaiting.length === 0 ? "every circuit in" : "no file yet",
          },
          {
            label: "Blocking flags",
            value: openAnomalies,
            detail: openAnomalies === 0 ? "nothing held up" : "bills held until resolved",
          },
        ].map((f) => (
          <Stat key={f.label} label={f.label} value={f.value} detail={f.detail} />
        ))}
      </StatRow>

      {/* This page's toolbar. It used to stack a label above the input and
          run a sentence beside it, which made the list start 30px lower here
          than on every other page. The label moves to the input's own
          aria-label and INV-04's note to its title — the rule still holds,
          it just is not costing a row of vertical space on every visit. */}
      <form method="get">
        <ListToolbar>
          <input
            id="period"
            name="period"
            type="month"
            defaultValue={period}
            aria-label="Reading period — an explicit choice, never read from the file's own dates (INV-04)"
            title="An explicit choice, never read from the file's own dates (INV-04)."
            className="field field-auto"
          />
          <button type="submit" className="btn-secondary">
            Show
          </button>
        </ListToolbar>
      </form>

      {isOps ? (
        <UploadPanel
          period={period}
          circuits={circuits.map((c) => ({
            id: c.id,
            label: `${c.society.name} — ${c.lightType}${c.location ? ` (${c.location})` : ""}`,
            alreadyHasReadings: committedCircuitIds.has(c.id),
          }))}
        />
      ) : (
        <Card className="p-6 mb-6">
          <CardTitle>Uploading readings</CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            Reading ingest is an operations lead action — it needs both pipeline and field-survey
            authority. You can see every upload and its readings here.
          </p>
        </Card>
      )}

      {circuits.length > 0 && awaiting.length > 0 && (
        <Card className="p-6 mb-6">
          <CardTitle>Awaiting readings</CardTitle>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            These circuits are billable for {period} and have no committed file yet. A month cannot
            be calculated for a circuit with no readings.
          </p>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Circuit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {awaiting.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.society.name}</td>
                    <td className="text-[var(--text-muted)]">
                      {c.lightType}
                      {c.location ? ` · ${c.location}` : ""}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/societies/${c.society.id}/circuits/${c.id}`}
                        className="text-sm underline"
                      >
                        Open circuit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <CardTitle>Uploads this period</CardTitle>
        {uploads.length === 0 ? (
          // FEAT-043-AC-2 — explain how to upload rather than showing an
          // empty chart of nothing.
          <EmptyState title={`No readings uploaded for ${period} yet`}>
            Download the month&apos;s export from the meter vendor&apos;s app — one file per circuit —
            and upload it above. The file is stored before anything is read from it, so nothing is
            lost if the mapping needs another go.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Circuit</th>
                  <th>File</th>
                  <th>Status</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">Flags</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => {
                  const meta = READING_UPLOAD_STATUS[u.status] ?? { label: u.status, tone: "neu" as const };
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.circuit.society.name}
                        <span className="text-[var(--text-muted)]"> — {u.circuit.lightType}</span>
                      </td>
                      <td className="max-w-[220px] truncate" title={u.fileName}>
                        {u.fileName}
                      </td>
                      <td>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      </td>
                      <td className="num text-right">{u._count.readings || "—"}</td>
                      <td className="num text-right">{u._count.anomalies || "—"}</td>
                      <td className="text-[var(--text-muted)]">
                        {u.uploadedAt.toISOString().slice(0, 10)} ·{" "}
                        {u.uploadedBy.name ?? u.uploadedBy.email}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/admin/readings/circuit/${u.circuitId}`}
                          className="text-sm underline"
                        >
                          History
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
