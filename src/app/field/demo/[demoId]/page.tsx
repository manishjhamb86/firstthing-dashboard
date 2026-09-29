import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/ui";
import { circuitLabelOf } from "@/lib/circuit-label";
import { expectedDisplayedLoadW } from "@/lib/circuit-load";
import { LOAD_TOLERANCE_PCT } from "@/lib/circuit-figures";
import { demoLockState } from "@/lib/demo-lock";
import { sharedInReport } from "@/lib/demo-step-core";
import { isDemoMode } from "@/lib/demo-mode";
import { formatDate, formatDateTime, isoDate } from "@/lib/format-date";
import { istWallClock } from "@/lib/field-today";
import { requireFieldPage } from "../../access";
import { DemoStepsForm } from "./demo-steps-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo on site" };

/**
 * A demo's on-site steps, on the phone (docs/engineering/19-field-app.md §8
 * step 6): the meter install with its load test, and the light replacement.
 * Both are saved on the phone and applied by the back office's own step code
 * (src/lib/demo-step-core.ts) when they reach the office. Gate passes stay
 * online-only by design, and readings come from the meter, not the phone.
 */
export default async function FieldDemoPage({ params }: { params: Promise<{ demoId: string }> }) {
  await requireFieldPage();
  const { demoId } = await params;
  const demo = await db.circuitDemo.findUnique({
    where: { id: demoId },
    include: {
      meter: { select: { name: true } },
      replacementOwner: { select: { name: true, email: true } },
      scheduledEvents: {
        where: { kind: "installation_day", status: "scheduled" },
        orderBy: { startAt: "asc" },
        take: 1,
        select: { startAt: true, contactName: true, contactPhone: true },
      },
      circuit: {
        select: {
          id: true,
          location: true,
          lightType: true,
          wattage: true,
          voidedAt: true,
          society: { select: { name: true, location: true } },
          siteSurvey: { select: { pipelineId: true } },
          devices: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              count: true,
              wattage: true,
              replacementTypeId: true,
              replacementCount: true,
              replacementWattage: true,
              excludedFromCalculation: true,
              deviceType: {
                select: {
                  name: true,
                  replacementOptions: { select: { replacement: { select: { id: true, name: true, defaultWattage: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!demo || demo.voidedAt || demo.circuit.voidedAt) notFound();

  const [meters, shared, demoMode] = await Promise.all([
    db.meterDevice.findMany({
      where: { hasEnergySignal: true, removedFromAccountAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    sharedInReport(demo.id, demo.circuit.siteSurvey?.pipelineId),
    isDemoMode(),
  ]);
  const lock = demoLockState({ sharedInReport: shared, unlockedUntil: demo.unlockedUntil, demoMode, now: new Date() });
  const expected = expectedDisplayedLoadW({
    meteredLightCount: demo.meteredLightCount,
    wattage: demo.circuit.wattage,
    devices: demo.circuit.devices.map((d) => ({ count: d.count, wattage: d.wattage })),
  }).watts;
  const visit = demo.scheduledEvents[0] ?? null;
  const today = isoDate(istWallClock(new Date()));
  const label = circuitLabelOf(demo.circuit.location, demo.circuit.lightType);

  return (
    <>
      <header className="mb-4">
        <p className="text-[var(--text-muted)]">
          {demo.circuit.society.name} · {demo.circuit.society.location}
        </p>
        <h1 className="text-[24px] font-bold leading-tight">
          Demo {demo.sequence} · {label}
        </h1>
        <p className="text-[var(--text-muted)]">{demo.meteredLightCount} lights on this demo</p>
      </header>

      {!lock.editable && (
        <p className="card p-3 mb-4" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)", borderColor: "var(--warn-line)" }}>
          This demo&apos;s report has been shared with the society, so it is locked. A correction needs operations to unlock it in the back office.
        </p>
      )}

      <section className="card p-4 mb-4 space-y-1">
        <p className="lbl">Replacement day</p>
        {visit ? (
          <p className="font-semibold num">{formatDateTime(visit.startAt)}</p>
        ) : (
          <p style={{ color: "var(--warn-fg)" }}>Not booked yet — the office books it before the replacement can be recorded.</p>
        )}
        <p className="text-[var(--text-muted)]">
          Crew: {demo.replacementOwner ? (demo.replacementOwner.name ?? demo.replacementOwner.email) : "nobody assigned yet"}
          {visit?.contactName ? ` · ask for ${visit.contactName}` : ""}
        </p>
        {visit?.contactPhone && (
          <a href={`tel:${visit.contactPhone}`} className="btn-secondary mt-2 inline-flex items-center justify-center min-h-[48px] w-full">
            Call {visit.contactName ?? visit.contactPhone}
          </a>
        )}
      </section>

      <section className="card p-4 mb-4 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="lbl">On record at the office</p>
        </div>
        <p>
          Meter:{" "}
          {demo.meterInstalledAt ? (
            <>
              <span className="font-semibold">{demo.meter?.name ?? "no meter (paper demo)"}</span> · in on {formatDate(demo.meterInstalledAt)}
              {demo.loadDiscrepancyPct !== null && (
                <>
                  {" "}
                  <StatusChip tone={demo.loadDiscrepancyPct <= LOAD_TOLERANCE_PCT ? "ok" : "warn"}>
                    load {demo.loadDiscrepancyPct.toFixed(1)}% off
                  </StatusChip>
                </>
              )}
            </>
          ) : (
            <span className="text-[var(--text-muted)]">not recorded yet</span>
          )}
        </p>
        <p>
          Replacement:{" "}
          {demo.lightReplacementDate ? (
            <span className="font-semibold">{formatDate(demo.lightReplacementDate)}</span>
          ) : (
            <span className="text-[var(--text-muted)]">not recorded yet</span>
          )}
        </p>
      </section>

      <DemoStepsForm
        demoId={demo.id}
        label={`Demo ${demo.sequence} · ${label} · ${demo.circuit.society.name}`}
        editable={lock.editable}
        today={today}
        tolerancePct={LOAD_TOLERANCE_PCT}
        expectedWatts={expected}
        meters={meters}
        recorded={{
          meterId: demo.meterId,
          meterInstalledOn: demo.meterInstalledAt ? isoDate(demo.meterInstalledAt) : null,
          displayedLoad: demo.meterDisplayedLoad,
          replacedOn: demo.lightReplacementDate ? isoDate(demo.lightReplacementDate) : null,
        }}
        replacementReady={{ assigned: demo.replacementOwnerId !== null, booked: visit !== null }}
        lines={demo.circuit.devices.map((d) => ({
          id: d.id,
          name: d.deviceType.name,
          count: d.count,
          options: d.deviceType.replacementOptions.map((o) => ({
            id: o.replacement.id,
            name: o.replacement.name,
            wattage: o.replacement.defaultWattage,
          })),
          current: {
            replacementTypeId: d.replacementTypeId,
            count: d.replacementCount,
            wattage: d.replacementWattage,
            exclude: d.excludedFromCalculation,
          },
        }))}
      />
    </>
  );
}
