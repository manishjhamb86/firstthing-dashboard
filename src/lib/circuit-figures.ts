/**
 * The ONE writer of a circuit's baseline, benchmark and lifecycle state
 * (2026-09-26). It replaces the two writers that used to overwrite each other
 * (the reading recompute and the paper-demo resync).
 *
 * `Circuit.preInstallBaseline`, `benchmarkSavingsPct` and `state` stay as the
 * cached figures every other reader uses — offers, billing, the portal, the
 * deal map — and are derived here from the demos' ACCEPTED day sets.
 *
 * A circuit with no accepted demo keeps whatever figures it already holds:
 * the imported societies' agreed figures stand ("demo pending re-entry")
 * until a redone demo is accepted, so their invoices keep deriving.
 */
import type { Tx } from "@/lib/tx";
import { logger } from "@/lib/logger";
import { reconcileOfferWithDemos } from "@/lib/offer-demo-reconcile";
import { deriveCircuitFigures, demoSavingsPct, BAND_MAX_PCT, BAND_MIN_PCT } from "@/lib/circuit-demos";
import { EXCLUSION_DEVICE_SELECT, exclusionFromDevices, type Exclusion } from "@/lib/circuit-load";
import { demoCircuitState, type DemoStepFacts } from "@/lib/demo-steps";
import { changedSince, type AcceptanceDay } from "@/lib/demo-acceptance";
import { hasPostPeriod, hasPrePeriod, periodOfDay } from "@/lib/demo-periods";

type DemoForFacts = {
  id: string;
  meterInstalledAt: Date | null;
  meterSkipped: boolean;
  meterDisplayedLoad: number | null;
  loadDiscrepancyPct: number | null;
  loadValidationOverrideById: string | null;
  preFrom: Date | null;
  preTo: Date | null;
  postFrom: Date | null;
  postTo: Date | null;
  lightReplacementDate: Date | null;
  replacementOwner: { name: string | null; email: string } | null;
  gatePasses: Array<{ kind: string }>;
  scheduledEvents: Array<{ kind: string; status: string; startAt: Date }>;
  acceptances: Array<{ phase: string; version: number; days: unknown; averageKwh: number | null; countedDays: number }>;
  readings: Array<{ date: Date; kWh: number; source: string; excludedAt: Date | null; phase: string }>;
};

export const LOAD_TOLERANCE_PCT = 10;

export function latestAcceptance<T extends { phase: string; version: number }>(list: readonly T[], phase: string): T | null {
  return list.filter((a) => a.phase === phase).sort((a, b) => b.version - a.version)[0] ?? null;
}

/** The facts the step map reads for one demo. */
export function demoFacts(
  d: DemoForFacts,
  eligible: boolean,
  /** What stayed on the circuit unreplaced (exclusionOf). */
  ex?: Exclusion,
): DemoStepFacts & { preAverage: number | null; postAverage: number | null } {
  // A version with no average is a withdrawal (a review restart): the set has
  // to be measured and accepted again. (A migrated paper demo carries its
  // recorded average with no daily rows, and is in force.)
  const live = <T extends { averageKwh: number | null }>(a: T | null) => (a && a.averageKwh !== null ? a : null);
  const pre = live(latestAcceptance(d.acceptances, "pre"));
  const post = live(latestAcceptance(d.acceptances, "post"));
  const rowsIn = (phase: "pre" | "post") =>
    d.readings.filter((r) => r.phase === phase && periodOfDay(r.date, d) === phase);
  const preAverage = pre?.averageKwh ?? null;
  const postAverage = post?.averageKwh ?? null;
  const savings = demoSavingsPct(preAverage, postAverage, ex);
  const visit = d.scheduledEvents.find((e) => e.kind === "installation_day" && e.status === "scheduled") ?? null;
  return {
    eligible,
    meterInstalledAt: d.meterInstalledAt,
    loadValidated:
      d.meterInstalledAt !== null &&
      (d.loadValidationOverrideById !== null ||
        (d.loadDiscrepancyPct !== null && d.loadDiscrepancyPct <= LOAD_TOLERANCE_PCT) ||
        // An old demo re-entered without a meter has no load to test.
        (d.meterSkipped && d.meterDisplayedLoad === null)),
    hasInstallGatePass: d.gatePasses.some((g) => g.kind === "demo_install"),
    prePeriodSet: hasPrePeriod(d),
    preAccepted: pre !== null,
    preChanged: pre ? changedSince(pre.days as AcceptanceDay[], rowsIn("pre")).length > 0 : false,
    replacementOwnerName: d.replacementOwner ? (d.replacementOwner.name ?? d.replacementOwner.email) : null,
    replacementScheduledAt: visit?.startAt ?? null,
    lightReplacementDate: d.lightReplacementDate,
    hasCompletionGatePass: d.gatePasses.some((g) => g.kind === "demo_install_completion"),
    postPeriodSet: hasPostPeriod(d),
    postAccepted: post !== null,
    postChanged: post ? changedSince(post.days as AcceptanceDay[], rowsIn("post")).length > 0 : false,
    savingsPct: savings,
    inBand: savings === null ? null : savings >= BAND_MIN_PCT && savings <= BAND_MAX_PCT,
    preAverage,
    postAverage,
  };
}

export const demoFactsInclude = {
  replacementOwner: { select: { name: true, email: true } },
  gatePasses: { select: { kind: true } },
  scheduledEvents: { select: { kind: true, status: true, startAt: true } },
  acceptances: { select: { phase: true, version: true, days: true, averageKwh: true, countedDays: true } },
  readings: { select: { date: true, kWh: true, source: true, excludedAt: true, phase: true } },
} as const;

/** The device columns every figure reader needs to know the excluded load. */
export const excludedDevicesSelect = EXCLUSION_DEVICE_SELECT;

/** The demo the circuit page works on: the latest one not voided. */
export function currentDemoOf<T extends { sequence: number; voidedAt: Date | null; rejected: boolean }>(demos: readonly T[]): T | null {
  const live = demos.filter((d) => !d.voidedAt).sort((a, b) => b.sequence - a.sequence);
  return live.find((d) => !d.rejected) ?? live[0] ?? null;
}

export async function resyncCircuitFigures(tx: Tx, circuitId: string, actorId: string | null = null): Promise<void> {
  const circuit = await tx.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      state: true,
      preInstallBaseline: true,
      benchmarkSavingsPct: true,
      benchmarkOverridePct: true,
      benchmarkOverrideReason: true,
      demos: { include: demoFactsInclude },
      devices: { select: excludedDevicesSelect },
    },
  });
  if (!circuit) return;
  const ex = exclusionFromDevices(circuit.devices);
  const eligible = circuit.state !== "surveyed" && circuit.state !== "ineligible";

  const factsById = new Map(circuit.demos.map((d) => [d.id, demoFacts(d, eligible, ex)]));
  // Each demo's own figures, cached on the demo row.
  for (const d of circuit.demos) {
    const f = factsById.get(d.id)!;
    if (d.preInstallBaseline !== f.preAverage || d.postInstallAverage !== f.postAverage || d.savingsPct !== f.savingsPct) {
      await tx.circuitDemo.update({
        where: { id: d.id },
        data: { preInstallBaseline: f.preAverage, postInstallAverage: f.postAverage, savingsPct: f.savingsPct },
      });
    }
  }

  const override = circuit.benchmarkOverridePct !== null ? { pct: circuit.benchmarkOverridePct, reason: circuit.benchmarkOverrideReason ?? "" } : null;
  const figures = deriveCircuitFigures(
    circuit.demos.map((d) => ({
      id: d.id,
      sequence: d.sequence,
      rejected: d.rejected,
      voided: d.voidedAt !== null,
      combine: d.combine,
      meteredLightCount: d.meteredLightCount,
      preAverage: factsById.get(d.id)!.preAverage,
      postAverage: factsById.get(d.id)!.postAverage,
    })),
    override,
    ex,
  );
  const anyAccepted = circuit.demos.some((d) => !d.voidedAt && !d.rejected && factsById.get(d.id)!.preAverage !== null);

  const data: { preInstallBaseline?: number | null; benchmarkSavingsPct?: number | null; state?: never } & Record<string, unknown> = {};
  if (anyAccepted) {
    data.preInstallBaseline = figures.baseline;
    data.benchmarkSavingsPct = figures.benchmark.pct;
  } else if (override && circuit.benchmarkSavingsPct !== override.pct) {
    data.benchmarkSavingsPct = override.pct;
  }

  // Lifecycle state (the cache the deal map reads). Billing and retirement are
  // never undone from here; an ineligible or unsurveyed circuit stays as the
  // survey left it.
  const frozen = ["active_billing", "retired", "surveyed", "ineligible"].includes(circuit.state);
  if (!frozen) {
    const benchmark = anyAccepted ? figures.benchmark.pct : (data.benchmarkSavingsPct ?? circuit.benchmarkSavingsPct);
    const current = currentDemoOf(circuit.demos);
    const cf = current ? factsById.get(current.id)! : null;
    // A demo under way decides the state; otherwise a benchmark on record does.
    const inProgress = cf !== null && cf.meterInstalledAt !== null && !cf.postAccepted;
    let state: string;
    if (benchmark !== null && benchmark !== undefined && !inProgress) {
      state = anyAccepted && figures.benchmark.raw !== null && !figures.benchmark.inBand && override === null ? "benchmark_review" : "benchmark_confirmed";
    } else if (cf) {
      state = demoCircuitState(cf);
    } else {
      state = "eligible";
    }
    if (state !== circuit.state) (data as Record<string, unknown>).state = state;
  }

  if (Object.keys(data).length > 0) {
    await tx.circuit.update({ where: { id: circuitId }, data: data as never });
    logger.info("circuit.figures_resynced", { circuitId, actorId, ...data });
  }

  // An offer priced before the demo existed records what the demo measured.
  await reconcileOfferWithDemos(tx, circuitId, actorId);

  // An out-of-band demo raises its review; a demo back in band resolves it.
  for (const d of circuit.demos) {
    if (d.voidedAt || d.rejected) continue;
    const f = factsById.get(d.id)!;
    if (!f.postAccepted || f.savingsPct === null || f.preAverage === null || f.postAverage === null) continue;
    const open = await tx.demoResultReview.findFirst({ where: { demoId: d.id, state: "open" } });
    if (f.inBand === false && override === null && !open) {
      const prior = await tx.demoResultReview.count({ where: { demoId: d.id } });
      await tx.demoResultReview.create({
        data: {
          circuitId,
          demoId: d.id,
          occurrence: prior + 1,
          measuredSavingsPct: f.savingsPct,
          preInstallBaseline: f.preAverage,
          postInstallAverage: f.postAverage,
        },
      });
      logger.warn("demo.result_out_of_band", { circuitId, demoId: d.id, savingsPct: f.savingsPct });
    } else if (open && (f.inBand || override !== null)) {
      await tx.demoResultReview.update({
        where: { id: open.id },
        data: { state: "resolved", resolvedAt: new Date(), resolvedById: actorId, resolutionNote: "The accepted result is now inside the band." },
      });
    }
  }
}
