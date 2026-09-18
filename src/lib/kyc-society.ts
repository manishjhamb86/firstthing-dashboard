import type { KycDocumentType, KycRequirementStatus } from "@prisma/client";
import { KYC_REQUIREMENTS } from "./kyc";

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

/**
 * The facts a deal can move forward on WITHOUT the document (user's call
 * 2026-09-15: "if available but not provided we can simply add the GST number
 * and move forward… for electricity the same, user can simply add the unit
 * price and move on"). Stored on the society; the document stays wanted.
 */
export type KycFacts = { gstNumber: string | null; electricityUnitRate: number | null };

export function kycFactFor(type: KycDocumentType, facts: KycFacts): boolean {
  if (type === "gst_certificate") return !!facts.gstNumber?.trim();
  return facts.electricityUnitRate != null && facts.electricityUnitRate > 0;
}

/**
 * How a document type stands for the society:
 *   verified        — the document is on file and checked
 *   not_applicable  — deliberately waived, with a reason
 *   fact_only       — the number is recorded, the document is still wanted
 *   received        — a file arrived, nobody has verified it
 *   outstanding     — nothing at all
 * The first three settle GATE-01; the last two do not.
 */
export type KycState = "verified" | "not_applicable" | "fact_only" | "received" | "outstanding";

export function kycStateOf(type: KycDocumentType, best: Map<KycDocumentType, BestKyc<KycRow>>, facts: KycFacts): KycState {
  const status = best.get(type)?.record.status;
  if (status === "verified" || status === "not_applicable") return status;
  if (kycFactFor(type, facts)) return "fact_only";
  return status === "received" ? "received" : "outstanding";
}

export function kycStateSettles(state: KycState): boolean {
  return state === "verified" || state === "not_applicable" || state === "fact_only";
}

const NO_FACTS: KycFacts = { gstNumber: null, electricityUnitRate: null };

/**
 * The counts the deal spine and GATE-01 read. `total` is always the FULL
 * fixed checklist (`KYC_REQUIREMENTS.length`), never just the types that
 * happen to have something recorded — a requirement with literally nothing
 * against it (no file, no fact, no waiver) still has to count, or it
 * silently drops out of "resolved >= total" the moment a SIBLING type gets
 * touched, and the gate reads as settled while that type has had nothing
 * done to it.
 *
 * Found 2026-09-18 (user-reported): recording only the GST number made the
 * deal spine and the agreement page both show KYC as done and offer
 * "Execute the agreement", while `prepareAgreement`'s own refusal — driven
 * by `kycMissing`, which has never had this shortcut — correctly still
 * named the untouched electricity bill as outstanding. Two functions
 * answering "is KYC done?" differently is exactly the class of bug this
 * codebase has hit and fixed repeatedly elsewhere (the deal-progress map,
 * the FEAT-020 report gate); `kycDone` must always agree with
 * `kycMissing().length === 0`.
 */
export function kycCounts(best: Map<KycDocumentType, BestKyc<KycRow>>, facts: KycFacts = NO_FACTS): { total: number; resolved: number } {
  let resolved = 0;
  for (const req of KYC_REQUIREMENTS) {
    if (kycStateSettles(kycStateOf(req.type, best, facts))) resolved += 1;
  }
  return { total: KYC_REQUIREMENTS.length, resolved };
}

/** Whether ANYTHING has been recorded against any requirement yet — a file, a fact, a waiver. Purely for phrasing ("not started yet" vs "N of M resolved"); the gate itself (kycCounts) always counts the full fixed checklist regardless. */
export function kycStarted(best: Map<KycDocumentType, BestKyc<KycRow>>, facts: KycFacts = NO_FACTS): boolean {
  return KYC_REQUIREMENTS.some((req) => best.has(req.type) || kycFactFor(req.type, facts));
}

/** The document types still genuinely outstanding for the society, in checklist order. */
export function kycMissing(best: Map<KycDocumentType, BestKyc<KycRow>>, facts: KycFacts = NO_FACTS): KycDocumentType[] {
  return KYC_REQUIREMENTS.filter((req) => !kycStateSettles(kycStateOf(req.type, best, facts))).map((r) => r.type);
}

/**
 * The documents the society page should chase: the fact is on record (so the
 * document is applicable and wanted) but no verified or even received file
 * exists anywhere across its deals.
 */
export function kycDocumentsWanted(best: Map<KycDocumentType, BestKyc<KycRow>>, facts: KycFacts): KycDocumentType[] {
  return KYC_REQUIREMENTS.filter((req) => kycStateOf(req.type, best, facts) === "fact_only").map((r) => r.type);
}
