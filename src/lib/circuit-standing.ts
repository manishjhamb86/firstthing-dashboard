/**
 * Whether a circuit's own DEAL is still live (2026-10-21, user-caught: AIPL's
 * circuit was never voided when its deal closed, so everything reading it —
 * the meters list, the notification centre — kept treating it as ordinary,
 * live work). A circuit is never voided just because the deal on it closes
 * (deal-close.ts touches the pipeline and the contract, never the circuit),
 * so "still exists" (voidedAt null) and "still live" are genuinely different
 * questions — this answers the second one.
 *
 * Pure: takes exactly the fields a caller's own Prisma `select` already
 * carries, so meter-view.ts and notifications.ts can share one answer
 * without importing each other or touching `db` here.
 */
export type CircuitStandingInput = {
  voidedAt: Date | string | null;
  siteSurvey: { pipeline: { closedLostStage: string | null; contract: { status: string } | null } | null } | null;
};

export function isCircuitInactive(circuit: CircuitStandingInput | null | undefined): boolean {
  if (!circuit) return false;
  return Boolean(
    circuit.voidedAt ||
      circuit.siteSurvey?.pipeline?.closedLostStage ||
      circuit.siteSurvey?.pipeline?.contract?.status === "terminated",
  );
}
