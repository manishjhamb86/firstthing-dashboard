// S3 key convention, decided 2026-08-05 — see PROJECT_CONTEXT.md.
// Documents/{Society}/{YYYY-MM}/{DocTypeFolder}/{Society}_{DocTypeLabel}_{dateLabel}[_{identifier}].{ext}

export type DocType =
  | "invoice"
  | "meterReadings"
  | "savingsReport"
  | "preDemoReport"
  | "postDemoReport"
  | "agreement"
  | "inspectionReport"
  | "gatePass";

const DOC_TYPE_FOLDER: Record<DocType, string> = {
  invoice: "Invoices",
  meterReadings: "MeterReadings",
  savingsReport: "SavingsReports",
  preDemoReport: "PreDemoReports",
  postDemoReport: "PostDemoReports",
  agreement: "Agreements",
  inspectionReport: "InspectionReports",
  gatePass: "GatePasses",
};

const DOC_TYPE_LABEL: Record<DocType, string> = {
  invoice: "Invoice",
  meterReadings: "MeterReadings",
  savingsReport: "SavingsReport",
  preDemoReport: "PreDemoReport",
  postDemoReport: "PostDemoReport",
  agreement: "Agreement",
  inspectionReport: "InspectionReport",
  gatePass: "GatePass",
};

function slugifySociety(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildDocumentKey(params: {
  society: string;
  month: string; // YYYY-MM — always an explicit user selection, never inferred
  docType: DocType;
  dateLabel: string; // YYYY-MM-DD or YYYY-MM, used in the filename itself
  identifier?: string; // e.g. invoice number, appended before the extension
  extension: string; // no leading dot
}): string {
  const society = slugifySociety(params.society);
  const identifier = params.identifier ? `_${params.identifier.replace(/[^a-zA-Z0-9-]+/g, "-")}` : "";
  const fileName = `${society}_${DOC_TYPE_LABEL[params.docType]}_${params.dateLabel}${identifier}.${params.extension}`;
  return `Documents/${society}/${params.month}/${DOC_TYPE_FOLDER[params.docType]}/${fileName}`;
}
