import { db } from "@/lib/db";
import { monitoringStart } from "@/lib/monitoring";
import { societyStanding, type Standing } from "@/lib/society-list";

export type SocietyStandingFacts = {
  billingStart: string | null;
  signedOn: string | null;
  standing: Standing;
  paying: boolean;
};

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const earliest = (ds: (string | null)[]) => ds.filter((d): d is string => d !== null).sort()[0] ?? null;

/**
 * Every society's commercial standing, read once (2026-09-26): when billing
 * started (the completion certificate's billing start, else the contract's
 * term start — the rule invoices bill from — over contracts that have run),
 * when an agreement was signed, and whether any bill payment has been
 * recorded. The societies list and the Portfolio both count from this, so
 * "active" and "paying" mean the same thing on both.
 */
export async function loadSocietyStandings(): Promise<Map<string, SocietyStandingFacts>> {
  const today = new Date().toISOString().slice(0, 10);
  const [societies, paid] = await Promise.all([
    db.society.findMany({
      select: {
        id: true,
        status: true,
        contracts: {
          where: { status: { in: ["active", "terminated"] } },
          select: {
            termStart: true,
            pipeline: { select: { installationProject: { select: { certificate: { select: { billingStartDate: true } } } } } },
          },
        },
        pipelines: { select: { agreement: { select: { signedAt: true } } } },
      },
    }),
    // A payment counts when it is against a live bill and actually settles
    // something — money received, or tax deducted at source.
    db.payment.findMany({
      where: { invoice: { voidedAt: null }, OR: [{ amount: { gt: 0 } }, { tdsAmount: { gt: 0 } }] },
      select: { invoice: { select: { calculation: { select: { societyId: true } } } } },
    }),
  ]);
  const paying = new Set(paid.map((p) => p.invoice.calculation.societyId));
  return new Map(
    societies.map((s) => {
      const billingStart = earliest(
        s.contracts.map((c) =>
          day(
            monitoringStart({
              certificateBillingStart: c.pipeline?.installationProject?.certificate?.billingStartDate ?? null,
              contractTermStart: c.termStart,
            }),
          ),
        ),
      );
      const standing = societyStanding({ status: s.status, billingStart, today });
      return [
        s.id,
        {
          billingStart,
          signedOn: earliest(s.pipelines.map((p) => day(p.agreement?.signedAt))),
          standing,
          paying: paying.has(s.id),
        },
      ];
    }),
  );
}
