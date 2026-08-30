import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow } from "@/components/ui";
import { circuitLabelOf } from "@/lib/meter-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory" };

// What FirsThing has deployed at the society — the fittings on each circuit
// (from the load inventory the commissioning work already keeps), the smart
// meters, and the tank sensors. Read straight from the rows of record; no
// counts are typed in anywhere.
export default async function PortalInventoryPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "inventory")) redirect("/portal");
  const societyId = viewer.societyId;

  const [circuits, meters, tanks] = await Promise.all([
    db.circuit.findMany({
      where: { societyId, voidedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        location: true,
        lightType: true,
        lightReplacementDate: true,
        devices: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            count: true,
            wattage: true,
            replacementCount: true,
            replacementWattage: true,
            historical: true,
            excludedFromCalculation: true,
            deviceType: { select: { name: true } },
            replacementType: { select: { name: true } },
          },
        },
      },
    }),
    db.meterDevice.findMany({
      where: { societyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, productModel: true, circuit: { select: { location: true, lightType: true } } },
    }),
    db.waterTank.findMany({
      where: { societyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, productName: true, hasLevelSignal: true, setupType: true },
    }),
  ]);

  // What counts as a FirsThing-installed fitting: a line with a recorded
  // replacement, OR a historical line on a replaced circuit — for a
  // pre-system society the recorded line IS the installed fitting (the
  // backfill records the current 20W fittings, not a before/after pair).
  // An excluded line is the opposite: a shared fixture FirsThing did NOT
  // replace (the CON-16 amendment), on the circuit but not ours.
  type Dev = (typeof circuits)[number]["devices"][number];
  const installedCount = (c: (typeof circuits)[number], d: Dev): number => {
    if (d.replacementType) return d.replacementCount ?? d.count;
    if (d.historical && !d.excludedFromCalculation && c.lightReplacementDate) return d.count;
    return 0;
  };
  const replacedLights = circuits.reduce(
    (s, c) => s + c.devices.reduce((x, d) => x + installedCount(c, d), 0),
    0,
  );
  const sensors = tanks.filter((t) => t.hasLevelSignal);

  const empty = circuits.length === 0 && meters.length === 0 && tanks.length === 0;

  const SETUP_LABEL: Record<string, string> = { domestic: "Domestic", flush: "Flush", stp: "STP" };

  return (
    <>
      <PageHeader title="Inventory" subtitle="Every FirsThing device and fitting at your society." />

      {empty ? (
        <EmptyState title="Nothing deployed yet">
          Once FirsThing installs fittings, meters or sensors at your society, they are listed here.
        </EmptyState>
      ) : (
        <>
          <StatRow>
            <Stat
              label="LED lights installed"
              value={replacedLights.toLocaleString("en-IN")}
              detail={`across ${circuits.length} circuit${circuits.length === 1 ? "" : "s"}`}
            />
            <Stat label="Smart meters" value={String(meters.length)} detail="watching your circuits" />
            <Stat label="Tank level sensors" value={String(sensors.length)} detail="on your water tanks" />
          </StatRow>

          {circuits.some((c) => c.devices.length > 0) && (
            <Card className="mb-5 p-6">
              <CardTitle>Lighting</CardTitle>
              <div className="flex flex-col">
                {circuits.flatMap((c) =>
                  c.devices.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <div>
                        <p className="text-[13.5px] font-semibold">
                          {d.replacementType
                            ? `${d.replacementWattage ?? d.wattage}W ${d.replacementType.name}`
                            : `${d.wattage}W ${d.deviceType.name}`}{" "}
                          — {circuitLabelOf(c.location, c.lightType)}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                          {d.excludedFromCalculation
                            ? "on the circuit, not replaced by FirsThing"
                            : installedCount(c, d) > 0
                              ? `installed by FirsThing${
                                  c.lightReplacementDate
                                    ? ` · ${c.lightReplacementDate.toISOString().slice(0, 10)}`
                                    : ""
                                }`
                              : "original fitting, awaiting replacement"}
                        </p>
                      </div>
                      <span className="num text-[16px] font-bold">
                        {(d.replacementType ? (d.replacementCount ?? d.count) : d.count).toLocaleString("en-IN")}
                      </span>
                    </div>
                  )),
                )}
              </div>
            </Card>
          )}

          {meters.length > 0 && (
            <Card className="mb-5 p-6">
              <CardTitle>Metering</CardTitle>
              <div className="flex flex-col">
                {meters.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold">
                        {m.productModel} energy meter — {m.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                        {m.circuit
                          ? `${circuitLabelOf(m.circuit.location, m.circuit.lightType)} · reads power, voltage and daily kWh`
                          : "reads power, voltage and daily kWh"}
                      </p>
                    </div>
                    <span className="num text-[16px] font-bold">1</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tanks.length > 0 && (
            <Card className="mb-5 p-6">
              <CardTitle>Water monitoring</CardTitle>
              <div className="flex flex-col">
                {tanks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold">
                        {t.productName} — {t.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                        {t.setupType ? `${SETUP_LABEL[t.setupType]} setup` : "setup not classified yet"}
                        {t.hasLevelSignal ? " · level sensor" : ""}
                      </p>
                    </div>
                    <span className="num text-[16px] font-bold">1</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
