import { redirect } from "next/navigation";
import { demoLightsInstalled, totalLights } from "@/lib/light-population";
import { circuitLightCountHistoryByCircuit, describeLightCountChange, filterCustomerRelevant } from "@/lib/circuit-light-history";
import { deviceLabel, fittingLabel, installedCount, meteredOf } from "@/lib/inventory-display";
import { groupCircuitsByDeal } from "@/lib/circuit-deal-group";
import { formatDate } from "@/lib/format-date";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, CardTitle, EmptyState, InfoNote, PageHeader } from "@/components/ui";
import { circuitLabelOf } from "@/lib/meter-view";
import { CompactTile, KpiBubble } from "../kpi-tiles";
import { Droplets, Lightbulb, Zap } from "lucide-react";

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

  const [circuitRows, meters, tanks] = await Promise.all([
    db.circuit.findMany({
      where: { societyId, voidedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        siteSurveyId: true,
        location: true,
        lightType: true,
        // When the lights went in: the latest counted demo's replacement day
        // (2026-09-26 — the replacement belongs to the demo now).
        // Every live demo, first by sequence: the first is the initial demo
        // (its lights are the demo lights), and the latest counted one's
        // replacement day is when the lights went in.
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
  const circuits = circuitRows.map(({ demos, ...c }) => ({
    ...c,
    lightReplacementDate:
      demos
        .filter((d) => !d.rejected && d.lightReplacementDate)
        .map((d) => d.lightReplacementDate!)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    demoLights: demoLightsInstalled({ meteredLightCount: c.meteredLightCount, demos, devices: c.devices }),
    // A real back-and-forth that exactly cancels (or an operator's own
    // manual exclusion) is dropped here — a resident reading "it was X,
    // then corrected to Y, then back to X" when nothing actually, lastingly
    // moved is confusing, not transparent (2026-10-06, user-caught).
    lightHistory: filterCustomerRelevant(lightHistoryByCircuit.get(c.id) ?? []),
  }));

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
  // Installed = the full installation PLUS the demo lights (2026-09-27,
  // user-specified): the demo lights went in before the full installation and
  // are not part of it, but they are FirsThing's lights at the society all
  // the same.
  const installedRows = circuits.filter((c) => c.lightReplacementDate && meteredOf(c) > 0);
  // Several circuits can stand for ONE deal/location — the society asked
  // for a second demo, or the first wasn't trusted, and the redo was walked
  // through as a fresh circuit rather than a second demo on the existing
  // one (2026-10-08, user-specified). Each such circuit carries its OWN
  // full-installation figure, independently entered — summing them as if
  // they were separate installations would double what a resident is told
  // was actually fitted. The full installation is counted once per deal
  // group; a disagreement between members takes the larger figure rather
  // than silently averaging it, so the total never reads lower than what
  // was genuinely installed.
  const { groups: installedGroups, solo: installedSolo } = groupCircuitsByDeal(
    installedRows.map((c) => ({
      id: c.id,
      siteSurveyId: c.siteSurveyId,
      location: c.location,
      lightType: c.lightType,
      demoLights: c.demoLights,
      fullInstallation: c.representedLightCount,
      isLive: false,
      state: "",
    })),
  );
  const groupFullInstallation = (g: (typeof installedGroups)[number]) =>
    g.fullInstallationDisagreement ? Math.max(...g.fullInstallationDisagreement) : g.members[0]!.fullInstallation;
  const demoLights = installedRows.reduce((s, c) => s + c.demoLights, 0);
  const fullLights =
    installedGroups.reduce((s, g) => s + groupFullInstallation(g), 0) +
    installedSolo.reduce((s, c) => s + c.fullInstallation, 0);
  const societyLights = fullLights + demoLights;
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
          {/* Below sm: three full KPI tiles stacked a full column tall each
              (user-caught, 2026-10-07 — "same issue [as Electricity]") — a
              compact 3-up row carries the same three figures in a fraction
              of the height; the full detail lines move to sm+. */}
          <div className="mb-6 grid grid-cols-3 gap-2.5 sm:hidden">
            <CompactTile tone="ok" value={societyLights.toLocaleString("en-IN")} label="LED lights" />
            <CompactTile tone="info" value={String(meters.length)} label="Smart meters" />
            <CompactTile tone="info" value={String(sensors.length)} label="Tank sensors" />
          </div>

          <div className="mb-6 hidden gap-4 sm:grid sm:grid-cols-3">
            <KpiBubble
              icon={Lightbulb}
              tone="ok"
              value={societyLights.toLocaleString("en-IN")}
              label="LED lights installed"
              detail={
                fullLights > 0
                  ? `${fullLights.toLocaleString("en-IN")} in the full installation + ${demoLights.toLocaleString("en-IN")} from the demo`
                  : `${demoLights.toLocaleString("en-IN")} from the demo`
              }
            />
            <KpiBubble icon={Zap} tone="info" value={String(meters.length)} label="Smart meters" detail="watching your circuits" />
            <KpiBubble icon={Droplets} tone="info" value={String(sensors.length)} label="Tank level sensors" detail="on your water tanks" />
          </div>

          {circuits.some((c) => c.devices.length > 0) && (
            <Card className="mb-5 p-6">
              <CardTitle>Lighting</CardTitle>
              {/* Grouped by circuit, because a circuit is where the two
                  figures meet: the population FirsThing replaced across the
                  society, and the fittings on the circuit that measures it.
                  Listed flat, the per-line counts read as the whole
                  installation, which is the report this fixes.

                  Where more than one circuit stands for the same deal/
                  location — a second demo the society asked for, walked
                  through as its own circuit rather than a second demo on
                  the first one (2026-10-08, user-specified) — those circuits
                  are shown together under one shared heading, each demo's
                  own line still listed, so the combined total reads once
                  rather than as two unrelated installations. */}
              {(() => {
                const lit = circuits.filter((c) => c.devices.length > 0);
                const { groups, solo } = groupCircuitsByDeal(
                  lit.map((c) => ({
                    id: c.id,
                    siteSurveyId: c.siteSurveyId,
                    location: c.location,
                    lightType: c.lightType,
                    demoLights: c.demoLights,
                    fullInstallation: c.representedLightCount,
                    isLive: false,
                    state: "",
                  })),
                );
                const byId = new Map(lit.map((c) => [c.id, c]));
                /** `null` for a solo circuit — shows its own name and full
                 * caption. A number for a circuit inside a deal group — the
                 * combined caption already lives on the group's own
                 * heading, so each member just names which demo it is. */
                const renderCircuit = (c: (typeof lit)[number], demoOrdinal: number | null) => {
                  const metered = meteredOf(c);
                  const society = totalLights(c.representedLightCount, c.demoLights);
                  const standsIn = c.lightReplacementDate && metered > 0 && c.representedLightCount > 0;
                  return (
                    <div key={c.id}>
                      {demoOrdinal !== null ? (
                        <p className="text-[12.5px] font-semibold" style={{ color: "var(--text-subtle)" }}>
                          Demo {demoOrdinal} — <span className="num">{c.demoLights.toLocaleString("en-IN")}</span> lights
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-[13.5px] font-semibold">{circuitLabelOf(c.location, c.lightType)}</p>
                          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                            {standsIn ? (
                              <>
                                <span className="num font-bold" style={{ color: "var(--text)" }}>
                                  {society.toLocaleString("en-IN")}
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
                      )}
                      {c.lightHistory.length > 0 && (
                        // Closed by default — most circuits have never had
                        // a correction, and the ones that have state it in
                        // full rather than leave the split looking like a
                        // mistake (2026-10-05, user-asked).
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs underline" style={{ color: "var(--text-muted)" }}>
                            {c.lightHistory.length === 1 ? "1 correction on record" : `${c.lightHistory.length} corrections on record`}
                          </summary>
                          <ul className="mt-1 flex flex-col gap-1">
                            {c.lightHistory.map((h, i) => (
                              <li key={i} className="text-xs leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                                <span className="font-medium">{h.at}</span> — {describeLightCountChange(h)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
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
                };
                return (
                  <div className="flex flex-col gap-6">
                    {groups.map((g) => (
                      <div key={g.label + g.members.map((m) => m.id).join(",")}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-[13.5px] font-semibold">{g.label}</p>
                          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                            {g.combinedTotal !== null ? (
                              <>
                                <span className="num font-bold" style={{ color: "var(--text)" }}>
                                  {g.combinedTotal.toLocaleString("en-IN")}
                                </span>{" "}
                                installed ·{" "}
                                <span className="num">
                                  {g.members[0]!.fullInstallation.toLocaleString("en-IN")}
                                </span>{" "}
                                full installation +{" "}
                                <span className="num">{g.combinedDemoLights.toLocaleString("en-IN")}</span> demo
                              </>
                            ) : (
                              `${g.combinedDemoLights.toLocaleString("en-IN")} demo lights across ${g.members.length} demos`
                            )}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-col gap-4 border-l-2 pl-3" style={{ borderColor: "var(--border-subtle)" }}>
                          {g.members.map((m, i) => renderCircuit(byId.get(m.id)!, i + 1))}
                        </div>
                      </div>
                    ))}
                    {solo.map((s) => renderCircuit(byId.get(s.id)!, null))}
                  </div>
                );
              })()}
              {fullLights > 0 && (
                // Said plainly, because the two numbers on this card have
                // different evidence behind them and presenting them
                // identically is what INV-02 exists to stop.
                <div className="mt-4 flex items-start gap-1.5">
                  <InfoNote label="How the two light counts differ">
                    Installed is the full installation plus the demo lights — the demo lights went in
                    first and are not part of the full installation, and together they are what your bill
                    is computed on. The lines beneath are the fittings on the metered circuit itself,
                    which is what the readings are taken from.
                  </InfoNote>
                  <p className="pt-0.5 text-xs" style={{ color: "var(--text-subtle)" }}>
                    How the installed and metered counts differ
                  </p>
                </div>
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
