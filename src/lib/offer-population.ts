import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import type { OfferCircuitTerm } from "@/lib/offer";

/**
 * Apply an accepted offer's light counts forward to the circuits it priced.
 *
 * The worksheet's "lights to install as per the agreement" is the population
 * every monthly figure extrapolates to (CON-11). If the circuit record kept a
 * different count after the society accepted, the bill and the stats would be
 * computed on a number the agreement does not say — the offer would be
 * decorative. So acceptance is the moment the agreed count becomes the
 * record's count, as a RepresentedCountChange (the same audit row an invoice's
 * count correction writes — a population correction, deliberately NOT an
 * INV-07 rescale, which is about the metered baseline).
 *
 * Runs inside the caller's transaction. `recordedById` must be an AdminUser:
 * on the portal path that is the admin who issued the offer, since the
 * society's own account cannot own an admin audit row (INV-01).
 */
export async function applyOfferPopulation(
  tx: Prisma.TransactionClient,
  offer: { id: string; version: number; circuitTerms: unknown },
  recordedById: string,
  effectiveFrom: string,
  via: "back_office" | "portal",
): Promise<number> {
  const terms = (offer.circuitTerms as OfferCircuitTerm[] | null) ?? [];
  let applied = 0;
  for (const t of terms) {
    const circuit = await tx.circuit.findUnique({
      where: { id: t.circuitId },
      select: { id: true, representedLightCount: true, voidedAt: true },
    });
    if (!circuit || circuit.voidedAt || circuit.representedLightCount === t.representedLightCount) continue;
    await tx.circuit.update({ where: { id: circuit.id }, data: { representedLightCount: t.representedLightCount } });
    await tx.representedCountChange.create({
      data: {
        circuitId: circuit.id,
        previousCount: circuit.representedLightCount,
        nextCount: t.representedLightCount,
        effectiveFrom,
        reason: `Agreed on offer v${offer.version}, accepted ${via === "portal" ? "by the society in its portal" : "as relayed to the back office"}.`,
        recordedById,
      },
    });
    logger.info("circuit.represented_count_applied_from_offer", {
      circuitId: circuit.id,
      offerId: offer.id,
      previous: circuit.representedLightCount,
      next: t.representedLightCount,
      via,
    });
    applied += 1;
  }
  return applied;
}
