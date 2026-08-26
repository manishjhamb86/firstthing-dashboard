import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PendingProposals } from "./pending-proposals";
import { formatInstant } from "@/lib/format-date";
import { PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin-permissions";
import { CatalogList } from "./catalog-list";
import { needsAttention, type CatalogRow } from "@/lib/device-catalog";

// CON-45 — the predefined device catalog. Two halves: what a survey finds on
// a circuit (originals), and what FirsThing installs (replacements), joined
// by the 1-5 compatibility mapping the installer's dropdown reads.
export default async function DeviceCatalogPage() {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  const canView = perms.includes("manage_survey") || perms.includes("manage_pipeline");
  if (!canView) redirect("/admin");
  const canEdit = perms.includes("manage_survey") && perms.includes("manage_pipeline");

  const proposals = await db.deviceType.findMany({
    where: { status: "proposed", deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { proposedBy: { select: { name: true, email: true } } },
  });

  const types = await db.deviceType.findMany({
    include: {
      replacementOptions: { select: { replacementTypeId: true } },
      _count: { select: { circuitDevices: true, circuitReplacements: true } },
    },
    orderBy: [{ deletedAt: "asc" }, { role: "asc" }, { name: "asc" }],
  });

  const live = types.filter((t) => !t.deletedAt);
  const originals = live.filter((t) => t.role === "original");
  const replacements = live.filter((t) => t.role === "replacement");
  const rows: CatalogRow[] = types.map((t) => ({
    id: t.id,
    name: t.name,
    role: t.role as "original" | "replacement",
    defaultWattage: t.defaultWattage,
    active: t.active,
    removed: t.deletedAt !== null,
    replacementIds: t.replacementOptions.map((o) => o.replacementTypeId),
    usageCount: t._count.circuitDevices + t._count.circuitReplacements,
  }));
  const unmapped = rows.filter(needsAttention);

  return (
    <>
      <PageHeader
        title="Device catalog"
        subtitle="What the survey and installer dropdowns offer."
        chip={
          unmapped.length > 0 ? (
            // The chip is the way IN to the rows it counts, not just a
            // number — "should be able to sort or filter the list if any row
            // with errors or warning" (2026-08-21).
            <Link href="/admin/device-catalog?attention=1" aria-label="Show only devices that need attention">
              <StatusChip tone="warn">
                {unmapped.length} need{unmapped.length === 1 ? "s" : ""} attention
              </StatusChip>
            </Link>
          ) : undefined
        }
        action={
          canEdit ? (
            <Link href="/admin/device-catalog?new=1" className="btn-primary">
              Add device
            </Link>
          ) : undefined
        }
      />

      {/* Above the catalog itself: a circuit somewhere is blocked on each of
          these, so it is the first thing an ops lead should see here. */}
      <PendingProposals
        canDecide={canEdit}
        catalog={types
          .filter((t) => t.status === "approved" && t.role === "original" && !t.deletedAt)
          .map((t) => ({ id: t.id, name: t.name, defaultWattage: t.defaultWattage }))}
        proposals={proposals.map((p) => ({
          id: p.id,
          name: p.name,
          defaultWattage: p.defaultWattage,
          note: p.proposedNote,
          proposedBy: p.proposedBy?.name ?? p.proposedBy?.email ?? null,
          proposedAt: formatInstant(p.createdAt),
        }))}
      />

      <StatRow>
        {[
          {
            label: "To be replaced",
            value: originals.filter((t) => t.active).length,
            detail: `${originals.length} in the catalog`,
          },
          {
            label: "Replacements offered",
            value: replacements.filter((t) => t.active).length,
            detail: `${replacements.length} in the catalog`,
          },
          {
            label: "Without a replacement",
            value: unmapped.length,
            detail: unmapped.length === 0 ? "every device is covered" : "installer has nothing to pick",
          },
          {
            label: "Retired",
            value: live.filter((t) => !t.active).length,
            detail: "hidden from dropdowns",
          },
        ].map((f) => (
          <Stat key={f.label} label={f.label} value={f.value} detail={f.detail} />
        ))}
      </StatRow>

      <CatalogList canEdit={canEdit} rows={rows} />
    </>
  );
}
