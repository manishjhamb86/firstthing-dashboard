import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { hasGrant } from "@/lib/portal-access";
import { TankVisual } from "@/components/tank-visual";
import { formatInstant, timeAgo } from "@/lib/format-date";
import { getTuyaShadow, levelFromProperties, resolveTuyaConfig } from "@/lib/tuya";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Connected is not the same as reporting: a sensor silent for an hour shows
// its last level, labelled as last-reported rather than live.
const STALE_AFTER_MS = 60 * 60 * 1000;
const LOW_PCT = 25;
function isStale(at: Date | null): boolean {
  return at === null || new Date().getTime() - at.getTime() > STALE_AFTER_MS;
}
export const metadata = { title: "Water tanks" };

/** The last 24 h of half-hourly samples, as a sparkline that fills its card. */
function Spark({ points, quiet }: { points: number[]; quiet: boolean }) {
  if (points.length < 2) return null;
  const w = 240;
  const h = 44;
  const step = w / (points.length - 1);
  const y = (v: number) => h - (v / 100) * (h - 6) - 3;
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const stroke = quiet ? "var(--chart-mark-inert)" : "var(--chart-mark)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: h }}
      aria-hidden
    >
      {/* The filled area is what makes a flat line read as a level rather
          than as a stray rule across the card. */}
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={stroke} opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// The society's own tanks, and nobody else's: the query is scoped to the
// viewer's societyId server-side (INV-05) — the assignment made in the back
// office is the only thing that puts a tank on this page.
export default async function PortalTanksPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  // The sidebar hiding the tab is a courtesy; this redirect is the boundary.
  if (!hasGrant(viewer, "water_tanks")) redirect("/portal");
  const societyId = viewer.societyId;

  const tanks = await db.waterTank.findMany({
    where: { societyId, hasLevelSignal: true },
    orderBy: { name: "asc" },
  });

  // Live refresh, best-effort and bounded: the page renders from the mirror
  // when Tuya is slow or down — residents get the last sample, honestly
  // timestamped, not an error page.
  const cfg = await resolveTuyaConfig();
  const live = new Map<string, { level: number; reportedAt: Date }>();
  if (cfg && tanks.length > 0) {
    await Promise.allSettled(
      tanks.map(async (t) => {
        try {
          const level = levelFromProperties(await getTuyaShadow(cfg, t.tuyaDeviceId), t.levelMax);
          if (level) live.set(t.id, { level: level.level, reportedAt: new Date(level.time) });
        } catch (err) {
          logger.warn("tank.portal_live_read_failed", { tankId: t.id, error: String(err) });
        }
      }),
    );
  }

  const since = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const readings = await db.tankLevelReading.findMany({
    where: { tankId: { in: tanks.map((t) => t.id) }, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: { tankId: true, levelPercent: true },
  });
  const sparkByTank = new Map<string, number[]>();
  for (const r of readings) {
    const list = sparkByTank.get(r.tankId) ?? [];
    list.push(r.levelPercent);
    sparkByTank.set(r.tankId, list);
  }

  // One row of facts per tank, so the header chip and the cards are decided
  // by the same values rather than by two separate readings of them.
  const rows = tanks.map((t) => {
    const l = live.get(t.id);
    const reportedAt = l?.reportedAt ?? t.lastReportedAt;
    // Offline is a fault; quiet is not. These controllers report four
    // discrete levels, so a tank that has not moved a quarter has nothing to
    // send — telling a resident it is "not reporting" made a correct figure
    // look untrustworthy (the user's call, 2026-08-26).
    const quiet = !t.lastOnline;
    const unchangedFor = isStale(reportedAt);
    return {
      tank: t,
      level: l?.level ?? t.lastLevelPercent ?? null,
      reportedAt,
      quiet,
      unchangedFor,
      offline: !t.lastOnline,
      spark: sparkByTank.get(t.id) ?? [],
    };
  });

  // "All healthy" beside a card reading "Not reporting" is the screen
  // contradicting itself (user-reported 2026-08-26). A silent sensor is not a
  // healthy tank — it is a tank nobody can currently see, and it says so.
  const lowCount = rows.filter((r) => !r.quiet && r.level !== null && r.level < LOW_PCT).length;
  const quietCount = rows.filter((r) => r.quiet).length;
  const headerChip =
    tanks.length === 0 ? undefined : lowCount > 0 ? (
      <StatusChip tone="warn">
        {lowCount} running low
        {quietCount > 0 ? `, ${quietCount} offline` : ""}
      </StatusChip>
    ) : quietCount > 0 ? (
      <StatusChip tone="warn">
        {quietCount} of {rows.length} offline
      </StatusChip>
    ) : (
      <StatusChip tone="ok">All healthy</StatusChip>
    );

  // Grouped the way a resident thinks about supply — Domestic, Flush, STP
  // (the revamp's ask). A tank the back office has not classified yet lands
  // in its own stated group rather than being guessed into one.
  const SETUP_META: { key: string | null; title: string; note: string }[] = [
    { key: "domestic", title: "Domestic", note: "drinking & household supply" },
    { key: "flush", title: "Flush", note: "recycled supply for flushing" },
    { key: "stp", title: "STP", note: "treated water storage" },
    { key: null, title: "Not yet classified", note: "FirsThing will assign these to a setup" },
  ];
  const groups = SETUP_META.map((g) => ({
    ...g,
    rows: rows.filter((r) => (r.tank.setupType ?? null) === g.key),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageHeader
        title="Water tanks"
        subtitle="Live levels, grouped by what each setup supplies."
        chip={headerChip}
      />

      {tanks.length === 0 ? (
        <EmptyState title="No tanks connected yet">
          When FirsThing installs water-level sensors on your society&apos;s tanks, their live levels
          appear here.
        </EmptyState>
      ) : (
        <>
          {/* auto-fit at 1fr, and the card itself wraps: one tank fills the
              row with its history beside it instead of sitting in the first
              cell of a four-column grid with three empty ones next to it
              (user-reported 2026-08-26); four tanks make two columns, where
              the history wraps under the facts on its own. */}
          {groups.map((g) => (
          <section key={g.title} className="mb-7">
          <div className="mb-3 flex items-baseline gap-2.5">
            <h2 className="text-[15px] font-bold">{g.title}</h2>
            <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{g.note}</span>
          </div>
          <div
            className="grid max-w-[1180px] gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}
          >
            {g.rows.map(({ tank: t, level, reportedAt, quiet, unchangedFor, offline, spark }) => {
              const isLow = !quiet && level !== null && level < LOW_PCT;
              return (
                <Card key={t.id} className="flex flex-wrap items-stretch gap-x-6 gap-y-5 p-5 sm:p-6">
                  <TankVisual pct={level ?? 0} offline={offline} width={132} height={184} pctSize={26} />
                  <div className="flex min-w-[170px] flex-1 flex-col">
                    <p className="text-[15px] font-bold" title={t.name}>
                      {t.name}
                    </p>
                    <div className="mt-2">
                      {offline ? (
                        <StatusChip tone="warn">Sensor offline</StatusChip>
                      ) : isLow ? (
                        <StatusChip tone="warn">Running low</StatusChip>
                      ) : (
                        <StatusChip tone="ok">Live</StatusChip>
                      )}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {quiet ? "Last reported" : "Updated"}{" "}
                      <span className="num">{reportedAt ? formatInstant(reportedAt) : "—"}</span>
                      <span className="block">{timeAgo(reportedAt)}</span>
                    </p>
                    {quiet ? (
                      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                        The level above is that last report, not a live reading.
                      </p>
                    ) : unchangedFor ? (
                      // Not a warning: the sensor reports four discrete levels,
                      // so an unchanged reading is the level holding steady.
                      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                        Unchanged since then — this sensor reports in steps of 25%, so a steady
                        reading means the level has not moved a quarter.
                      </p>
                    ) : null}
                  </div>
                  {/* The history sits beside the facts when the card is wide
                      and wraps beneath them when it is not — one rule, both
                      the one-tank and the many-tank case. */}
                  <div className="flex min-w-[220px] flex-[1.4] flex-col justify-end">
                    <p className="lbl mb-2">Last 24 hours</p>
                    {spark.length >= 2 ? (
                      <>
                        <Spark points={spark} quiet={quiet} />
                        <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                          Low <span className="num">{Math.min(...spark)}%</span> · high{" "}
                          <span className="num">{Math.max(...spark)}%</span> ·{" "}
                          <span className="num">{spark.length}</span> readings
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                        A history appears here once this tank has been sampled a few times — levels
                        are recorded every half hour.
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          </section>
          ))}
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Levels refresh automatically. Only tanks assigned to your society appear here.
          </p>
        </>
      )}
    </>
  );
}
