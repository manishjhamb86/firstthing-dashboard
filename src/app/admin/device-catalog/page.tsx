import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Stat, StatRow } from "@/components/list-toolbar";
import { PageHeader, PageRibbon } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin-permissions";
import { CatalogList } from "./catalog-list";

// CON-45 — the predefined device catalog. Two halves: what a survey finds on
// a circuit (originals), and what FirsThing installs (replacements), joined
// by the 1-5 compatibility mapping the installer's dropdown reads.
export default async function DeviceCatalogPage() {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  const canView = perms.includes("manage_survey") || perms.includes("manage_pipeline");
  if (!canView) redirect("/admin");
  const canEdit = perms.includes("manage_survey") && perms.includes("manage_pipeline");

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
  const unmapped = originals.filter((t) => t.active && t.replacementOptions.length === 0);

  return (
    <>
      {/* Top of the page, not between the stats and the table — this is
          about the catalog as a whole, and where it sat it read as a
          caption for whatever followed it. */}
      {unmapped.length > 0 && (
        <PageRibbon>
          {unmapped.length === 1 ? "One active device has" : `${unmapped.length} active devices have`} no
          compatible replacement mapped: <strong>{unmapped.map((t) => t.name).join(", ")}</strong>. A circuit
          carrying {unmapped.length === 1 ? "it" : "them"} cannot have its replacement recorded at
          installation. {unmapped.length === 1 ? "It is" : "They are"} marked in the list below.
        </PageRibbon>
      )}

      <PageHeader
        title="Device catalog"
        subtitle="Every device the inventory and replacement dropdowns offer. An original maps to the replacements compatible with it — that mapping is all an installer ever sees."
        action={
          canEdit ? (
            <Link href="/admin/device-catalog?new=1" className="btn-primary">
              Add device
            </Link>
          ) : undefined
        }
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

      <CatalogList
        canEdit={canEdit}
        rows={types.map((t) => ({
          id: t.id,
          name: t.name,
          role: t.role as "original" | "replacement",
          defaultWattage: t.defaultWattage,
          active: t.active,
          removed: t.deletedAt !== null,
          replacementIds: t.replacementOptions.map((o) => o.replacementTypeId),
          usageCount: t._count.circuitDevices + t._count.circuitReplacements,
        }))}
      />
    </>
  );
}
