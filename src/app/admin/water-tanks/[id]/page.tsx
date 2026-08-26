import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { BackButton } from "@/components/back-button";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { TankVisual } from "@/components/tank-visual";
import { formatDate, formatInstant, timeAgo } from "@/lib/format-date";
import { getTuyaShadow, levelFromProperties, resolveTuyaConfig } from "@/lib/tuya";
import { logger } from "@/lib/logger";
import { AssignControl } from "./assign-control";
import { TankHistoryChart } from "@/components/tank-history-chart";

export const dynamic = "force-dynamic";

const RANGES = { "24h": 1, "7d": 7, "30d": 30 } as const;
type RangeKey = keyof typeof RANGES;

export default async function TankStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_users")) redirect("/admin");

  const { id } = await params;
  const range = ((await searchParams).range ?? "24h") as RangeKey;
  const days = RANGES[range] ?? 1;

  const tank = await db.waterTank.findUnique({
    where: { id },
    include: {
      society: { select: { id: true, name: true, location: true, flatCount: true } },
      assignedBy: { select: { name: true, email: true } },
    },
  });
  if (!tank) notFound();

  // Live refresh, best-effort: the page must render from the mirror even when
  // Tuya is slow or down — a monitoring page that 500s during an outage is
  // useless exactly when it matters.
  let live = {
    level: tank.lastLevelPercent,
    reportedAt: tank.lastReportedAt,
    online: tank.lastOnline,
    fresh: false,
  };
  const cfg = await resolveTuyaConfig();
  if (cfg && tank.hasLevelSignal) {
    try {
      const props = await getTuyaShadow(cfg, tank.tuyaDeviceId);
      const level = levelFromProperties(props, tank.levelMax);
      if (level) {
        live = { level: level.level, reportedAt: new Date(level.time), online: tank.lastOnline, fresh: true };
        await db.waterTank.update({
          where: { id: tank.id },
          data: { lastLevelPercent: level.level, lastReportedAt: new Date(level.time) },
        });
      }
    } catch (err) {
      logger.warn("tank.live_read_failed", { tankId: tank.id, error: String(err) });
    }
  }

  const stale =
    live.reportedAt === null || new Date().getTime() - live.reportedAt.getTime() > 60 * 60 * 1000;

  const [societies, readings] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.tankLevelReading.findMany({
      where: { tankId: tank.id, recordedAt: { gte: new Date(new Date().getTime() - days * 86_400_000) } },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, levelPercent: true },
    }),
  ]);
  const levels = readings.map((r) => r.levelPercent);
  const lo = levels.length ? Math.min(...levels) : null;
  const hi = levels.length ? Math.max(...levels) : null;

  return (
    <>
      <div className="mb-4">
        <BackButton fallbackHref="/admin/water-tanks" />
      </div>
      <PageHeader
        title={tank.name}
        chip={
          // Online is online, however long ago it last changed — see the
          // note by the reading below (2026-08-26).
          !tank.lastOnline ? (
            <StatusChip tone="warn">Offline</StatusChip>
          ) : (
            <StatusChip tone="ok">Online</StatusChip>
          )
        }
        subtitle={`${tank.productName || "Tank sensor"} · ${tank.tuyaDeviceId}`}
      />

      <div className="mb-5 grid items-start gap-5 lg:grid-cols-12">
        <Card className="flex flex-col items-center gap-4 p-7 lg:col-span-4">
          <span className="lbl">Water level</span>
          {tank.hasLevelSignal ? (
            <>
              <TankVisual pct={live.level ?? 0} offline={!tank.lastOnline} width={210} height={280} pctSize={38} />
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Last reading{" "}
                <span className="num">{live.reportedAt ? formatInstant(live.reportedAt) : "—"}</span>
                {live.reportedAt && ` · ${timeAgo(live.reportedAt)}`}
              </p>
              {/* A quiet ONLINE sensor is not a fault (corrected 2026-08-26,
                  the user's call). These controllers report four discrete
                  levels — 25/50/75/100 — so a tank whose level has not moved a
                  quarter genuinely has nothing new to say, sometimes for many
                  hours. Warning about that trained the reader to distrust a
                  figure that was correct. The earlier "connected is not
                  reporting" warning was written when the level itself looked
                  wrong; that turned out to be the levelMax scale bug, which is
                  fixed. Only an OFFLINE sensor gets a warning now. */}
              {tank.lastOnline && stale && (
                <p className="w-full text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  Last change {timeAgo(live.reportedAt)}. This sensor reports in steps of 25%, so a
                  steady reading means the level has not moved a quarter — not that it has stopped
                  reporting.
                </p>
              )}
              {!tank.lastOnline && (
                <div
                  className="w-full rounded-[var(--r-sm)] border px-3.5 py-2.5 text-[13px]"
                  style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn-fg)" }}
                >
                  Sensor offline — the level shown is its last report, not live.
                </div>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              This device reports no water level — it is listed for completeness only.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-5 lg:col-span-8">
          <Card className="p-6">
            <CardTitle>Assignment</CardTitle>
            {tank.society ? (
              <dl className="mb-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>Assigned to</dt>
                  <dd className="text-right">
                    <Link href={`/admin/societies/${tank.society.id}`} className="font-semibold hover:underline">
                      {tank.society.name}
                    </Link>
                    <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                      {tank.society.location} · {tank.society.flatCount} flats
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>Assigned</dt>
                  <dd>
                    {tank.assignedAt ? <span className="num">{formatDate(tank.assignedAt)}</span> : "—"}
                    {tank.assignedBy && ` · by ${tank.assignedBy.name ?? tank.assignedBy.email}`}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
                Not assigned to any society yet — no portal shows this tank.
              </p>
            )}
            {tank.hasLevelSignal ? (
              <>
                <span className="lbl mb-2">{tank.society ? "Move to a different society" : "Assign to a society"}</span>
                <AssignControl tankId={tank.id} currentSocietyId={tank.society?.id ?? null} societies={societies} />
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Portal accounts of the assigned society see this tank — nobody else does (INV-05).
                </p>
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Only tank sensors can be assigned — this device has no water-level signal.
              </p>
            )}
          </Card>

          <Card className="p-6">
            <CardTitle>Device</CardTitle>
            <dl className="space-y-2.5 text-sm">
              {[
                ["Device ID", <span key="v" className="num">{tank.tuyaDeviceId}</span>],
                ["Product", tank.productName || "—"],
                ["Category", <span key="v" className="num">{tank.category}</span>],
                ["First seen here", <span key="v" className="num">{formatDate(tank.createdAt)}</span>],
                ["Device list synced", <span key="v" className="num">{formatInstant(tank.syncedAt)}</span>],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4">
                  <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {tank.hasLevelSignal && (
        <Card className="p-6">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="mb-0">Level history</CardTitle>
            <div className="flex gap-2">
              {(Object.keys(RANGES) as RangeKey[]).map((r) => (
                <Link
                  key={r}
                  href={`/admin/water-tanks/${tank.id}?range=${r}`}
                  className="rounded-full border px-3.5 py-1.5 text-xs font-semibold"
                  style={
                    r === range
                      ? { background: "var(--accent-subtle)", borderColor: "var(--accent-line)", color: "var(--accent)" }
                      : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
                  }
                >
                  {r === "24h" ? "24 h" : r === "7d" ? "7 days" : "30 days"}
                </Link>
              ))}
            </div>
          </div>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Sampled every 30 minutes into FirsThing&apos;s own store — the chart reads history, not the
            live device.
            {lo !== null && (
              <>
                {" "}
                <span className="num" style={{ color: "var(--text)" }}>
                  Low {lo}% · high {hi}%
                </span>{" "}
                over this range.
              </>
            )}
          </p>
          <TankHistoryChart
            points={readings.map((r) => ({ at: r.recordedAt.toISOString(), level: r.levelPercent }))}
          />
        </Card>
      )}
    </>
  );
}
