/**
 * An offer priced before its demo existed catches up once the demo is done
 * (2026-09-26, user-asked). Every imported society's offer was entered from
 * its signed agreement with the benchmark marked "negotiated" — there was no
 * demo in the system to measure it. When a demo is later run here and what it
 * measured matches the agreed percentage to rounding (within half a point),
 * the offer says so: its benchmark source becomes "measured", and its circuit
 * table carries the demo's figures beside the agreed ones.
 *
 * Nothing that was priced moves: the agreed percentage, the fee, the terms and
 * the lights all stay as signed. Only the evidence behind the agreed figure is
 * recorded. If a later demo stops matching, the offer goes back to
 * "negotiated". Offers whose benchmark was measured from the start are never
 * touched. Every change is change-logged with the old value.
 */
import type { Tx } from "@/lib/tx";
import { logger } from "@/lib/logger";
import { logChange } from "@/lib/change-log";
import { deriveCircuitFigures } from "@/lib/circuit-demos";
import type { OfferCircuitTerm } from "@/lib/offer";

/** "Matches to rounded figures": the two agree within half a percentage point. */
export const DEMO_MATCH_TOLERANCE_PCT = 0.5;

export type ReconciledTerm = OfferCircuitTerm & { reconciledFromDemo?: boolean };

export function demoMatchesAgreed(measured: number | null, agreed: number): boolean {
  return measured !== null && Math.abs(measured - agreed) <= DEMO_MATCH_TOLERANCE_PCT;
}

export async function reconcileOfferWithDemos(tx: Tx, circuitId: string, actorId: string | null): Promise<void> {
  const c = await tx.circuit.findUnique({ where: { id: circuitId }, select: { siteSurvey: { select: { pipelineId: true } } } });
  const pipelineId = c?.siteSurvey?.pipelineId;
  if (!pipelineId) return;
  const offer = await tx.offer.findFirst({
    where: { pipelineId, status: { in: ["issued", "accepted"] } },
    orderBy: { version: "desc" },
    select: { id: true, benchmarkSource: true, circuitTerms: true },
  });
  if (!offer) return;
  const terms = (offer.circuitTerms as ReconciledTerm[] | null) ?? [];
  if (terms.length === 0) return;
  const wasReconciled = terms.some((t) => t.reconciledFromDemo);
  // Only an offer that was negotiated, or that this step already reconciled.
  if (offer.benchmarkSource !== "negotiated_fixed" && !wasReconciled) return;

  const circuits = await tx.circuit.findMany({
    where: { id: { in: terms.map((t) => t.circuitId) } },
    select: {
      id: true,
      demos: {
        where: { voidedAt: null },
        select: { id: true, sequence: true, rejected: true, combine: true, meteredLightCount: true, preInstallBaseline: true, postInstallAverage: true },
      },
    },
  });
  const measuredOf = new Map(
    circuits.map((ci) => {
      const f = deriveCircuitFigures(
        ci.demos.map((d) => ({
          id: d.id,
          sequence: d.sequence,
          rejected: d.rejected,
          voided: false,
          combine: d.combine,
          meteredLightCount: d.meteredLightCount,
          preAverage: d.preInstallBaseline,
          postAverage: d.postInstallAverage,
        })),
        null,
      );
      return [ci.id, { pct: f.benchmark.raw, baseline: f.baseline, lights: f.meteredLightCount }] as const;
    }),
  );

  let allMatch = true;
  const next: ReconciledTerm[] = terms.map((t) => {
    const m = measuredOf.get(t.circuitId);
    const measured = m?.pct ?? null;
    const matches = demoMatchesAgreed(measured, t.benchmarkSavingsPct);
    if (!matches) allMatch = false;
    if (measured === null) return t;
    const out: ReconciledTerm = { ...t, demoBenchmarkSavingsPct: measured, reconciledFromDemo: true };
    // The agreed population's pre-install draw, from the demo's baseline per
    // light — only where the offer had none of its own, or it came from here.
    if (m && m.baseline !== null && m.lights && (t.preInstallKwhPerDay == null || t.preInstallBasis === "demo")) {
      out.preInstallKwhPerDay = (m.baseline / m.lights) * t.representedLightCount;
      out.preInstallBasis = "demo";
    }
    return out;
  });
  const source = allMatch ? "measured" : "negotiated_fixed";
  const changed = source !== offer.benchmarkSource || JSON.stringify(next) !== JSON.stringify(terms);
  if (!changed) return;

  await tx.offer.update({ where: { id: offer.id }, data: { benchmarkSource: source, circuitTerms: next as never } });
  await logChange(tx, {
    entity: "offer",
    entityId: offer.id,
    kind: "edit",
    field: "demo_reconciled",
    circuitId,
    oldValue: { benchmarkSource: offer.benchmarkSource, terms: terms.map((t) => ({ circuitId: t.circuitId, demoPct: t.demoBenchmarkSavingsPct ?? null })) },
    newValue: { benchmarkSource: source, terms: next.map((t) => ({ circuitId: t.circuitId, demoPct: t.demoBenchmarkSavingsPct ?? null })) },
    reason: allMatch ? "The demo measured the agreed figure (to rounding)." : "The demo differs from the agreed figure; the agreed figure stands.",
    actorId,
  });
  logger.info("offer.demo_reconciled", { offerId: offer.id, circuitId, benchmarkSource: source });
}
