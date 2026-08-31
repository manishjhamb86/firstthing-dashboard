import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { societyEnergy } from "@/lib/portal-energy";
import { societyMeterRows } from "@/lib/meter-view";
import { SAVINGS_BAND_META } from "@/lib/circuit-load";
import {
  Card,
  CardTitle,
  ChartPending,
  EmptyState,
  PageHeader,
  Stat,
  StatPending,
  StatRow,
  StatusChip,
} from "@/components/ui";
import { BAND_TONE, monthName } from "../portal-widgets";
import { ConsumptionChart } from "../consumption-chart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Electricity" };

// The society's electricity in one place — circuit-wise consumption and
// savings from the reading store, the retrofit's verified benchmark, and the
// meters watching it live. Replaces the separate Lighting and Meters tabs
// (customer-portal revamp, 2026-08-29): they were two halves of one story.
//
// Grant-gated server-side: the sidebar hiding the tab is a courtesy, this
// redirect is the boundary.
export default async function PortalElectricityPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "electricity")) redirect("/portal");
  const societyId = viewer.societyId;

  const [energy, meters, contract] = await Promise.all([
    societyEnergy(societyId),
    societyMeterRows(societyId),
    db.contractTermVersion.findFirst({
      where: { contract: { societyId, activatedAt: { not: null } }, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
      select: { revenueSharePct: true },
    }),
  ]);

  const metersOnline = meters.filter((m) => m.state === "reporting").length;
  const noData = energy.circuits.length === 0 && meters.length === 0;

  return (
    <>
      <PageHeader
        title="Electricity"
        subtitle={
          energy.month
            ? `Consumption & savings · figures for ${monthName(energy.month)}`
            : "Consumption & savings"
        }
        chip={
          energy.totals.band ? (
            <StatusChip tone={BAND_TONE[energy.totals.band]}>
              {SAVINGS_BAND_META[energy.totals.band].label}
            </StatusChip>
          ) : undefined
        }
      />

      {noData ? (
        <EmptyState title="No electricity work on record yet">
          Once FirsThing commissions a circuit and readings start arriving, consumption and savings
          appear here.
        </EmptyState>
      ) : (
        <>
          <StatRow>
            {energy.totals.consumedKwh !== null ? (
              <Stat
                label={`Consumed · ${energy.month ? monthName(energy.month).split(" ")[0] : "month"}`}
                value={`${Math.round(energy.totals.consumedKwh).toLocaleString("en-IN")} kWh`}
                detail="across your metered circuits"
              />
            ) : (
              <StatPending label="Consumed" detail="Once monthly readings arrive" />
            )}
            {energy.totals.avoidedKwh !== null ? (
              <Stat
                label="Avoided vs before"
                value={`${Math.round(energy.totals.avoidedKwh).toLocaleString("en-IN")} kWh`}
                tone="ok"
                detail="what the old lights would have drawn"
              />
            ) : (
              <StatPending label="Avoided vs before" detail="Once monthly readings arrive" />
            )}
            {energy.rupeesSaved !== null ? (
              <Stat
                label="Saved in rupees"
                value={`₹${Math.round(energy.rupeesSaved).toLocaleString("en-IN")}`}
                tone="ok"
                detail="from the released monthly calculation"
              />
            ) : (
              <StatPending label="Saved in rupees" detail="Appears once the month is billed" />
            )}
            <Stat
              label="Meters online"
              value={`${metersOnline} of ${meters.length}`}
              tone={meters.length > 0 && metersOnline < meters.length ? "warn" : undefined}
              detail="watching your circuits"
            />
          </StatRow>

          {energy.daily.length > 0 && (
            <Card className="mb-5 p-6">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <CardTitle className="mb-0">Consumption</CardTitle>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  all circuits
                </p>
              </div>
              <ConsumptionChart days={energy.daily} height={180} />
            </Card>
          )}

          {energy.circuits.length > 0 && (
            <Card className="mb-5 p-6">
              <CardTitle>Circuit-wise{energy.month ? ` · ${monthName(energy.month)}` : ""}</CardTitle>
              <div className="print-table-scroll">
                <table className="tbl w-full">
                  <thead>
                    <tr>
                      <th>Circuit</th>
                      <th className="text-right">kWh/day</th>
                      <th className="text-right">Month</th>
                      <th className="text-right">Savings</th>
                      <th>Against your agreement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {energy.circuits.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.label}</strong>{" "}
                          <span style={{ color: "var(--text-subtle)" }}>
                            · {c.lightCount.toLocaleString("en-IN")} lights
                          </span>
                        </td>
                        <td className="num text-right">
                          {c.monthDailyAvg !== null ? c.monthDailyAvg.toFixed(1) : "—"}
                        </td>
                        <td className="num text-right">
                          {c.monthKwh !== null
                            ? `${Math.round(c.monthKwh).toLocaleString("en-IN")} kWh`
                            : "—"}
                        </td>
                        <td className="text-right">
                          {c.savingsPct !== null ? (
                            <span
                              className="num inline-block rounded-[var(--r-sm)] px-2 py-0.5 font-bold"
                              style={{
                                background: c.band ? SAVINGS_BAND_META[c.band].bg : undefined,
                              }}
                            >
                              {c.savingsPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="num">—</span>
                          )}
                        </td>
                        <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                          {c.benchmarkPct !== null
                            ? `benchmark ${c.benchmarkPct.toFixed(1)}%`
                            : "benchmark not agreed yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {contract && (
                <p className="mt-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                  Your society keeps {contract.revenueSharePct}% of the verified saving, per your
                  agreement. ₹ figures come from the released monthly calculation, never recomputed
                  here.
                </p>
              )}
            </Card>
          )}

          {meters.length > 0 ? (
            <Card className="mb-5 p-6">
              <CardTitle>Your meters</CardTitle>
              <div className="flex flex-col gap-3">
                {meters.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--r-sm)] border px-3.5 py-3"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold">{m.name}</p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                        {m.circuitLabel ?? "your society"} · {m.productModel} · read {m.readAge}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <span className="text-right">
                        <span className="lbl" style={{ display: "inline" }}>Power now</span>{" "}
                        <span className="num text-[15px] font-bold">
                          {m.powerW !== null ? `${Math.round(m.powerW).toLocaleString("en-IN")} W` : "—"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="lbl" style={{ display: "inline" }}>Today</span>{" "}
                        <span className="num text-[15px] font-bold">
                          {m.dayKwh !== null ? `${m.dayKwh.toFixed(1)} kWh` : "—"}
                        </span>
                      </span>
                      {m.state === "reporting" ? (
                        <StatusChip tone="ok">Reporting</StatusChip>
                      ) : m.state === "silent" ? (
                        <StatusChip tone="warn">Not reporting</StatusChip>
                      ) : m.state === "offline" ? (
                        <StatusChip tone="bad">Offline</StatusChip>
                      ) : null}
                      <Link href={`/portal/meters/${m.id}`} className="text-[13px] font-semibold">
                        Detail →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="mb-5 p-6">
              <CardTitle>Meters</CardTitle>
              <ChartPending
                title="Live meter readings appear here"
                note="once a smart meter is installed on your circuits"
                height={120}
              />
            </Card>
          )}
        </>
      )}
    </>
  );
}
