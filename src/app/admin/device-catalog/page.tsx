import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
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
      <PageHeader
        title="Device catalog"
        subtitle="Every device the inventory and replacement dropdowns offer. An original maps to the replacements compatible with it — that mapping is all an installer ever sees."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Found on site",
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
          <div key={f.label} className="card p-4">
            <p className="lbl mb-1.5 min-h-[2.8em]">{f.label}</p>
            <p className="num text-[20px] font-semibold leading-none">{f.value}</p>
            <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{f.detail}</p>
          </div>
        ))}
      </div>

      {unmapped.length > 0 && (
        <p
          className="mb-6 rounded-[var(--r-sm)] border p-3 text-sm"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          {unmapped.length === 1 ? "One active device has" : `${unmapped.length} active devices have`} no
          compatible replacement mapped: {unmapped.map((t) => t.name).join(", ")}. A circuit carrying{" "}
          {unmapped.length === 1 ? "it" : "them"} cannot have its replacement recorded at installation.
        </p>
      )}

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
