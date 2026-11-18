import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildInspectionPdf, inspectionPdfFileName, safe, wrap, type InspectionPdfData } from "@/lib/inspection-pdf";
import { isSignedCopyType } from "@/lib/inspection-file";

const base: InspectionPdfData = {
  id: "cmabc123xyz",
  societyName: "RG Residency",
  societyLocation: "Sector 120, Noida",
  area: "Basement · Tube light",
  period: "2026-11",
  inspectedAt: new Date("2026-11-17T10:30:00Z"),
  inspectorName: "Yogendra",
  inspectorContact: "yogendra@firsthing.earth",
  totalLightsChecked: 774,
  societyRepName: "R. K. Sharma",
  notes: "Two sensors need recalibration — ₹ quote to follow.",
  findings: [{ srNo: 1, location: "Tower B lobby", sensorStatus: "off", physicalDamage: true, actionReplace: true, remarks: null }],
  generatedAt: new Date("2026-11-18T09:00:00Z"),
};

describe("inspection report PDF", () => {
  it("produces a one-page PDF for an ordinary visit", async () => {
    const bytes = await buildInspectionPdf(base);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("carries a long fixture list over extra pages instead of overflowing", async () => {
    const findings = Array.from({ length: 60 }, (_, i) => ({ ...base.findings[0], srNo: i + 1, remarks: "Cover cracked, needs a replacement sensor" }));
    const doc = await PDFDocument.load(await buildInspectionPdf({ ...base, findings, societyRepName: null, notes: null }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("draws a visit with no findings", async () => {
    const doc = await PDFDocument.load(await buildInspectionPdf({ ...base, findings: [] }));
    expect(doc.getPageCount()).toBe(1);
  });

  it("replaces characters the standard font cannot draw rather than throwing", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(safe("₹500 → 6 × 2", font)).toBe("Rs.500 -> 6 x 2");
    expect(safe("नमस्ते", font)).toMatch(/^\?+$/);
  });

  it("wraps text to a width and cuts an unbroken run", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = wrap("Basement B2 ramp near pillar 14 beside the DG room", font, 9, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 9)).toBeLessThanOrEqual(100);
    for (const l of wrap("x".repeat(200), font, 9, 60)) expect(font.widthOfTextAtSize(l, 9)).toBeLessThanOrEqual(60);
  });

  it("names the file by society, month and a short id", () => {
    expect(inspectionPdfFileName("RG Residency (Phase 2)", "2026-11", "cmabc123xyz")).toBe("RG_Residency_Phase_2_Inspection_2026-11_123xyz.pdf");
  });

  it("accepts a photo or a PDF scan as the signed copy, nothing else", () => {
    expect(isSignedCopyType("image/jpeg")).toBe(true);
    expect(isSignedCopyType("application/pdf")).toBe(true);
    expect(isSignedCopyType("text/csv")).toBe(false);
  });
});
