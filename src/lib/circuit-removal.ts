import "server-only";
import { db } from "@/lib/db";
import { decideVoidCircuit, describeVoidBlock, type CircuitProgressFacts } from "@/lib/circuit-void";

export type CircuitRemoval = {
  canRemove: boolean;
  /** Why the screen isn't offering it, in terms of the circuit itself. */
  blockLabel: string | null;
};

/**
 * Resolve, for a set of circuits at once, whether this viewer may remove each.
 *
 * Batched deliberately: the per-circuit facts need a `_count` and a released
 * fee-line count, and doing that one circuit at a time turns a registry page
 * into 2N queries. Two queries total regardless of list length.
 *
 * The screen uses this only to decide what to *offer* — `voidCircuit` re-runs
 * the same decision server-side against freshly read rows, since a rendered
 * page is a snapshot and the button is not the gate.
 */
export async function resolveCircuitRemoval(
  circuitIds: string[],
  actor: { id: string; isOps: boolean },
): Promise<Map<string, CircuitRemoval>> {
  const out = new Map<string, CircuitRemoval>();
  if (circuitIds.length === 0) return out;

  const [circuits, releasedLines] = await Promise.all([
    db.circuit.findMany({
      where: { id: { in: circuitIds } },
      select: {
        id: true,
        createdById: true,
        voidedAt: true,
        meterInstalledAt: true,
        preInstallBaseline: true,
        benchmarkSavingsPct: true,
        _count: {
          select: {
            gatePasses: true,
            commissioningReadings: true,
            meterReadings: true,
            rescaleEvents: true,
            feeLines: true,
          },
        },
      },
    }),
    db.circuitFeeLine.groupBy({
      by: ["circuitId"],
      where: { circuitId: { in: circuitIds }, calculation: { releasedAt: { not: null } } },
      _count: { _all: true },
    }),
  ]);

  const releasedByCircuit = new Map(releasedLines.map((r) => [r.circuitId, r._count._all]));

  for (const c of circuits) {
    const facts: CircuitProgressFacts = {
      meterInstalledAt: c.meterInstalledAt,
      preInstallBaseline: c.preInstallBaseline,
      benchmarkSavingsPct: c.benchmarkSavingsPct,
      gatePassCount: c._count.gatePasses,
      commissioningReadingCount: c._count.commissioningReadings,
      meterReadingCount: c._count.meterReadings,
      rescaleEventCount: c._count.rescaleEvents,
      feeLineCount: c._count.feeLines,
      releasedFeeLineCount: releasedByCircuit.get(c.id) ?? 0,
    };

    // A non-empty reason is passed so the preview reflects the authority
    // rules rather than the fact that nobody has typed a reason yet — the
    // form collects that at the point of the actual act.
    const decision = decideVoidCircuit({
      actor,
      createdById: c.createdById,
      alreadyVoided: !!c.voidedAt,
      reason: "preview",
      facts,
    });

    out.set(c.id, {
      canRemove: decision.allowed,
      blockLabel: decision.allowed ? null : describeVoidBlock(facts),
    });
  }

  return out;
}
