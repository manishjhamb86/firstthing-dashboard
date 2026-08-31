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
        meteredLightCount: true,
        representedLightCount: true,
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
  /**
   * "20W Tube light 20W" — several catalog names already carry the wattage,
   * and prefixing it again reads as a rendering fault, the same shape as
   * "basement · Basement". Same rule for a device whose product name IS its
   * name.
   */
  const fittingLabel = (watts: number, name: string): string =>
    name.toLowerCase().includes(`${watts}w`) ? name : `${watts}W ${name}`;
  const deviceLabel = (product: string, name: string): string =>
    product.trim().toLowerCase() === name.trim().toLowerCase() ? name : `${product} — ${name}`;

  const meteredOf = (c: (typeof circuits)[number]) =>
    c.devices.reduce((x, d) => x + installedCount(c, d), 0);

  /**
   * What FirsThing has actually installed at the society, which is NOT the
   * metered circuit's own fitting count (user-reported 2026-08-31: "showing
   * only the demo install lights, not the complete installation as per the
   * billing").
   *
   * CON-11 is the reason the two differ: a metered circuit stands in for
   * every light of its type, and the fee is computed on that whole
   * population — so a page listing 96 while the bill is raised on 2,508 is
   * describing a different society from the invoice. The population figure
   * is `representedLightCount`, the same field the demo report and the
   * billing run read, and it counts only circuits whose replacement has
   * actually been recorded.
   */
  const installedRows = circuits.filter((c) => c.lightReplacementDate && meteredOf(c) > 0);
  const societyLights = installedRows.reduce(
    (s, c) => s + Math.max(c.representedLightCount, meteredOf(c)),
    0,
  );
  const meteredLights = installedRows.reduce((s, c) => s + meteredOf(c), 0);
  const extrapolated = societyLights > meteredLights;
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
              value={societyLights.toLocaleString("en-IN")}
              detail={
                extrapolated
                  ? `across your society · ${meteredLights.toLocaleString("en-IN")} on ${
                      circuits.length === 1 ? "the metered circuit" : "metered circuits"
                    }`
                  : `across ${circuits.length} circuit${circuits.length === 1 ? "" : "s"}`
              }
            />
            <Stat label="Smart meters" value={String(meters.length)} detail="watching your circuits" />
            <Stat label="Tank level sensors" value={String(sensors.length)} detail="on your water tanks" />
          </StatRow>

          {circuits.some((c) => c.devices.length > 0) && (
            <Card className="mb-5 p-6">
              <CardTitle>Lighting</CardTitle>
              {/* Grouped by circuit, because a circuit is where the two
                  figures meet: the population FirsThing replaced across the
                  society, and the fittings on the circuit that measures it.
                  Listed flat, the per-line counts read as the whole
                  installation, which is the report this fixes. */}
              <div className="flex flex-col gap-5">
                {circuits
                  .filter((c) => c.devices.length > 0)
                  .map((c) => {
                    const metered = meteredOf(c);
                    const society = Math.max(c.representedLightCount, metered);
                    const standsIn = c.lightReplacementDate && metered > 0 && society > metered;
                    return (
                      <div key={c.id}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-[13.5px] font-semibold">
                            {circuitLabelOf(c.location, c.lightType)}
                          </p>
                          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                            {standsIn ? (
                              <>
                                <span className="num font-bold" style={{ color: "var(--text)" }}>
                                  {society.toLocaleString("en-IN")}
                                </span>{" "}
                                installed across your society ·{" "}
                                <span className="num">{metered.toLocaleString("en-IN")}</span> on the
                                metered circuit
                              </>
                            ) : metered > 0 ? (
                              <>
                                <span className="num font-bold" style={{ color: "var(--text)" }}>
                                  {metered.toLocaleString("en-IN")}
                                </span>{" "}
                                installed
                              </>
                            ) : (
                              "not replaced yet"
                            )}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-col">
                          {c.devices.map((d) => (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                              style={{ borderBottom: "1px solid var(--border-subtle)" }}
                            >
                              <div>
                                <p className="text-[13px] font-medium">
                                  {d.replacementType
                                    ? fittingLabel(
                                        d.replacementWattage ?? d.wattage,
                                        d.replacementType.name,
                                      )
                                    : fittingLabel(d.wattage, d.deviceType.name)}
                                </p>
                                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                                  {d.excludedFromCalculation
                                    ? "on the circuit, not replaced by FirsThing"
                                    : installedCount(c, d) > 0
                                      ? `on the metered circuit${
                                          c.lightReplacementDate
                                            ? ` · installed ${c.lightReplacementDate
                                                .toISOString()
                                                .slice(0, 10)}`
                                            : ""
                                        }`
                                      : "original fitting, awaiting replacement"}
                                </p>
                              </div>
                              <span className="num text-[15px] font-bold">
                                {(d.replacementType
                                  ? (d.replacementCount ?? d.count)
                                  : d.count
                                ).toLocaleString("en-IN")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
              {extrapolated && (
                // Said plainly, because the two numbers on this card have
                // different evidence behind them and presenting them
                // identically is what INV-02 exists to stop.
                <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                  The society-wide figure is the population each metered circuit stands in for — the
                  same basis your bill is computed on. The lines beneath it are the fittings on the
                  metered circuit itself, which is what the readings are taken from.
                </p>
              )}
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
                        {deviceLabel(`${m.productModel} energy meter`, m.name)}
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
                        {deviceLabel(t.productName, t.name)}
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
