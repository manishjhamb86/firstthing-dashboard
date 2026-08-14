import type { KycDocumentType, KycRequirementStatus } from "@prisma/client";

// FEAT-024 — "currently GST document and a recent electricity bill". The
// checklist is defined here rather than seeded as rows, so a pipeline that
// predates a new requirement still shows it as outstanding instead of
// silently omitting it (a checklist that quietly shrinks is worse than one
// that grows).
export const KYC_REQUIREMENTS: { type: KycDocumentType; label: string; hint: string }[] = [
  {
    type: "gst_certificate",
    label: "GST certificate",
    hint: "The society's GST registration document.",
  },
  {
    type: "electricity_bill",
    label: "Recent electricity bill",
    hint: "A recent bill for the premises — used to confirm the connection and tariff.",
  },
];

export const KYC_TYPE_LABEL: Record<KycDocumentType, string> = {
  gst_certificate: "GST certificate",
  electricity_bill: "Recent electricity bill",
};

export const KYC_STATUS_LABEL: Record<KycRequirementStatus, string> = {
  outstanding: "Outstanding",
  received: "Received",
  verified: "Verified",
  not_applicable: "Not applicable",
};

// FEAT-029-AC-3's gate reads this: the agreement cannot be executed while a
// requirement is still genuinely outstanding. `not_applicable` counts as
// settled (FEAT-024-AC-5) precisely so it stops blocking — that is the point
// of being able to mark it.
export function kycIsSettled(status: KycRequirementStatus): boolean {
  return status === "verified" || status === "not_applicable";
}
