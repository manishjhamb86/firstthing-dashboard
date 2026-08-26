import { describe, it, expect } from "vitest";
import { extensionOf, kindFromExtension, sniffKind } from "@/lib/file-signature";

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

describe("what a file actually is", () => {
  it("recognises a PDF by its header", () => {
    expect(sniffKind(text("%PDF-1.7\n%âãÏÓ"))).toBe("pdf");
  });

  it("recognises PNG, JPEG and GIF", () => {
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffKind(text("GIF89a"))).toBe("gif");
  });

  // XLSX and DOCX are ZIP containers — the case that matters, because a
  // spreadsheet uploaded where a PDF belongs must be caught here.
  it("recognises a spreadsheet as the zip container it is", () => {
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00))).toBe("zip");
  });

  it("treats a CSV as text, BOM and all", () => {
    expect(sniffKind(text("﻿data,time,consumption/KWh\n"))).toBe("text");
    expect(sniffKind(text("date,kwh\n2026-08-01,12.5\n"))).toBe("text");
  });

  it("does not call arbitrary binary 'text'", () => {
    expect(sniffKind(bytes(0x00, 0x01, 0x02, 0x03, 0x00, 0xff))).toBe("unknown");
  });

  it("treats an empty file as unrecognised rather than as valid text", () => {
    expect(sniffKind(new Uint8Array())).toBe("unknown");
  });

  // The whole point: the name is a claim, the bytes are the fact.
  it("catches a PDF renamed .csv, and a CSV renamed .pdf", () => {
    expect(sniffKind(text("%PDF-1.4"))).toBe("pdf");
    expect(kindFromExtension("readings.csv")).toBe("text");
    expect(sniffKind(text("date,kwh\n"))).toBe("text");
    expect(kindFromExtension("scan.pdf")).toBe("pdf");
  });

  it("reads extensions case-insensitively and survives odd names", () => {
    expect(extensionOf("Scan.PDF")).toBe("pdf");
    expect(extensionOf("no-extension")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
    expect(extensionOf("a.b.c.csv")).toBe("csv");
  });

  it("has no opinion about an unknown extension rather than guessing", () => {
    expect(kindFromExtension("thing.heic")).toBeNull();
  });
});
