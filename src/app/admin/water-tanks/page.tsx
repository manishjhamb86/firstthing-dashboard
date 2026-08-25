import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { TanksListClient } from "./tanks-list-client";

export const dynamic = "force-dynamic";

// A sensor can be connected and still silent. Anything that has not reported
// for an hour is shown as not reporting rather than as a live figure — the
// level is still the best thing to show, it just is not current
// (user-reported 2026-08-25: the app read 45% while the device had moved on).
const STALE_AFTER_MS = 60 * 60 * 1000;
function isStale(at: Date | null): boolean {
  return at === null || new Date().getTime() - at.getTime() > STALE_AFTER_MS;
}
export const metadata = { title: "Water tanks" };

// CAP — water tank monitoring. The list mirrors the Smart Life account: every
// device appears (nothing in the account is invisible), level-bearing
// sensors are assignable to the society they serve, and that assignment is
// what scopes the portal (INV-05). The page reads the mirror, not Tuya —
// the half-hourly sampling job keeps the mirror fresh.
export default async function WaterTanksPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_users")) redirect("/admin");

  const [tanks, societies, config] = await Promise.all([
    db.waterTank.findMany({
      orderBy: [{ hasLevelSignal: "desc" }, { name: "asc" }],
      include: { society: { select: { id: true, name: true, location: true } } },
    }),
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.tankApiConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  const sensors = tanks.filter((t) => t.hasLevelSignal);
  const unassigned = sensors.filter((t) => t.societyId === null);
  const low = sensors.filter((t) => (t.lastLevelPercent ?? 100) < 25);

  const configured = config !== null || tanks.length > 0;

  return (
    <>
      <PageHeader
        title="Water tanks"
        chip={
          !configured ? (
            <StatusChip tone="neu">Not configured</StatusChip>
          ) : unassigned.length > 0 ? (
            <StatusChip tone="warn">{unassigned.length} unassigned</StatusChip>
          ) : (
            <StatusChip tone="ok">All assigned</StatusChip>
          )
        }
        subtitle="Every tank sensor in the Smart Life account — assign each one to the society it serves."
        action={
          <Link href="/admin/water-tanks/settings" className="btn-ghost">
            API settings
          </Link>
        }
      />

      <StatRow>
        <Stat label="Devices" value={tanks.length} detail="in the Smart Life account" />
        <Stat label="Tank sensors" value={sensors.length} detail="report a water level" />
        <Stat
          label="Unassigned"
          value={unassigned.length}
          tone={unassigned.length > 0 ? "warn" : "ok"}
          detail={unassigned.length === 0 ? "every sensor has a society" : "not visible to any society yet"}
        />
        <Stat
          label="Low level"
          value={low.length}
          tone={low.length > 0 ? "warn" : "ok"}
          detail={low.length === 0 ? "nothing below 25%" : "below 25% right now"}
        />
      </StatRow>

      {tanks.length === 0 ? (
        <EmptyState title={configured ? "No devices in the account" : "Not connected yet"}>
          {configured
            ? "The Smart Life account answered with no devices — add the sensors there first."
            : "Configure the Smart Life API under API settings; every device in the account then appears here."}
        </EmptyState>
      ) : (
        <TanksListClient
          canAssign={actor.permissions.includes("manage_users")}
          societies={societies}
          syncedAt={config?.lastSyncAt?.toISOString() ?? null}
          tanks={tanks.map((t) => ({
            id: t.id,
            name: t.name,
            deviceId: t.tuyaDeviceId,
            productName: t.productName,
            hasLevelSignal: t.hasLevelSignal,
            level: t.lastLevelPercent,
            online: t.lastOnline,
            reportedAt: t.lastReportedAt?.toISOString() ?? null,
            stale: isStale(t.lastReportedAt),
            society: t.society ? { id: t.society.id, name: t.society.name, location: t.society.location } : null,
          }))}
        />
      )}
    </>
  );
}
