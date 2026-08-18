import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { CardTabs } from "@/components/tabs";
import { latestVarianceFromAveragePct, averageOfValid } from "@/lib/monitoring-window";
import { reviewUrgency } from "@/lib/demo-result-review";
import { requireAdminPage } from "@/lib/admin-permissions";

const REQUIRED_VALID_DAYS = 5;

/** Days here are stored at UTC midnight; compare on the same footing. */
function utcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function loggedToday(readings: { date: Date }[], now: Date) {
  const today = utcDay(now);
  return readings.some((r) => utcDay(r.date) === today);
}

function dayCount(readings: { status: string }[]) {
  return readings.filter((r) => r.status === "valid").length;
}

function DayStrip({ validCount }: { validCount: number }) {
  return (
    <span className="inline-flex gap-1 align-middle" aria-hidden>
      {Array.from({ length: REQUIRED_VALID_DAYS }, (_, i) => (
        <span
          key={i}
          className="h-1.5 w-4 rounded-full"
          style={{ background: i < validCount ? "var(--accent)" : "var(--surface-active)" }}
        />
      ))}
    </span>
  );
}

export default async function MonitoringDashboardPage() {
  const session = await requireAdminPage();

  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin");

  // One clock for the whole render, so two rows can't land on either side of
  // an SLA boundary in the same table.
  const now = new Date();

  // FEAT-012/014 — every circuit currently mid-window, across every
  // society, in one place: the bird's-eye "what needs a reading today"
  // view that drilling into one circuit at a time doesn't give.
  const [openReviews, preInstallActive, postInstallActive, recentlyResolved] = await Promise.all([
    // FEAT-015 — the investigation queue. Ordered by occurrence first, so a
    // circuit that has already failed a re-run outranks one nobody has looked
    // at yet (AC-5), then oldest-first within that.
    db.demoResultReview.findMany({
      where: { state: "open", circuit: { voidedAt: null } },
      include: { circuit: { include: { society: true } } },
      orderBy: [{ occurrence: "desc" }, { raisedAt: "asc" }],
    }),
    db.circuit.findMany({
      where: { voidedAt: null, preInstallWindowStartAt: { not: null }, preInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "pre_install" }, orderBy: { date: "asc" } },
      },
      orderBy: { preInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, postInstallWindowStartAt: { not: null }, postInstallBaseline: null },
      include: {
        society: true,
        commissioningReadings: { where: { windowType: "post_install" }, orderBy: { date: "asc" } },
      },
      orderBy: { postInstallWindowStartAt: "asc" },
    }),
    db.circuit.findMany({
      where: { voidedAt: null, state: { in: ["benchmark_confirmed", "benchmark_review"] } },
      include: { society: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const preRows = preInstallActive.map((c) => {
    const readings = c.commissioningReadings.filter(
      (r) => c.preInstallWindowStartAt && r.date >= c.preInstallWindowStartAt,
    );
    return {
      circuit: c,
      validCount: dayCount(readings),
      pendingAnomaly: readings.some((r) => r.status === "anomaly"),
      loggedToday: loggedToday(readings, now),
      variancePct: latestVarianceFromAveragePct(readings),
    };
  });

  const postRows = postInstallActive.map((c) => {
    const readings = c.commissioningReadings.filter(
      (r) => c.postInstallWindowStartAt && r.date >= c.postInstallWindowStartAt,
    );
    const avgSoFar = averageOfValid(readings);
    const projectedSavingsPct =
      avgSoFar != null && c.preInstallBaseline
        ? ((c.preInstallBaseline - avgSoFar) / c.preInstallBaseline) * 100
        : null;
    return {
      circuit: c,
      validCount: dayCount(readings),
      pendingAnomaly: readings.some((r) => r.status === "anomaly"),
      loggedToday: loggedToday(readings, now),
      projectedSavingsPct,
    };
  });

  // Four stacked empty states is not a dashboard; when there is genuinely
  // nothing in flight, say that once.

  const activeWindows = preRows.length + postRows.length;
  const awaitingToday = [...preRows, ...postRows].filter(
    (r) => !r.loggedToday && !r.pendingAnomaly,
  ).length;
  const anomaliesOpen = [...preRows, ...postRows].filter((r) => r.pendingAnomaly).length;

  const tabs = [
    { id: "review", label: "Needs review", count: openReviews.length, urgent: openReviews.length > 0 },
    { id: "pre", label: "Pre-install", count: preRows.length },
    { id: "post", label: "Post-install", count: postRows.length },
    { id: "resolved", label: "Resolved", count: recentlyResolved.length },
  ];

  // Open on the work that is stuck, not on the first tab. A tab hides its
  // content, and the one section here that holds blocked work must not be a
  // click away from being missed entirely.
  const initialTab =
    openReviews.length > 0 ? "review" : preRows.length > 0 ? "pre" : postRows.length > 0 ? "post" : "resolved";

  return (
    <>
      <PageHeader
        title="Metering monitoring"
        subtitle="Daily status of every circuit currently in a commissioning window."
      />

      {/* Only the two facts that cut ACROSS the tabs live here — the
          per-section counts are on the tabs themselves, so repeating them
          would be two sources for one number. */}
      <div className="grid grid-cols-2 gap-3 mb-6 max-w-xl">
        {[
          {
            label: "Awaiting today's reading",
            value: awaitingToday,
            detail: activeWindows === 0 ? "no active windows" : `of ${activeWindows} active window${activeWindows === 1 ? "" : "s"}`,
          },
          {
            label: "Anomalies open",
            value: anomaliesOpen,
            detail: anomaliesOpen === 0 ? "no window held" : "window held until fixed",
          },
        ].map((f) => (
          <div key={f.label} className="card p-4">
            <p className="lbl mb-1.5">{f.label}</p>
            <p className="num text-[20px] font-semibold leading-none">{f.value}</p>
            <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{f.detail}</p>
          </div>
        ))}
      </div>

      <CardTabs
        tabs={tabs}
        initial={initialTab}
        panels={{
          review: (
            <>
              {openReviews.length === 0 ? (
          // FEAT-015-AC-2 — an empty queue states it plainly.
          <EmptyState title="No demo results awaiting review">
            Every completed post-install window has landed inside CON-20&apos;s 60-80% band.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Circuit</th>
                  <th>Measured</th>
                  <th>Baseline</th>
                  <th>Raised</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {openReviews.map((r) => {
                  const u = reviewUrgency({ raisedAt: r.raisedAt, occurrence: r.occurrence, now });
                  return (
                    <tr key={r.id}>
                      <td>{r.circuit.society.name}</td>
                      <td>
                        <Link
                          href={`/admin/societies/${r.circuit.societyId}/circuits/${r.circuitId}`}
                          className="underline"
                        >
                          {r.circuit.location || r.circuit.lightType}
                        </Link>
                      </td>
                      <td className="num">{r.measuredSavingsPct.toFixed(1)}%</td>
                      <td className="num">{r.preInstallBaseline.toFixed(2)} kWh/day</td>
                      <td className="num text-[var(--text-muted)]">
                        {r.raisedAt.toISOString().slice(0, 10)}
                      </td>
                      <td>
                        <StatusChip tone={u.tone}>{u.label}</StatusChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
            </>
          ),
          pre: (
            <>
              {preRows.length === 0 ? (
          <EmptyState title="No active pre-install windows">
            A circuit appears here once its meter is installed and load-validated.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Circuit</th>
                  <th>Progress</th>
                  <th>Today</th>
                  <th>Latest vs. average</th>
                </tr>
              </thead>
              <tbody>
                {preRows.map((row) => (
                  <tr key={row.circuit.id}>
                    <td>
                      <Link
                        href={`/admin/societies/${row.circuit.societyId}/circuits/${row.circuit.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.circuit.society.name}
                      </Link>
                    </td>
                    <td className="text-[var(--text-muted)]">{row.circuit.location || row.circuit.lightType}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <DayStrip validCount={row.validCount} />
                        <span className="num text-xs text-[var(--text-muted)]">
                          {row.validCount}/{REQUIRED_VALID_DAYS}
                        </span>
                      </span>
                    </td>
                    <td>
                      {row.pendingAnomaly ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : row.loggedToday ? (
                        <StatusChip tone="ok">Logged</StatusChip>
                      ) : (
                        <StatusChip tone="warn">Not yet</StatusChip>
                      )}
                    </td>
                    <td>
                      {row.pendingAnomaly ? (
                        <StatusChip tone="warn">Anomaly open</StatusChip>
                      ) : row.variancePct != null ? (
                        <span className="num">
                          {row.variancePct >= 0 ? "+" : ""}
                          {row.variancePct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">Awaiting first reading</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
            </>
          ),
          post: (
            <>
              {postRows.length === 0 ? (
          <EmptyState title="No active post-install windows">
            A circuit appears here once its lights are replaced and the completion gate pass is submitted.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Circuit</th>
                  <th>Progress</th>
                  <th>Today</th>
                  <th>Projected savings</th>
                </tr>
              </thead>
              <tbody>
                {postRows.map((row) => {
                  const inBand =
                    row.projectedSavingsPct != null &&
                    row.projectedSavingsPct >= 60 &&
                    row.projectedSavingsPct <= 80;
                  return (
                    <tr key={row.circuit.id}>
                      <td>
                        <Link
                          href={`/admin/societies/${row.circuit.societyId}/circuits/${row.circuit.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.circuit.society.name}
                        </Link>
                      </td>
                      <td className="text-[var(--text-muted)]">{row.circuit.location || row.circuit.lightType}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <DayStrip validCount={row.validCount} />
                          <span className="num text-xs text-[var(--text-muted)]">
                            {row.validCount}/{REQUIRED_VALID_DAYS}
                          </span>
                        </span>
                      </td>
                      <td>
                        {row.pendingAnomaly ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : row.loggedToday ? (
                          <StatusChip tone="ok">Logged</StatusChip>
                        ) : (
                          <StatusChip tone="warn">Not yet</StatusChip>
                        )}
                      </td>
                      <td>
                        {row.pendingAnomaly ? (
                          <StatusChip tone="warn">Anomaly open</StatusChip>
                        ) : row.projectedSavingsPct != null ? (
                          <StatusChip tone={inBand ? "ok" : "warn"}>
                            {row.projectedSavingsPct.toFixed(1)}% so far
                          </StatusChip>
                        ) : (
                          <span className="text-[var(--text-muted)]">Awaiting first reading</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
            </>
          ),
          resolved: (
            <>
              {recentlyResolved.length === 0 ? (
          <EmptyState title="Nothing commissioned yet">
            No circuit has completed benchmark commissioning yet.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Circuit</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {recentlyResolved.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/admin/societies/${c.societyId}/circuits/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.society.name}
                      </Link>
                    </td>
                    <td className="text-[var(--text-muted)]">{c.location || c.lightType}</td>
                    <td>
                      {c.state === "benchmark_confirmed" && c.benchmarkSavingsPct != null ? (
                        <StatusChip tone="ok">{c.benchmarkSavingsPct.toFixed(1)}% confirmed</StatusChip>
                      ) : (
                        <StatusChip tone="warn">Outside CON-20 band — under review</StatusChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
            </>
          ),
        }}
      />
    </>
  );
}
