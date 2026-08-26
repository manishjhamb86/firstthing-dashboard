import { describe, it, expect } from "vitest";
import { DOCUMENT_TYPES, documentType, validateDocumentUpload } from "@/lib/document-catalog";

const text = (s: string) => new TextEncoder().encode(s);
const PDF = text("%PDF-1.7\nstuff");
const CSV = text("data,time,consumption/KWh\n2026-08-01,00:00-01:00,1.2\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const XLSX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ok = (i: Parameters<typeof validateDocumentUpload>[0]) => validateDocumentUpload(i);

describe("the registry", () => {
  it("every type states what happens to the file", () => {
    for (const t of DOCUMENT_TYPES) {
      expect(t.operation.length).toBeGreaterThan(20);
      expect(t.acceptedExtensions.length).toBeGreaterThan(0);
      expect(t.acceptedKinds.length).toBeGreaterThan(0);
    }
  });
  it("refuses an unknown type rather than defaulting to permissive", () => {
    expect(documentType("nope")).toBeNull();
    expect(ok({ docTypeId: "nope", fileName: "a.pdf", byteSize: 10, head: PDF }).ok).toBe(false);
  });
});

describe("accepting the right file", () => {
  it("takes a real CSV as a meter reading export", () => {
    expect(ok({ docTypeId: "meterReadings", fileName: "aug.csv", byteSize: 5000, head: CSV }).ok).toBe(true);
  });
  it("takes a real PDF as an executed agreement", () => {
    expect(ok({ docTypeId: "agreement", fileName: "signed.pdf", byteSize: 50_000, head: PDF }).ok).toBe(true);
  });
  it("takes a photo of a GST certificate", () => {
    expect(ok({ docTypeId: "kycGstCertificate", fileName: "gst.png", byteSize: 9_000, head: PNG }).ok).toBe(true);
  });
});

describe("rejecting the wrong file", () => {
  // The case the whole thing exists for: the name is a claim, the bytes are
  // the fact.
  it("catches a PDF renamed .csv", () => {
    const v = ok({ docTypeId: "meterReadings", fileName: "readings.csv", byteSize: 900, head: PDF });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/named \.csv but its contents are a PDF/);
  });

  it("catches a spreadsheet where a PDF belongs", () => {
    const v = ok({ docTypeId: "agreement", fileName: "agreement.pdf", byteSize: 900, head: XLSX });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/spreadsheet/);
  });

  it("refuses a photograph of a contract as the executed agreement", () => {
    // Deliberate: an image of an agreement is not the artefact the record means.
    expect(ok({ docTypeId: "agreement", fileName: "signed.png", byteSize: 900, head: PNG }).ok).toBe(false);
  });

  it("refuses a PDF as a meter reading export by extension, clearly", () => {
    const v = ok({ docTypeId: "meterReadings", fileName: "readings.pdf", byteSize: 900, head: PDF });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/\.csv/);
  });

  it("refuses a file with no extension at all", () => {
    expect(ok({ docTypeId: "agreement", fileName: "scan", byteSize: 900, head: PDF }).ok).toBe(false);
  });

  it("refuses an empty file", () => {
    expect(ok({ docTypeId: "meterReadings", fileName: "a.csv", byteSize: 0, head: CSV }).ok).toBe(false);
  });

  it("refuses one that is too large, and says by how much", () => {
    const v = ok({ docTypeId: "kycGstCertificate", fileName: "gst.pdf", byteSize: 40 * 1024 * 1024, head: PDF });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/40\.0 MB/);
  });

  // Order matters: a wrong file that is also oversized should be told what is
  // wrong with it first, not sent away to shrink a file it cannot use.
  it("reports the wrong format before the size", () => {
    const v = ok({ docTypeId: "agreement", fileName: "x.pdf", byteSize: 90 * 1024 * 1024, head: PNG });
    expect(!v.ok && v.reason).toMatch(/not a valid/);
  });
});
