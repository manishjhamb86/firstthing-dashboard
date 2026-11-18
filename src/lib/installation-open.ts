/**
 * Is an installation still open? (2026-11-18, user-caught: the founders'
 * Installations card showed 2 of the 5 running jobs.)
 *
 * "Has no completion certificate" was the only test, and on production it
 * missed two real cases:
 *   - a PARTIAL certificate (billing started on part of the lights while the
 *     rest are still going in) — Prateek Laurel, 2,000 of 2,500;
 *   - work recorded AFTER a full certificate — Princely Lift Lobby Tower D,
 *     certified at 1,300 with a day of 60 still awaiting the society.
 *
 * Deliberately NOT a test: installed < contracted on a full certificate.
 * Several finished jobs carry that gap (Aditya Mega City 512/605, Galaxy
 * North Avenue 1146/1180) because the certificate settled the count, and
 * resurfacing them would make the card a list of closed work.
 *
 * Pure, so the founders card and anything else asking the same question
 * read one answer.
 */
export type InstallationOpenReason = "not_certified" | "partial_certificate" | "work_after_certificate";

export function installationOpenReason(p: {
  certificate: { isPartial: boolean; completedAt: Date | null } | null;
  batches: { state: string; installedCount: number }[];
}): InstallationOpenReason | null {
  if (!p.certificate) return "not_certified";
  if (p.certificate.isPartial && p.certificate.completedAt === null) return "partial_certificate";
  const openWork = p.batches.some(
    (b) => b.state === "awaiting_review" || b.state === "disputed" || (b.state === "draft" && b.installedCount > 0),
  );
  return openWork ? "work_after_certificate" : null;
}
