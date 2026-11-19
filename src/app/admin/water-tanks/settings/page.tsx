import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { BackButton } from "@/components/back-button";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { SettingsForm } from "./settings-form";
import { ThresholdsForm } from "./thresholds-form";
import { AddAccount } from "./add-account";

export const dynamic = "force-dynamic";
export const metadata = { title: "Water tank API" };

// Operations only: this is the account the whole feature reads from, and a
// wrong secret here silently kills the half-hourly sampler.
export default async function TankApiSettingsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isOperations(actor.team)) redirect("/admin/water-tanks");

  const [accounts, deviceCounts, tankCounts] = await Promise.all([
    db.tankApiConfig.findMany({ include: { updatedBy: { select: { name: true, email: true } } } }),
    db.waterTank.groupBy({ by: ["tankApiConfigId"], _count: { _all: true } }),
    db.waterTank.groupBy({ by: ["tankApiConfigId"], where: { hasLevelSignal: true }, _count: { _all: true } }),
  ]);
  // The first account first; the rest in the order they were added (their ids carry the time).
  accounts.sort((a, b) => (a.id === "singleton" ? -1 : b.id === "singleton" ? 1 : a.id < b.id ? -1 : 1));
  const config = accounts.find((a) => a.id === "singleton") ?? null;
  const countOf = (rows: { tankApiConfigId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.tankApiConfigId === id)?._count._all ?? 0;
  const anyFailing = accounts.some((a) => a.lastError != null);
  const anyOk = accounts.some((a) => a.lastOkAt != null && a.lastError == null);

  return (
    <>
      <div className="mb-4">
        <BackButton fallbackHref="/admin/water-tanks" />
      </div>
      <PageHeader
        title="Water tank API"
        chip={
          accounts.length === 0 ? (
            <StatusChip tone="neu">Not configured</StatusChip>
          ) : anyFailing ? (
            <StatusChip tone={anyOk ? "warn" : "bad"}>{anyOk ? "An account is failing" : "Failing"}</StatusChip>
          ) : (
            <StatusChip tone="ok">{accounts.length === 1 ? "Connected" : `${accounts.length} accounts connected`}</StatusChip>
          )
        }
        subtitle="The Smart Life / Tuya cloud projects the tank sensors live in — more than one can sync at once. Operations only."
      />

      <div className="flex max-w-5xl flex-col gap-5">
        {(accounts.length === 0 ? [null] : accounts).map((a, i) => {
          const id = a?.id ?? "singleton";
          const healthy = a?.lastOkAt != null && a.lastError == null;
          return (
            <div key={id} className="grid items-start gap-5 lg:grid-cols-2">
              <Card className="p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="mb-0">{a?.label || (accounts.length > 1 ? `Account ${i + 1}` : "Credentials")}</CardTitle>
                  {a && (healthy ? <StatusChip tone="ok">Connected</StatusChip> : a.lastError ? <StatusChip tone="bad">Failing</StatusChip> : <StatusChip tone="neu">Not tested</StatusChip>)}
                </div>
                <SettingsForm
                  accountId={id}
                  removable={!!a && id !== "singleton"}
                  current={{ label: a?.label ?? null, baseUrl: a?.baseUrl ?? "https://openapi.tuyain.com", accessId: a?.accessId ?? "", hasSecret: a !== null }}
                />
              </Card>
              <Card className="p-6">
                <CardTitle>Connection</CardTitle>
                <dl className="space-y-2.5 text-sm">
                  {[
                    ["Devices visible", <span key="v" className="num font-semibold">{a?.lastDeviceCount ?? countOf(deviceCounts, id)}</span>],
                    ["Tank sensors", <span key="v" className="num font-semibold">{countOf(tankCounts, id)}</span>],
                    ["Last successful call", a?.lastOkAt ? <span key="v" className="num">{formatInstant(a.lastOkAt)}</span> : "—"],
                    ["Device list synced", a?.lastSyncAt ? <span key="v" className="num">{formatInstant(a.lastSyncAt)}</span> : "—"],
                    ["Last changed", a ? `${a.updatedBy?.name ?? a.updatedBy?.email ?? "—"}` : "never"],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between gap-4">
                      <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                {a?.lastError && (
                  <div className="mt-4 rounded-[var(--r-sm)] border px-3.5 py-2.5 text-[13px]" style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad-fg)" }}>
                    {a.lastError}
                  </div>
                )}
              </Card>
            </div>
          );
        })}

        {accounts.length > 0 && <AddAccount />}

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          The background job samples every tank&apos;s level every 30 minutes, each with the account it is listed in — history charts read that store.
        </p>

        <Card className="p-6">
          <CardTitle>Alert thresholds</CardTitle>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Every portal account with Water access gets a push notification the moment a tank
            crosses one of these, and when it stops reporting at all. They apply to every account.
          </p>
          <ThresholdsForm current={{ lowPct: config?.lowLevelPct ?? 20, highPct: config?.highLevelPct ?? 90 }} />
        </Card>
      </div>
    </>
  );
}
