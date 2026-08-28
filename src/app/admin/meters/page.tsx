import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { isAuthorised } from "@/lib/ewelink";
import { allMeterRows } from "@/lib/meter-view";
import { MetersListClient } from "./meters-list-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meters" };

/**
 * Every device in the authorised eWeLink account, and which circuit each
 * one meters. Non-metering devices stay listed and unassignable, for the
 * same reason the water-tank list keeps the energy meters: a device that is
 * simply missing reads as an account problem rather than as a device of the
 * wrong kind.
 *
 * The page opens with what needs doing, not with the inventory. A list of
 * forty-five healthy meters buries the two that stopped answering last
 * night, and those two are the only reason anybody opens this screen in a
 * hurry.
 */
export default async function MetersPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();

  const [cfg, rows, societies, fieldStaff, circuits] = await Promise.all([
    db.ewelinkApiConfig.findUnique({ where: { id: "singleton" } }),
    allMeterRows(),
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.adminUser.findMany({
      where: { isActive: true, deletedAt: null, permissions: { has: "manage_survey" } },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    db.circuit.findMany({
      where: { voidedAt: null },
      orderBy: [{ societyId: "asc" }, { lightType: "asc" }],
      select: {
        id: true,
        societyId: true,
        location: true,
        lightType: true,
        state: true,
        meterDevice: { select: { id: true } },
      },
    }),
  ]);

  const authorised = isAuthorised(cfg);
  const metering = rows.filter((r) => r.hasEnergySignal);
  const watched = rows.filter((r) => r.state !== null);
  const reporting = watched.filter((r) => r.state === "reporting");
  const alerts = rows.flatMap((r) =>
    r.openAlerts.map((a) => ({ ...a, meterId: r.id, meterName: r.name, ownerLabel: r.ownerLabel })),
  );
  const unassigned = metering.filter((r) => r.state === null);
  const historyHours = rows.reduce((s, r) => s + r.hourlyCount, 0);

  return (
    <>
      <PageHeader
        title="Meters"
        subtitle="SONOFF meters mirrored from the eWeLink account, and the circuit each one measures."
        chip={
          !cfg ? (
            <StatusChip tone="neu">Not configured</StatusChip>
          ) : !authorised ? (
            <StatusChip tone="warn">Not authorised</StatusChip>
          ) : (
            <StatusChip tone="ok">{metering.length} metering</StatusChip>
          )
        }
      />

      {!cfg || !authorised ? (
        <Card className="p-6">
          <EmptyState title={cfg ? "The eWeLink account is not authorised" : "Not connected yet"}>
            {cfg
              ? "Someone with operations access has to authorise the eWeLink account before its devices can be read."
              : "Configure the eWeLink application, then authorise the account; every device in it then appears here."}{" "}
            <Link href="/admin/meters/settings" className="font-semibold">
              API settings →
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* What needs doing, before the inventory. */}
          {alerts.length > 0 && (
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <CardTitle>Needs attention</CardTitle>
                <StatusChip tone="bad">{alerts.length}</StatusChip>
              </div>
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-[var(--r-sm)] p-3"
                    style={{
                      background: a.kind === "offline" ? "var(--bad-bg)" : "var(--warn-bg)",
                      border: `1px solid ${a.kind === "offline" ? "var(--bad-line)" : "var(--warn-line)"}`,
                    }}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusChip tone={a.kind === "offline" ? "bad" : "warn"}>
                        {a.kind === "offline" ? "Not reachable" : "Out of range"}
                      </StatusChip>
                      <span className="text-xs text-[var(--text-subtle)]">
                        since {a.openedAt.slice(0, 16).replace("T", " ")}
                      </span>
                      {/* An alert addressed to nobody is an alert nobody acts on. */}
                      <span className="text-xs text-[var(--text-subtle)]">
                        {a.ownerLabel ? `· ${a.ownerLabel} to chase` : "· nobody named to chase it"}
                      </span>
                    </div>
                    <p className="text-[13px]">{a.message}</p>
                    <Link
                      href={`/admin/meters/${a.meterId}`}
                      className="mt-1 inline-block text-[13px] font-semibold underline"
                    >
                      Open {a.meterName} →
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <StatRow>
            <Stat label="Metering devices" value={metering.length} detail={`${rows.length} devices in the account`} />
            <Stat
              label="Reporting"
              value={`${reporting.length}/${watched.length}`}
              tone={watched.length > 0 && reporting.length === watched.length ? "accent" : "warn"}
              detail="of the meters bound to a circuit"
            />
            <Stat
              label="Not yet assigned"
              value={unassigned.length}
              detail={unassigned.length > 0 ? "not watched, and raise no alerts" : "every meter is bound"}
            />
            <Stat
              label="Hourly history"
              value={historyHours === 0 ? "—" : historyHours.toLocaleString()}
              detail={historyHours === 0 ? "no exports imported yet" : "hours imported from meter exports"}
            />
          </StatRow>

          <MetersListClient
            canAssign={Boolean(actor?.permissions.includes("manage_users"))}
            syncedAt={cfg.lastSyncAt?.toISOString() ?? null}
            meters={rows}
            fieldStaff={fieldStaff.map((f) => ({ id: f.id, label: f.name ?? f.email }))}
            societies={societies}
            circuits={circuits.map((c) => ({
              id: c.id,
              societyId: c.societyId,
              label: `${c.location ?? "Unnamed"} · ${c.lightType}`,
              state: c.state,
              takenBy: c.meterDevice?.id ?? null,
            }))}
          />
        </div>
      )}
    </>
  );
}
