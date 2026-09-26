import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { societyEnergy } from "@/lib/portal-energy";
import { publishedMonthsFor } from "@/lib/published-months-loader";
import { societyMeterRows } from "@/lib/meter-view";
import { SAVINGS_BAND_META } from "@/lib/circuit-load";
import { formatDate } from "@/lib/format-date";
import { Card, CardTitle, ChartPending, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { BAND_TONE, monthName } from "../portal-widgets";
import { LightCountHistory } from "../light-count-history";
import { ExclusionNote } from "@/components/exclusion-note";
import { ConsumptionChart } from "../consumption-chart";
import { KpiBubble } from "../kpi-tiles";
import { Gauge, IndianRupee, Leaf, Zap } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Electricity" };

// The society's electricity in one place — circuit-wise consumption and
// savings from the reading store, the retrofit's verified benchmark, and the
// meters watching it live. Replaces the separate Lighting and Meters tabs
// (customer-portal revamp, 2026-08-29): they were two halves of one story.
//
// Grant-gated server-side: the sidebar hiding the tab is a courtesy, this
// redirect is the boundary.
export default async function PortalElectricityPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "electricity")) redirect("/portal");
  const societyId = viewer.societyId;

  const [energy, meters, published, contracts] = await Promise.all([
    societyEnergy(societyId),
    societyMeterRows(societyId),
    // FEAT-111 — released months only (CON-33), the ₹ side of this page.
    publishedMonthsFor(societyId),
    // Every activated contract's current share — a line delivered in parts
    // (CON-24 as amended) can carry different shares per deal, and quoting
    // one part's figure as the society's would misstate the sibling's.
    db.contract.findMany({
      where: { societyId, activatedAt: { not: null } },
      select: {
        versions: {
          where: { effectiveFrom: { lte: new Date() } },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { revenueSharePct: true },
        },
      },
    }),
  ]);

  const metersOnline = meters.filter((m) => m.state === "reporting").length;
  const noData = energy.circuits.length === 0 && meters.length === 0 && published.months.length === 0;
  const billed = published.latest;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  // Year by year is a filter on this page (user's rule 2026-09-16); the
  // dashboard carries only the total to date.
  const years = [...new Set(published.months.map((m) => m.period.slice(0, 4)))];
  const year = yearParam && years.includes(yearParam) ? yearParam : null;
  const shownMonths = year ? published.months.filter((m) => m.period.startsWith(year)) : published.months;
  const shownTotals = shownMonths.reduce(
    (t, m) => ({ savedValue: t.savedValue + m.savedValue, societyKeeps: t.societyKeeps + m.societyKeeps, months: t.months + 1 }),
    { savedValue: 0, societyKeeps: 0, months: 0 },
  );

  // One sentence when every part agrees, a range when they differ — never
  // one part's figure presented as the whole society's.
  // Rounded to a whole point: a share derived from an agreed fee is a long
  // fraction, and a committee reads "24%" not "24.2055…%".
  const shares = [...new Set(contracts.map((c) => c.versions[0]?.revenueSharePct).filter((v): v is number => v != null).map((v) => Math.round(v)))].sort((a, b) => a - b);
  const shareNote =
    shares.length === 0
      ? null
      : shares.length === 1
        ? `Your society keeps ${shares[0]}% of the verified saving, per your agreement.`
        : `Your society keeps ${shares[0]}–${shares[shares.length - 1]}% of the verified saving, depending on the part of the installation, per your agreements.`;

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
          {/* Icon-bubble tiles (design canvas fidelity, 2026-09-21) — same
              four real figures the StatRow they replace carried, none
              dropped: this page has more to say than LiveMetering.dc.html's
              own simpler 2-row card, so it keeps saying all of it, just in
              the mockup's visual language. */}
          <div className="mb-6 grid gap-4 grid-cols-2 xl:grid-cols-4">
            <KpiBubble
              icon={Zap}
              tone="info"
              value={
                energy.totals.consumedKwh !== null
                  ? `${Math.round(energy.totals.consumedKwh).toLocaleString("en-IN")} kWh`
                  : "—"
              }
              label={`Consumed · ${energy.month ? monthName(energy.month).split(" ")[0] : "month"}`}
              detail="across your metered circuits"
            />
            <KpiBubble
              icon={Leaf}
              tone="ok"
              value={
                energy.totals.avoidedKwh !== null
                  ? `${Math.round(energy.totals.avoidedKwh).toLocaleString("en-IN")} kWh`
                  : "—"
              }
              label="Avoided vs before"
              detail="what the old lights would have drawn"
            />
            <KpiBubble
              icon={IndianRupee}
              tone="ok"
              value={billed ? inr(billed.savedValue) : "—"}
              label={billed ? `Saved in rupees · ${monthName(billed.period).split(" ")[0]}` : "Saved in rupees"}
              detail={billed ? `billed month · you kept ${inr(billed.societyKeeps)}` : "Appears once FirsThing publishes a billed month"}
            />
            <KpiBubble
              icon={Gauge}
              tone={meters.length > 0 && metersOnline < meters.length ? "warn" : "info"}
              value={`${metersOnline} of ${meters.length}`}
              label="Meters online"
              detail="watching your circuits"
            />
          </div>

          {/* The kWh figures above describe only the metered circuits; the ₹
              figure describes the whole society, because a metered circuit
              stands in for every light of its type (CON-11). Stated once,
              here, rather than left for the circuit table to imply — two
              adjacent numbers from different populations look like the same
              population unless something says otherwise (researched
              2026-09-11/12, applying IPMVP's disclosure principle to a
              billed-savings dashboard). Shown only when it actually differs;
              a society whose circuits represent only themselves has nothing
              to disclose here. */}
          {energy.circuits.some((c) => c.representedLightCount > c.lightCount) && (
            <p className="-mt-1 mb-5 text-[12.5px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
              The kWh figures above are what your metered circuits actually recorded. The ₹ figure is
              for your whole society — each metered circuit stands in for every light of its type, so
              its saving is scaled up to that full count before it is billed (see the circuit table
              below for each circuit&apos;s count).
            </p>
          )}

          {published.months.length > 0 && (
            <Card className="mb-5 p-6">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <CardTitle className="mb-0">Billed months{year ? ` · ${year}` : ""}</CardTitle>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {inr(shownTotals.savedValue)} saved over {shownTotals.months} month{shownTotals.months === 1 ? "" : "s"} · you kept {inr(shownTotals.societyKeeps)}
                </p>
              </div>
              {years.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2" aria-label="Filter by year">
                  {[null, ...years].map((y) => (
                    <Link
                      key={y ?? "all"}
                      href={y ? `/portal/electricity?year=${y}` : "/portal/electricity"}
                      className="rounded-full border px-3 py-1 text-xs font-semibold"
                      style={
                        y === year
                          ? { background: "var(--chrome)", borderColor: "var(--chrome)", color: "var(--chrome-text)" }
                          : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
                      }
                    >
                      {y ?? "All years"}
                    </Link>
                  ))}
                </div>
              )}
              <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                Each month as FirsThing billed it. The saving is what the old lights would have cost; FirsThing&apos;s share is your invoice, and the rest stays with you.
              </p>
              <div className="overflow-x-auto">
                <table className="tbl tbl-compact">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="text-right">Saved · kWh</th>
                      <th className="text-right">Saved · ₹</th>
                      <th className="text-right">Paid to FirsThing</th>
                      <th className="text-right">You kept</th>
                      <th>Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownMonths.map((m) => (
                      <tr key={m.period}>
                        <td className="whitespace-nowrap">{monthName(m.period)}</td>
                        <td className="num text-right">{Math.round(m.savedKwh).toLocaleString("en-IN")}</td>
                        <td className="num text-right">{inr(m.savedValue)}</td>
                        <td className="num text-right">{inr(m.paidToFirsthing)}</td>
                        <td className="num text-right">{inr(m.societyKeeps)}</td>
                        <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                          {m.basisWords}
                          {m.savingsPct !== null ? ` ${m.savingsPct.toFixed(1)}%.` : ""}
                          {m.updatedAt ? ` Updated ${formatDate(m.updatedAt)}.` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

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
                            · {c.lightCount.toLocaleString("en-IN")} metered
                            {c.representedLightCount > c.lightCount && (
                              <>
                                {" "}
                                — standing in for {c.representedLightCount.toLocaleString("en-IN")}{" "}
                                across your society
                              </>
                            )}
                          </span>
                          <LightCountHistory stages={c.lightHistory} />
                          <ExclusionNote
                            exclusion={c.exclusion}
                            before={c.baselineNow}
                            after={c.monthDailyAvg}
                            title="Why the saving leaves some lights out"
                            className="mt-2"
                          />
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
              {shareNote && (
                <p className="mt-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                  {shareNote} ₹ figures come from the released monthly calculation, never recomputed
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
