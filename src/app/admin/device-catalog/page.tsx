import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin-permissions";
import { ActiveToggle, NewDeviceTypeForm, ReplacementMappingEditor } from "./catalog-client";

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
    include: { replacementOptions: { select: { replacementTypeId: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const originals = types.filter((t) => t.role === "original");
  const replacements = types.filter((t) => t.role === "replacement");
  const activeReplacements = replacements.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const unmapped = originals.filter((t) => t.active && t.replacementOptions.length === 0);

  return (
    <>
      <PageHeader
        title="Device catalog"
        subtitle="What the inventory and replacement dropdowns offer. Each original device maps to the 1-5 replacements compatible with it."
      />

      {/* An original with no compatible replacement is a dead end for the
          installer: the replacement dropdown reads this mapping, so that
          device can be surveyed onto a circuit and then never recorded as
          replaced. The catalog knew this and never said it. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 max-w-5xl">
        {[
          {
            label: "Devices found on site",
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
            value: types.filter((t) => !t.active).length,
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
          className="max-w-5xl mb-6 rounded-[var(--r-sm)] border p-3 text-sm"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          {unmapped.length === 1 ? "One active device has" : `${unmapped.length} active devices have`} no
          compatible replacement mapped: {unmapped.map((t) => t.name).join(", ")}. A circuit carrying{" "}
          {unmapped.length === 1 ? "it" : "them"} cannot have its replacement recorded at installation.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2 max-w-5xl">
        <section className="space-y-4 min-w-0">
          <CardTitle>Devices found on circuits</CardTitle>
          {originals.length === 0 ? (
            <EmptyState title="No original devices yet">
              These are what a survey records — tube lights, surface lights, the occasional fan or TV.
            </EmptyState>
          ) : (
            <Card className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Default W</th>
                    <th>Mapped</th>
                    <th>Status</th>
                    {canEdit && <th>{""}</th>}
                  </tr>
                </thead>
                <tbody>
                  {originals.map((t) => (
                    <tr key={t.id} style={t.active ? undefined : { opacity: 0.6 }}>
                      <td>{t.name}</td>
                      <td className="num">{t.defaultWattage ?? "—"}</td>
                      <td className="num">{t.replacementOptions.length}</td>
                      <td>
                        <StatusChip tone={t.active ? "ok" : "neu"}>{t.active ? "Active" : "Inactive"}</StatusChip>
                      </td>
                      {canEdit && (
                        <td>
                          <ActiveToggle id={t.id} active={t.active} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {canEdit && <NewDeviceTypeForm role="original" />}
        </section>

        <section className="space-y-4 min-w-0">
          <CardTitle>FirsThing replacement devices</CardTitle>
          {replacements.length === 0 ? (
            <EmptyState title="No replacement devices yet">
              What the installation crew fits — motion-enabled battens, dimmable surface lights.
            </EmptyState>
          ) : (
            <Card className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Default W</th>
                    <th>Status</th>
                    {canEdit && <th>{""}</th>}
                  </tr>
                </thead>
                <tbody>
                  {replacements.map((t) => (
                    <tr key={t.id} style={t.active ? undefined : { opacity: 0.6 }}>
                      <td>{t.name}</td>
                      <td className="num">{t.defaultWattage ?? "—"}</td>
                      <td>
                        <StatusChip tone={t.active ? "ok" : "neu"}>{t.active ? "Active" : "Inactive"}</StatusChip>
                      </td>
                      {canEdit && (
                        <td>
                          <ActiveToggle id={t.id} active={t.active} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {canEdit && <NewDeviceTypeForm role="replacement" />}
        </section>
      </div>

      <section className="max-w-5xl mt-10 space-y-4">
        <CardTitle>Compatibility mapping</CardTitle>
        <p className="text-sm text-[var(--text-muted)]">
          The installer recording a replacement only ever sees the list mapped here for the device
          being replaced — never the whole catalog.
        </p>
        {originals.filter((t) => t.active).length === 0 ? (
          <EmptyState title="Nothing to map yet">Add an original device first.</EmptyState>
        ) : canEdit ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {originals
              .filter((t) => t.active)
              .map((t) => (
                <ReplacementMappingEditor
                  key={t.id}
                  originalTypeId={t.id}
                  originalName={t.name}
                  selectedIds={t.replacementOptions.map((o) => o.replacementTypeId)}
                  replacements={activeReplacements}
                />
              ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Editing the catalog and its mapping is an operations-lead action.
          </p>
        )}
      </section>
    </>
  );
}
