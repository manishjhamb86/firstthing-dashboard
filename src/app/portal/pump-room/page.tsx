import { redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { PageHeader, StatusChip } from "@/components/ui";
import { hasGrant } from "@/lib/portal-access";
import { formatInstant } from "@/lib/format-date";
import { PumpRoomSection, loadPumpRoom } from "./pump-room-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pump room" };

/**
 * The society's pump room on its own tab (2026-11-11, user-asked — it used
 * to sit as the first card on the Water tanks page). Same grant as the
 * tanks: `water_tanks` covers the society's water infrastructure.
 */
export default async function PortalPumpRoomPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  // The sidebar hiding the tab is a courtesy; this redirect is the boundary.
  if (!hasGrant(viewer, "water_tanks")) redirect("/portal");

  const meter = await loadPumpRoom(viewer.societyId);

  return (
    <>
      <PageHeader
        title={meter?.roomType ? `${meter.roomType[0].toUpperCase()}${meter.roomType.slice(1)} pump room` : "Pump room"}
        subtitle={meter ? "Backup energy meter, read from the daily EMS report." : "Your society's pump room"}
        chip={
          meter ? (
            meter.lastReadingAt ? (
              <StatusChip tone="ok">Last reading {formatInstant(meter.lastReadingAt)}</StatusChip>
            ) : (
              <StatusChip tone="neu">No readings yet</StatusChip>
            )
          ) : undefined
        }
      />
      <PumpRoomSection meter={meter} />
    </>
  );
}
