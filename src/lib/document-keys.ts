// S3 key convention, decided 2026-08-05 and carried forward unchanged from
// archive/src/lib/document-keys.ts — see PROJECT_CONTEXT.md:
// Documents/{Society}/{YYYY-MM}/{DocTypeFolder}/{Society}_{DocTypeLabel}_{dateLabel}[_{identifier}].{ext}
//
// The archived list defined 8 types; only the ones MS-05 actually uploads
// are carried over, same "grow it with the milestone that needs it" rule the
// schema follows. The rest come back when their feature does.
export type DocType =
  | "kycGstCertificate"
  | "kycElectricityBill"
  | "agreement"
  // MS-06 — daily installation batch evidence (FEAT-034-AC-3) and the
  // society's dispute evidence (FEAT-035).
  | "installationBatch"
  | "batchDispute";

const DOC_TYPE_FOLDER: Record<DocType, string> = {
  kycGstCertificate: "KYC",
  kycElectricityBill: "KYC",
  agreement: "Agreements",
  installationBatch: "Installation",
  batchDispute: "Installation",
};

const DOC_TYPE_LABEL: Record<DocType, string> = {
  kycGstCertificate: "GSTCertificate",
  kycElectricityBill: "ElectricityBill",
  agreement: "Agreement",
  installationBatch: "BatchPhoto",
  batchDispute: "DisputeEvidence",
};

function slugifySociety(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildDocumentKey(params: {
  society: string;
  // INV-04: always an explicit user selection, never inferred from the file,
  // its contents, or the upload timestamp. The upload forms make this a
  // required <input type="month">, which is the whole point of the invariant.
  month: string; // YYYY-MM
  docType: DocType;
  dateLabel: string; // YYYY-MM-DD or YYYY-MM, used in the filename itself
  identifier?: string;
  extension: string; // no leading dot
}): string {
  const society = slugifySociety(params.society);
  const identifier = params.identifier ? `_${params.identifier.replace(/[^a-zA-Z0-9-]+/g, "-")}` : "";
  const fileName = `${society}_${DOC_TYPE_LABEL[params.docType]}_${params.dateLabel}${identifier}.${params.extension}`;
  return `Documents/${society}/${params.month}/${DOC_TYPE_FOLDER[params.docType]}/${fileName}`;
}
