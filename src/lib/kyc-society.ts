import type { KycDocumentType, KycRequirementStatus } from "@prisma/client";
import { KYC_REQUIREMENTS, kycIsSettled } from "./kyc";

/**
 * KYC is a SOCIETY fact, not a deal fact (user-specified 2026-09-15: "it's
 * common for all the circuits").
 *
 * The rows are stored per pipeline (FEAT-024 was built when a society had one
 * deal — CON-24 before its amendment), and a second deal for the same society
 * was asking for the GST certificate and electricity bill it had already
 * received on the first. A society registers for GST once. So every gate and
 * screen that asks "is KYC settled?" now asks it across ALL the society's
 * deals, and takes the best answer per document type — a certificate verified
 * on the basement deal covers the lift-lobby deal too.
 *
 * Pure: the ranking is tested; the loader beside it only fetches.
 */
export type KycRow = {
  pipelineId: string;
  type: KycDocumentType;
  status: KycRequirementStatus;
  updatedAt: Date;
};

const RANK: Record<KycRequirementStatus, number> = { verified: 3, not_applicable: 2, received: 1, outstanding: 0 };

export type BestKyc<R extends KycRow> = {
  type: KycDocumentType;
  record: R;
  /** True when the best record belongs to the deal being looked at, not a sibling. */
  own: boolean;
};

/**
 * The best record per document type across a society's deals. A deal's OWN
 * row wins a tie, so a screen keeps showing what was recorded there when it
 * is just as good as a sibling's.
 */
export function bestKycAcross<R extends KycRow>(rows: R[], ownPipelineId: string): Map<KycDocumentType, BestKyc<R>> {
  const out = new Map<KycDocumentType, BestKyc<R>>();
  for (const r of rows) {
    const cur = out.get(r.type);
    const own = r.pipelineId === ownPipelineId;
    const better =
      !cur ||
      RANK[r.status] > RANK[cur.record.status] ||
      (RANK[r.status] === RANK[cur.record.status] && ((own && !cur.own) || (own === cur.own && r.updatedAt > cur.record.updatedAt)));
    if (better) out.set(r.type, { type: r.type, record: r, own });
  }
  return out;
}

/** The counts the deal spine and GATE-01 read: how many types have a row anywhere, and how many of those are settled. */
export function kycCounts(best: Map<KycDocumentType, BestKyc<KycRow>>): { total: number; resolved: number } {
  let total = 0;
  let resolved = 0;
  for (const req of KYC_REQUIREMENTS) {
    const b = best.get(req.type);
    if (!b) continue;
    total += 1;
    if (kycIsSettled(b.record.status)) resolved += 1;
  }
  return { total, resolved };
}

/** The document types still genuinely outstanding for the society, in checklist order. */
export function kycMissing(best: Map<KycDocumentType, BestKyc<KycRow>>): KycDocumentType[] {
  return KYC_REQUIREMENTS.filter((req) => {
    const b = best.get(req.type);
    return !b || !kycIsSettled(b.record.status);
  }).map((r) => r.type);
}
