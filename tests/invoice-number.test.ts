import { describe, expect, it } from "vitest";
import { normaliseInvoiceNumber } from "@/lib/invoice-number";

describe("supplier invoice numbers", () => {
  it("treats case, spaces and separators as the same invoice", () => {
    expect(normaliseInvoiceNumber(" sq262713 ")).toBe("SQ262713");
    expect(normaliseInvoiceNumber("FT/2026-27/104")).toBe(normaliseInvoiceNumber("ft 2026 27 104"));
    expect(normaliseInvoiceNumber("SQ262713")).not.toBe(normaliseInvoiceNumber("SQ262714"));
  });
});
