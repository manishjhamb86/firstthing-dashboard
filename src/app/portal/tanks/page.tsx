import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { PortalShell } from "../portal-shell";
import { TankVisual } from "@/components/tank-visual";
import { formatDateTime } from "@/lib/format-date";
import { PortalTabs } from "../portal-tabs";
import { getTuyaShadow, levelFromProperties, resolveTuyaConfig } from "@/lib/tuya";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const metadata = { title: "Water tanks" };

/** The last 24 h of half-hourly samples, as a small sparkline. */
function Spark({ points, offline }: { points: number[]; offline: boolean }) {
  if (points.length < 2) return null;
  const w = 170;
  const h = 34;
  const step = w / (points.length - 1);
  const y = (v: number) => h - (v / 100) * (h - 4) - 2;
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={offline ? "var(--chart-mark-inert)" : "var(--chart-mark)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
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
  const societyId = viewer.societyId;

  const [theme, society, tanks] = await Promise.all([
    resolveTheme(),
    db.society.findUnique({ where: { id: societyId } }),
    db.waterTank.findMany({
      where: { societyId, hasLevelSignal: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!society) redirect("/login");

  // Live refresh, best-effort and bounded: the page renders from the mirror
  // when Tuya is slow or down — residents get the last sample, honestly
  // timestamped, not an error page.
  const cfg = await resolveTuyaConfig();
  const live = new Map<string, { level: number; reportedAt: Date }>();
  if (cfg && tanks.length > 0) {
    await Promise.allSettled(
      tanks.map(async (t) => {
        try {
          const level = levelFromProperties(await getTuyaShadow(cfg, t.tuyaDeviceId));
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

  const low = tanks.filter((t) => ((live.get(t.id)?.level ?? t.lastLevelPercent) ?? 100) < 25);

  return (
    <PortalShell theme={theme}>
      <PageHeader
        title={society.name}
        subtitle="Your society's water tanks, live."
        chip={
          tanks.length === 0 ? undefined : low.length > 0 ? (
            <StatusChip tone="warn">{low.length} running low</StatusChip>
          ) : (
            <StatusChip tone="ok">All healthy</StatusChip>
          )
        }
      />
      <PortalTabs active="tanks" />

        {tanks.length === 0 ? (
          <EmptyState title="No tanks connected yet">
            When FirsThing installs water-level sensors on your society&apos;s tanks, their live
            levels appear here.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tanks.map((t) => {
                const l = live.get(t.id);
                const level = l?.level ?? t.lastLevelPercent ?? 0;
                const reportedAt = l?.reportedAt ?? t.lastReportedAt;
                const spark = sparkByTank.get(t.id) ?? [];
                return (
                  <Card key={t.id} className="flex flex-col items-center gap-3.5 p-6">
                    <span className="text-center text-[15px] font-bold">{t.name}</span>
                    <TankVisual pct={level} offline={!t.lastOnline} width={170} height={225} pctSize={32} />
                    <div className="flex flex-col items-center gap-1.5">
                      {t.lastOnline ? (
                        <StatusChip tone="ok">Online</StatusChip>
                      ) : (
                        <StatusChip tone="warn">Sensor offline</StatusChip>
                      )}
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {t.lastOnline ? "Updated" : "Last seen"}{" "}
                        <span className="num">{reportedAt ? formatDateTime(reportedAt) : "—"}</span>
                      </span>
                    </div>
                    {spark.length >= 2 && (
                      <div
                        className="mt-0.5 flex w-full flex-col items-center gap-1 border-t pt-3"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <Spark points={spark} offline={!t.lastOnline} />
                        <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                          last 24 hours
                        </span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
            <p className="mt-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              Levels refresh automatically. Only tanks assigned to your society appear here.
            </p>
          </>
        )}
    </PortalShell>
  );
}
