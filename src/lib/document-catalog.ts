import { KIND_LABEL, kindFromExtension, sniffKind, extensionOf, type FileKind } from "@/lib/file-signature";

/**
 * Every kind of document this back office accepts, what it is FOR, what it
 * has to be attached to, and what a valid file looks like.
 *
 * One registry rather than a rule per screen: the upload tab, the permission
 * check and the validation all read the same entry, so a type cannot be
 * accepted in one place under rules another place does not apply. Adding a
 * document type is an entry here plus its operation — not a new upload path.
 */
export type DocumentContext = "pipeline" | "circuit" | "society";

export type DocumentTypeId =
  | "meterReadings"
  | "kycGstCertificate"
  | "kycElectricityBill"
  | "agreement"
  | "preDemoReport"
  | "postDemoReport"
  | "savingsReport"
  | "gatePass"
  | "inspectionReport";

export type DocumentTypeSpec = {
  id: DocumentTypeId;
  label: string;
  /** What happens to it once accepted — stated on the screen, not implied. */
  operation: string;
  context: DocumentContext;
  /** INV-04 — a period is an explicit selection where the type needs one. */
  needsPeriod: boolean;
  acceptedKinds: FileKind[];
  acceptedExtensions: string[];
  maxBytes: number;
  permission: "manage_pipeline" | "manage_survey";
  /**
   * Whether this tab can complete the operation, or only name it. An
   * executed agreement is attached as part of the execution sequence
   * (printed → notarised → signed → scan), so filing one from here would
   * either skip that state or invent it — the tab says where it belongs
   * instead of half-doing it.
   */
  uploadHere: boolean;
  /** Where it is done instead, when uploadHere is false. */
  handledAt?: string;
};

const MB = 1024 * 1024;

export const DOCUMENT_TYPES: DocumentTypeSpec[] = [
  {
    id: "meterReadings",
    label: "Meter reading export",
    operation:
      "Parsed into daily readings and opened for row-by-row review against the circuit — nothing is stored until you accept it (CON-45).",
    context: "circuit",
    needsPeriod: true,
    // Deliberately text-only, and deliberately NOT "must be a known vendor
    // signature": an unrecognised layout is handled by the AI mapping path,
    // so requiring SONOFF's header here would refuse files the system can in
    // fact read. What it must not be is a PDF or a photo of a meter.
    acceptedKinds: ["text"],
    acceptedExtensions: ["csv", "txt"],
    maxBytes: 25 * MB,
    permission: "manage_pipeline",
    uploadHere: true,
  },
  {
    id: "kycGstCertificate",
    label: "GST certificate (KYC)",
    operation: "Filed against the society's KYC checklist, awaiting verification.",
    context: "pipeline",
    needsPeriod: true,
    acceptedKinds: ["pdf", "png", "jpeg"],
    acceptedExtensions: ["pdf", "png", "jpg", "jpeg"],
    maxBytes: 15 * MB,
    permission: "manage_pipeline",
    uploadHere: true,
  },
  {
    id: "kycElectricityBill",
    label: "Electricity bill (KYC)",
    operation: "Filed against the society's KYC checklist, awaiting verification.",
    context: "pipeline",
    needsPeriod: true,
    acceptedKinds: ["pdf", "png", "jpeg"],
    acceptedExtensions: ["pdf", "png", "jpg", "jpeg"],
    maxBytes: 15 * MB,
    permission: "manage_pipeline",
    uploadHere: true,
  },
  {
    id: "agreement",
    label: "Executed agreement",
    // For a society that was already signed before this system existed there
    // is no sequence to walk (the user's correction, 2026-08-26): the deal
    // happened, and what is being filed is the copy we hold. So it attaches
    // to the SOCIETY as the executed copy on record, and no Agreement record
    // is minted — inventing printed/notarised/signed timestamps for a deal
    // this system never walked would be worse than not having them.
    //
    // A deal executed THROUGH the system is untouched: FEAT-029's Agreement
    // step still owns that path and still records the sequence.
    operation:
      "Filed against the society as the executed copy on record. No execution sequence is invented for it — a deal executed through the system still records printing, notarising and signing on its own step.",
    context: "society",
    needsPeriod: true,
    // What actually exists varies: a PDF, the Word original, or a scan —
    // and sometimes the Word file is simply gone (the user's own note,
    // 2026-08-26). Refusing a scan because it is an image would refuse the
    // only copy some societies have. A scan of a signed agreement IS the
    // executed copy; the earlier "an image is a different artefact" reading
    // was about a photograph standing in for a document that exists
    // elsewhere, which is not this case.
    acceptedKinds: ["pdf", "zip", "png", "jpeg"],
    acceptedExtensions: ["pdf", "docx", "png", "jpg", "jpeg"],
    maxBytes: 25 * MB,
    permission: "manage_pipeline",
    uploadHere: true,
  },
  ...(
    [
      // Same reasoning as the agreement: a report may only exist as the Word
      // original or as a scan, and refusing those refuses the only copy.
      ["preDemoReport", "Pre-installation demo report", ["pdf", "zip", "png", "jpeg"], ["pdf", "docx", "png", "jpg", "jpeg"], 25],
      ["postDemoReport", "Post-installation demo report", ["pdf", "zip", "png", "jpeg"], ["pdf", "docx", "png", "jpg", "jpeg"], 25],
      ["savingsReport", "Savings report (previous)", ["pdf", "zip", "png", "jpeg"], ["pdf", "docx", "png", "jpg", "jpeg"], 25],
      ["gatePass", "Gate pass", ["pdf", "zip", "png", "jpeg"], ["pdf", "docx", "png", "jpg", "jpeg"], 15],
      ["inspectionReport", "Inspection report", ["pdf", "zip", "png", "jpeg"], ["pdf", "docx", "png", "jpg", "jpeg"], 25],
    ] as const
  ).map(([id, label, kinds, exts, mb]) => ({
    id: id as DocumentTypeId,
    label,
    operation:
      "Filed against the society with its period, and retrievable from the society's documents. Not fed into any calculation — a scanned report is not evidence a figure can be recomputed from (INV-02).",
    context: "society" as const,
    needsPeriod: true,
    acceptedKinds: [...kinds] as FileKind[],
    acceptedExtensions: [...exts],
    maxBytes: mb * MB,
    permission: "manage_pipeline" as const,
    uploadHere: true,
  })),
];


// Historical and external documents (the user's list, 2026-08-26). These
// have no workflow of their own here — several are things this system now
// GENERATES, and what is being filed is the copy from before it did. They
// attach to the society with their period and stay retrievable; they are
// deliberately not fed into any calculation, because a scanned report is not
// evidence a figure can be recomputed from (INV-02).

export function documentType(id: string): DocumentTypeSpec | null {
  return DOCUMENT_TYPES.find((d) => d.id === id) ?? null;
}

export type UploadVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether this file may be accepted as this document type.
 *
 * The order matters. The extension is checked first because it produces the
 * clearest message, but it is never the deciding test — the bytes are, since
 * a renamed file passes every name-based check there is. Size is checked
 * last so an operator is told *what is wrong with the file* before being told
 * it is also too big.
 */
export function validateDocumentUpload(input: {
  docTypeId: string;
  fileName: string;
  byteSize: number;
  /** The first few KB of the file. The only evidence that cannot be mistyped. */
  head: Uint8Array;
}): UploadVerdict {
  const spec = documentType(input.docTypeId);
  if (!spec) return { ok: false, reason: "Choose a document type first." };

  const ext = extensionOf(input.fileName);
  if (!ext) {
    return { ok: false, reason: `That file has no extension. ${spec.label} must be ${listOf(spec.acceptedExtensions)}.` };
  }
  if (!spec.acceptedExtensions.includes(ext)) {
    return {
      ok: false,
      reason: `A ${spec.label.toLowerCase()} must be ${listOf(spec.acceptedExtensions)} — this is a .${ext} file.`,
    };
  }

  const actual = sniffKind(input.head);
  const claimed = kindFromExtension(input.fileName);

  // The rule is that the file IS what its name says, and that the name is one
  // this type accepts — not merely that the contents land somewhere in the
  // accepted list. That distinction started mattering the moment .docx was
  // accepted (2026-08-26): a .docx and an .xlsx are both ZIP containers, so
  // "contents are a zip" would let a spreadsheet through under a .pdf name.
  // Comparing against what the EXTENSION claims closes that without giving up
  // anything — the extension was already checked against the accepted list.
  if (claimed && actual !== claimed) {
    // Both halves are named: "rejected" without saying what the file actually
    // turned out to be sends the operator back to the same file to try again.
    return {
      ok: false,
      reason: `That file is not a valid ${spec.label.toLowerCase()}. It is named .${ext} but its contents are ${KIND_LABEL[actual]}.`,
    };
  }
  if (!spec.acceptedKinds.includes(actual)) {
    return {
      ok: false,
      reason: `That file is not a valid ${spec.label.toLowerCase()}. Its contents are ${KIND_LABEL[actual]}.`,
    };
  }

  if (input.byteSize <= 0) return { ok: false, reason: "That file is empty." };
  if (input.byteSize > spec.maxBytes) {
    return {
      ok: false,
      reason: `That file is ${(input.byteSize / MB).toFixed(1)} MB — the limit for a ${spec.label.toLowerCase()} is ${Math.round(spec.maxBytes / MB)} MB.`,
    };
  }
  return { ok: true };
}

function listOf(exts: string[]): string {
  const named = exts.map((e) => `.${e}`);
  if (named.length === 1) return `a ${named[0]} file`;
  return `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}`;
}
