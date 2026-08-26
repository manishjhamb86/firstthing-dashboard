/**
 * What a file ACTUALLY is, from its leading bytes — not from its name.
 *
 * An extension is a claim by whoever named the file, and the browser's own
 * MIME guess is usually derived from that same extension, so neither can
 * catch the ordinary mistake this exists for: a spreadsheet exported as
 * `.pdf`, a photo renamed `.csv`, a Word file where a scan was meant. The
 * bytes are the only part of an upload that cannot be mistyped.
 *
 * Pure, so it is unit-testable and so the same decision runs on the client
 * (for a fast message) and on the server (where it is the one that counts).
 */
export type FileKind = "pdf" | "png" | "jpeg" | "gif" | "webp" | "zip" | "text" | "unknown";

const MAGIC: { kind: FileKind; bytes: number[]; offset?: number }[] = [
  { kind: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { kind: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { kind: "gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // XLSX/DOCX are ZIP containers, which is exactly why a spreadsheet
  // uploaded where a PDF belongs must be caught here rather than downstream.
  { kind: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { kind: "webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // RIFF....WEBP
];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/**
 * Whether the head of a file looks like text. A NUL byte settles it — no
 * text encoding this product ingests contains one — and beyond that a run of
 * control characters means binary. A UTF-8 BOM is text (SONOFF exports carry
 * one).
 */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let control = 0;
  for (const b of bytes) {
    if (b === 0x00) return false;
    // Tab, LF, CR are ordinary in a CSV; other C0 codes are not.
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) control++;
  }
  return control / bytes.length < 0.05;
}

export function sniffKind(head: Uint8Array): FileKind {
  for (const m of MAGIC) {
    if (startsWith(head, m.bytes, m.offset ?? 0)) return m.kind;
  }
  return looksLikeText(head) ? "text" : "unknown";
}

/** The extension, lowercased, without the dot. "" when there is none. */
export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i <= 0 || i === fileName.length - 1) return "";
  return fileName.slice(i + 1).toLowerCase();
}

const EXTENSION_KIND: Record<string, FileKind> = {
  pdf: "pdf",
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  gif: "gif",
  webp: "webp",
  csv: "text",
  txt: "text",
  xlsx: "zip",
  xls: "unknown",
  docx: "zip",
};

/** What the file's NAME claims it is. */
export function kindFromExtension(fileName: string): FileKind | null {
  return EXTENSION_KIND[extensionOf(fileName)] ?? null;
}

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: "a PDF",
  png: "a PNG image",
  jpeg: "a JPEG image",
  gif: "a GIF image",
  webp: "a WebP image",
  zip: "a spreadsheet or zipped document",
  text: "a text or CSV file",
  unknown: "an unrecognised binary file",
};
