import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { BackButton } from "@/components/back-button";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { TankVisual } from "@/components/tank-visual";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { getTuyaShadow, levelFromProperties, resolveTuyaConfig } from "@/lib/tuya";
import { logger } from "@/lib/logger";
import { AssignControl } from "./assign-control";

export const dynamic = "force-dynamic";

const RANGES = { "24h": 1, "7d": 7, "30d": 30 } as const;
type RangeKey = keyof typeof RANGES;

/** Server-rendered area chart over the half-hourly samples. */
function HistoryChart({ points }: { points: { at: Date; level: number }[] }) {
  const w = 980;
  const h = 170;
  if (points.length < 2) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Not enough samples yet — the background job records one every 30 minutes; the chart appears
        once a few exist.
      </p>
    );
  }
  const t0 = points[0].at.getTime();
  const t1 = points[points.length - 1].at.getTime();
  const x = (d: Date) => ((d.getTime() - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => h - (v / 100) * h;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.at).toFixed(1)} ${y(p.level).toFixed(1)}`)
    .join(" ");
  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} style={{ display: "block", minWidth: 560 }}>
        {[25, 50, 75].map((g) => (
          <g key={g}>
            <line x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={4} y={y(g) - 4} fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace,Menlo,monospace">
              {g}%
            </text>
          </g>
        ))}
        <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--chart-mark)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--chart-mark)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={0} x2={w} y1={h} y2={h} stroke="var(--border)" strokeWidth={1.5} />
        <text x={0} y={h + 16} fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace,Menlo,monospace">
          {formatDateTime(points[0].at)}
        </text>
        <text x={w - 118} y={h + 16} fontSize={10} fill="var(--text-subtle)" fontFamily="ui-monospace,Menlo,monospace">
          {formatDateTime(points[points.length - 1].at)}
        </text>
      </svg>
    </div>
  );
}

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
      const level = levelFromProperties(props);
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
          tank.lastOnline ? <StatusChip tone="ok">Online</StatusChip> : <StatusChip tone="warn">Offline</StatusChip>
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
                <span className="num">{live.reportedAt ? formatDateTime(live.reportedAt) : "—"}</span>
              </p>
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
                ["Device list synced", <span key="v" className="num">{formatDateTime(tank.syncedAt)}</span>],
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
          <HistoryChart points={readings.map((r) => ({ at: r.recordedAt, level: r.levelPercent }))} />
        </Card>
      )}
    </>
  );
}
