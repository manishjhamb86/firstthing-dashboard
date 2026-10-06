import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { isDemoMode } from "@/lib/demo-mode";
import { demoLightsInstalled, totalLights } from "@/lib/light-population";
import { circuitLightCountHistoryByCircuit, describeLightCountChange, filterCustomerRelevant } from "@/lib/circuit-light-history";
import { deviceLabel, fittingLabel, installedCount, meteredOf } from "@/lib/inventory-display";
import { formatDate } from "@/lib/format-date";
import { circuitLabelOf } from "@/lib/meter-view";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow } from "@/components/ui";
import { LightHistoryList } from "@/components/light-history-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory" };

/**
 * The backend's own mirror of the customer portal's Inventory page
 * (2026-10-06, user-asked: "In backend under Society there should be a
 * dedicated inventory section same as in customer portal") — every FirsThing
 * device and fitting at the society, read through the SAME shared helpers
 * (`inventory-display.ts`) the portal page uses, so the two can never
 * disagree about what "installed" means. Unlike the portal, this one shows
 * the RAW, unfiltered light-count history (an auto-cancelled pair still
 * listed, marked as such) with the manage controls operations needs.
 */
export default async function SocietyInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const canView =
    session.user.adminPermissions?.includes("manage_survey") ||
    session.user.adminPermissions?.includes("manage_pipeline");
  if (!canView) redirect("/admin/societies");
  const canManage =
    (session.user.adminPermissions?.includes("manage_survey") ?? false) &&
    (session.user.adminPermissions?.includes("manage_pipeline") ?? false);
  const demoMode = await isDemoMode();

  const { id: societyId } = await params;
  const society = await db.society.findUnique({ where: { id: societyId }, select: { id: true, name: true } });
  if (!society) notFound();

  const [circuitRows, meters, tanks] = await Promise.all([
    db.circuit.findMany({
      where: { societyId, voidedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        location: true,
        lightType: true,
        demos: {
          where: { voidedAt: null },
          orderBy: { sequence: "asc" },
          select: { meteredLightCount: true, rejected: true, lightReplacementDate: true },
        },
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
  const lightHistoryByCircuit = await circuitLightCountHistoryByCircuit(circuitRows.map((c) => c.id));
  const circuits = circuitRows.map(({ demos, ...c }) => {
    const history = lightHistoryByCircuit.get(c.id) ?? [];
    // The RAW history, not the customer-filtered one — operations manages
    // from here, so an auto-cancelled pair still needs to be visible,
    // marked as such (the same "autoHidden" flag the single-circuit page
    // computes), rather than silently vanishing.
    const customerVisibleIds = new Set(filterCustomerRelevant(history).flatMap((h) => h.ids));
    return {
      ...c,
      lightReplacementDate:
        demos
          .filter((d) => !d.rejected && d.lightReplacementDate)
          .map((d) => d.lightReplacementDate!)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      demoLights: demoLightsInstalled({ meteredLightCount: c.meteredLightCount, demos, devices: c.devices }),
      lightHistory: history.map((h) => ({
        ids: h.ids,
        at: h.at,
        text: describeLightCountChange(h),
        kind: h.kind,
        autoHidden: h.excludedAt === null && !h.ids.some((id) => customerVisibleIds.has(id)),
        excludedAt: h.excludedAt,
        excludedReason: h.excludedReason,
      })),
    };
  });

  const installedRows = circuits.filter((c) => c.lightReplacementDate && meteredOf(c) > 0);
  const societyLights = installedRows.reduce((s, c) => s + totalLights(c.representedLightCount, c.demoLights), 0);
  const demoLights = installedRows.reduce((s, c) => s + c.demoLights, 0);
  const fullLights = installedRows.reduce((s, c) => s + c.representedLightCount, 0);
  const sensors = tanks.filter((t) => t.hasLevelSignal);

  const empty = circuits.length === 0 && meters.length === 0 && tanks.length === 0;
  const SETUP_LABEL: Record<string, string> = { domestic: "Domestic", flush: "Flush", stp: "STP" };

  return (
    <>
      <PageHeader
        backHref={`/admin/societies/${societyId}`}
        title="Inventory"
        subtitle={`Every FirsThing device and fitting at ${society.name}.`}
      />

      {empty ? (
        <EmptyState title="Nothing deployed yet">
          Once FirsThing installs fittings, meters or sensors at this society, they are listed here.
        </EmptyState>
      ) : (
        <>
          <StatRow>
            <Stat
              label="LED lights installed"
              value={societyLights.toLocaleString("en-IN")}
              detail={
                fullLights > 0
                  ? `${fullLights.toLocaleString("en-IN")} full installation + ${demoLights.toLocaleString("en-IN")} demo`
                  : `${demoLights.toLocaleString("en-IN")} from the demo`
              }
            />
            <Stat label="Smart meters" value={String(meters.length)} detail="watching circuits" />
            <Stat label="Tank level sensors" value={String(sensors.length)} detail="on water tanks" />
          </StatRow>

          {circuits.some((c) => c.devices.length > 0) && (
            <Card className="mb-5 mt-5 p-6">
              <CardTitle>Lighting</CardTitle>
              <div className="flex flex-col gap-5">
                {circuits
                  .filter((c) => c.devices.length > 0)
                  .map((c) => {
                    const metered = meteredOf(c);
                    const society2 = totalLights(c.representedLightCount, c.demoLights);
                    const standsIn = c.lightReplacementDate && metered > 0 && c.representedLightCount > 0;
                    return (
                      <div key={c.id}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-[13.5px] font-semibold">{circuitLabelOf(c.location, c.lightType)}</p>
                          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                            {standsIn ? (
                              <>
                                <span className="num font-bold" style={{ color: "var(--text)" }}>
                                  {society2.toLocaleString("en-IN")}
                                </span>{" "}
                                installed ·{" "}
                                <span className="num">{c.representedLightCount.toLocaleString("en-IN")}</span> full
                                installation +{" "}
                                <span className="num">{c.demoLights.toLocaleString("en-IN")}</span> demo
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
                        <LightHistoryList
                          items={c.lightHistory}
                          circuitId={c.id}
                          societyId={societyId}
                          canManage={canManage}
                          demoMode={demoMode}
                        />
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
                                    ? fittingLabel(d.replacementWattage ?? d.wattage, d.replacementType.name)
                                    : fittingLabel(d.wattage, d.deviceType.name)}
                                </p>
                                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                                  {d.excludedFromCalculation
                                    ? "on the circuit, not replaced by FirsThing"
                                    : installedCount(c, d) > 0
                                      ? `on the metered circuit${
                                          c.lightReplacementDate ? ` · installed ${formatDate(c.lightReplacementDate)}` : ""
                                        }`
                                      : "original fitting, awaiting replacement"}
                                </p>
                              </div>
                              <span className="num text-[15px] font-bold">
                                {(d.replacementType ? (d.replacementCount ?? d.count) : d.count).toLocaleString("en-IN")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
              {fullLights > 0 && (
                <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                  Installed is the full installation plus the demo lights — the demo lights went in first
                  and are not part of the full installation, and together they are what the bill is
                  computed on. The lines beneath are the fittings on the metered circuit itself, which is
                  what the readings are taken from.
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
                      <p className="text-[13.5px] font-semibold">{deviceLabel(`${m.productModel} energy meter`, m.name)}</p>
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
                      <p className="text-[13.5px] font-semibold">{deviceLabel(t.productName, t.name)}</p>
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
