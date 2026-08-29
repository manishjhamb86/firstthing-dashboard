import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { isAuthorised } from "@/lib/ewelink";
import { allMeterRows, circuitLabelOf } from "@/lib/meter-view";
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
  // "Watched" is the fleet the health band is ABOUT: the meters somebody
  // owns and is chased over. Every metering device is polled now, so
  // `state !== null` no longer means what it did — it means "we have a
  // reading", which is all 45 and would dilute the band with devices nobody
  // has taken responsibility for.
  const watched = rows.filter((r) => r.assigned);
  const reporting = watched.filter((r) => r.state === "reporting");
  const alerts = rows.flatMap((r) =>
    r.openAlerts.map((a) => ({ ...a, meterId: r.id, meterName: r.name, ownerLabel: r.ownerLabel })),
  );
  const unassigned = metering.filter((r) => !r.assigned);
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
            <Card className="p-6">
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

          {/* The fleet band answers one question before the inventory does:
              is everything reporting? A segmented bar carries the proportions;
              the counts carry the facts. */}
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>Fleet health</CardTitle>
              <span className="text-[13px] text-[var(--text-subtle)]">
                one question first: is everything reporting?
              </span>
            </div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {(
                [
                  [reporting.length, "var(--signal)"],
                  [watched.filter((r) => r.state === "silent").length, "var(--warn-fg)"],
                  [watched.filter((r) => r.state === "offline").length, "var(--bad-fg)"],
                  [unassigned.length, "var(--border)"],
                ] as const
              )
                .filter(([n]) => n > 0)
                .map(([n, color], i) => (
                  <div
                    key={i}
                    style={{
                      flexGrow: n,
                      minWidth: 8,
                      background: color,
                      borderRadius: 5,
                    }}
                  />
                ))}
            </div>
            <div className="mt-3.5 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[13px] text-[var(--text-muted)]">
              <FleetCount color="var(--signal)" n={reporting.length} label="reporting" />
              <FleetCount
                color="var(--warn-fg)"
                n={watched.filter((r) => r.state === "silent").length}
                label="silent"
              />
              <FleetCount
                color="var(--bad-fg)"
                n={watched.filter((r) => r.state === "offline").length}
                label="offline"
              />
              <FleetCount color="var(--border)" n={unassigned.length} label="unassigned · not watched" />
              <span className="ml-auto">
                <span className="num text-[15px] font-semibold text-[var(--text)]">
                  {historyHours === 0 ? "0" : historyHours.toLocaleString()}
                </span>{" "}
                hours of imported history
              </span>
            </div>
          </Card>

          <MetersListClient
            canAssign={Boolean(actor?.permissions.includes("manage_users"))}
            syncedAt={cfg.lastSyncAt?.toISOString() ?? null}
            meters={rows}
            fieldStaff={fieldStaff.map((f) => ({ id: f.id, label: f.name ?? f.email }))}
            societies={societies}
            circuits={circuits.map((c) => ({
              id: c.id,
              societyId: c.societyId,
              label: circuitLabelOf(c.location, c.lightType),
              state: c.state,
              takenBy: c.meterDevice?.id ?? null,
            }))}
          />
        </div>
      )}
    </>
  );
}

function FleetCount({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span
        className="inline-block h-2 w-2 self-center rounded-full"
        style={{ background: color }}
      />
      <span className="num text-[15px] font-semibold text-[var(--text)]">{n}</span>
      <span>{label}</span>
    </span>
  );
}
