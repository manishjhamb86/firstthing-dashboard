import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { isAuthorised } from "@/lib/ewelink";
import { MetersListClient } from "./meters-list-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meters" };

/**
 * Every device in the authorised eWeLink account, and which circuit each
 * one meters. Non-metering devices stay listed and unassignable, for the
 * same reason the water-tank list keeps the energy meters: a device that is
 * simply missing reads as an account problem rather than as a device of the
 * wrong kind.
 */
export default async function MetersPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();

  const [cfg, meters, societies, circuits] = await Promise.all([
    db.ewelinkApiConfig.findUnique({ where: { id: "singleton" } }),
    db.meterDevice.findMany({
      orderBy: [{ hasEnergySignal: "desc" }, { name: "asc" }],
      include: {
        society: { select: { id: true, name: true } },
        circuit: { select: { id: true, location: true, lightType: true, state: true } },
      },
    }),
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
            <StatusChip tone="ok">
              {meters.filter((m) => m.hasEnergySignal).length} metering
            </StatusChip>
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
        <MetersListClient
          canAssign={Boolean(actor?.permissions.includes("manage_users"))}
          syncedAt={cfg.lastSyncAt?.toISOString() ?? null}
          meters={meters.map((m) => ({
            id: m.id,
            name: m.name,
            productModel: m.productModel,
            uiid: m.uiid,
            online: m.online,
            hasEnergySignal: m.hasEnergySignal,
            lastPowerW: m.lastPowerW,
            societyId: m.societyId,
            societyName: m.society?.name ?? null,
            circuitId: m.circuitId,
            circuitLabel: m.circuit ? `${m.circuit.location ?? "Unnamed"} · ${m.circuit.lightType}` : null,
          }))}
          societies={societies}
          circuits={circuits.map((c) => ({
            id: c.id,
            societyId: c.societyId,
            label: `${c.location ?? "Unnamed"} · ${c.lightType}`,
            taken: Boolean(c.meterDevice),
          }))}
        />
      )}
    </>
  );
}
