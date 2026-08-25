import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { BackButton } from "@/components/back-button";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatDateTime } from "@/lib/format-date";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Water tank API" };

// Operations only: this is the account the whole feature reads from, and a
// wrong secret here silently kills the half-hourly sampler.
export default async function TankApiSettingsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isOperations(actor.team)) redirect("/admin/water-tanks");

  const [config, deviceCount, tankCount] = await Promise.all([
    db.tankApiConfig.findUnique({
      where: { id: "singleton" },
      include: { updatedBy: { select: { name: true, email: true } } },
    }),
    db.waterTank.count(),
    db.waterTank.count({ where: { hasLevelSignal: true } }),
  ]);

  const healthy = config?.lastOkAt != null && config.lastError == null;

  return (
    <>
      <div className="mb-4">
        <BackButton fallbackHref="/admin/water-tanks" />
      </div>
      <PageHeader
        title="Water tank API"
        chip={
          !config ? (
            <StatusChip tone="neu">Not configured</StatusChip>
          ) : healthy ? (
            <StatusChip tone="ok">Connected</StatusChip>
          ) : (
            <StatusChip tone="bad">Failing</StatusChip>
          )
        }
        subtitle="The Smart Life / Tuya cloud project the tank sensors live in. Operations only."
      />

      <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <CardTitle>Credentials</CardTitle>
          <SettingsForm
            current={{
              baseUrl: config?.baseUrl ?? "https://openapi.tuyain.com",
              accessId: config?.accessId ?? "",
              hasSecret: config !== null,
            }}
          />
        </Card>

        <Card className="p-6">
          <CardTitle>Connection</CardTitle>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Devices visible", <span key="v" className="num font-semibold">{config?.lastDeviceCount ?? deviceCount}</span>],
              ["Tank sensors", <span key="v" className="num font-semibold">{tankCount}</span>],
              ["Last successful call", config?.lastOkAt ? <span key="v" className="num">{formatDateTime(config.lastOkAt)}</span> : "—"],
              ["Device list synced", config?.lastSyncAt ? <span key="v" className="num">{formatDateTime(config.lastSyncAt)}</span> : "—"],
              [
                "Last changed",
                config
                  ? `${config.updatedBy?.name ?? config.updatedBy?.email ?? "—"}`
                  : "never",
              ],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {config?.lastError && (
            <div
              className="mt-4 rounded-[var(--r-sm)] border px-3.5 py-2.5 text-[13px]"
              style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad-fg)" }}
            >
              {config.lastError}
            </div>
          )}
          <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
            The background job samples every tank&apos;s level every 30 minutes using these
            credentials — history charts read that store.
          </p>
        </Card>
      </div>
    </>
  );
}
