import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant, timeAgo } from "@/lib/format-date";
import { accessTokenValid, isAuthorised } from "@/lib/ewelink";
import { EwelinkSettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meter API settings" };

export default async function MeterSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ authorised?: string; devices?: string; meters?: string }>;
}) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  const sp = await searchParams;
  const cfg = await db.ewelinkApiConfig.findUnique({ where: { id: "singleton" } });

  const atValid = accessTokenValid(cfg);
  const rtValid = isAuthorised(cfg);
  // A live integration is one that can still get a token WITHOUT a human.
  const connected = atValid || rtValid;

  return (
    <>
      <PageHeader
        title="Meter API settings"
        subtitle="The eWeLink (SONOFF) account these meters are read from."
        chip={
          connected ? (
            <StatusChip tone="ok">Authorised</StatusChip>
          ) : cfg ? (
            <StatusChip tone="warn">Not authorised</StatusChip>
          ) : (
            <StatusChip tone="neu">Not configured</StatusChip>
          )
        }
      />

      <div className="grid max-w-[1180px] gap-5 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <CardTitle>Application</CardTitle>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            An App ID and secret from the eWeLink developer platform. The redirect URL must be
            registered against that application, or the consent page refuses the request — so every
            environment registers its own.
          </p>
          <EwelinkSettingsClient
            canEdit={actor ? isOperations(actor.team) : false}
            region={cfg?.region ?? "as"}
            appId={cfg?.appId ?? ""}
            redirectUrl={cfg?.redirectUrl ?? ""}
            hasSecret={Boolean(cfg?.appSecret)}
            authorised={connected}
            outcome={sp.authorised ?? null}
            devices={sp.devices ?? null}
            meters={sp.meters ?? null}
          />
        </Card>

        <Card className="p-6 lg:col-span-5">
          <CardTitle>Connection</CardTitle>
          <dl className="text-[13px]">
            {(
              [
                ["Account", cfg?.accountLabel ?? "—"],
                [
                  "Access token",
                  cfg?.accessTokenExpiresAt
                    ? `${atValid ? "valid until" : "expired"} ${formatInstant(cfg.accessTokenExpiresAt)}`
                    : "none yet",
                ],
                [
                  "Re-authorisation due",
                  cfg?.refreshTokenExpiresAt
                    ? `${formatInstant(cfg.refreshTokenExpiresAt)}${rtValid ? "" : " — overdue"}`
                    : "—",
                ],
                ["Devices last seen", cfg?.lastDeviceCount != null ? String(cfg.lastDeviceCount) : "—"],
                [
                  "Device list synced",
                  cfg?.lastSyncAt ? `${formatInstant(cfg.lastSyncAt)} (${timeAgo(cfg.lastSyncAt)})` : "—",
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b py-2 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
                <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                <dd className="num text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {cfg?.lastError && (
            <p className="mt-3 rounded-[var(--r-sm)] border px-3 py-2 text-[12px]" style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
              {cfg.lastError}
            </p>
          )}
          {/* The token lifetimes are eWeLink's, not ours, and they are the
              one operational fact this integration has that Tuya's does
              not — so the screen states it rather than letting a silent
              expiry look like an outage. */}
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
            eWeLink access tokens last 30 days and refresh tokens 60. The server refreshes on its
            own; if the integration sits idle past the refresh window, someone has to authorise the
            account again here.
          </p>
        </Card>
      </div>
    </>
  );
}
