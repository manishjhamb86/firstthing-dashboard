import { describe, expect, it } from "vitest";
import { compareIntakes, initialSortDir, intakeMatches, intakeViewOf, type IntakeListRow } from "@/lib/intake-list";

const row = (over: Partial<IntakeListRow>): IntakeListRow => ({
  fileName: "Invoice_INV80850044.pdf",
  invoiceNumber: null,
  society: null,
  periodKey: null,
  total: null,
  status: "uploaded",
  statusLabel: "Not read yet",
  uploadedAtMs: 1_000,
  ...over,
});

describe("intakeViewOf — an unread file is not a review item", () => {
  it("puts the machine's queue and the person's queue under different chips", () => {
    expect(intakeViewOf("uploaded")).toBe("unread");
    expect(intakeViewOf("reading")).toBe("unread");
    expect(intakeViewOf("needs_review")).toBe("review");
    expect(intakeViewOf("could_not_read")).toBe("review");
    expect(intakeViewOf("refused_duplicate")).toBe("review");
    expect(intakeViewOf("ready")).toBe("ready");
    expect(intakeViewOf("submitted")).toBe("submitted");
  });
  it("gives a discarded row no chip at all", () => {
    expect(intakeViewOf("discarded")).toBeNull();
  });
});

describe("compareIntakes", () => {
  const a = row({ fileName: "a.pdf", society: "Ace City", periodKey: "2026-07", total: 100, uploadedAtMs: 3 });
  const b = row({ fileName: "b.pdf", society: "Zeta", periodKey: "2026-05", total: 900, uploadedAtMs: 2 });
  const none = row({ fileName: "c.pdf", uploadedAtMs: 1 });

  it("sinks a row with nothing in the column in BOTH directions", () => {
    expect([none, b, a].sort(compareIntakes("total", 1)).map((r) => r.fileName)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    expect([none, b, a].sort(compareIntakes("total", -1)).map((r) => r.fileName)).toEqual(["b.pdf", "a.pdf", "c.pdf"]);
    expect([none, a, b].sort(compareIntakes("society", -1)).map((r) => r.fileName)).toEqual(["b.pdf", "a.pdf", "c.pdf"]);
    expect([none, a, b].sort(compareIntakes("period", 1)).map((r) => r.fileName)).toEqual(["b.pdf", "a.pdf", "c.pdf"]);
  });

  it("sorts the invoice column by the invoice number once read, the file name before", () => {
    const read = row({ fileName: "zzz.pdf", invoiceNumber: "FT/2026-27/001" });
    const unread = row({ fileName: "Invoice_9.pdf" });
    expect([unread, read].sort(compareIntakes("invoice", 1)).map((r) => r.fileName)).toEqual(["zzz.pdf", "Invoice_9.pdf"]);
  });

  it("orders status by how far behind the row is", () => {
    const rows = ["submitted", "uploaded", "needs_review", "could_not_read"].map((status, i) => row({ status, fileName: `${i}.pdf` }));
    expect(rows.sort(compareIntakes("status", 1)).map((r) => r.status)).toEqual(["uploaded", "could_not_read", "needs_review", "submitted"]);
  });

  it("breaks ties newest-upload first", () => {
    const x = row({ fileName: "x.pdf", total: 5, uploadedAtMs: 1 });
    const y = row({ fileName: "y.pdf", total: 5, uploadedAtMs: 2 });
    expect([x, y].sort(compareIntakes("total", 1)).map((r) => r.fileName)).toEqual(["y.pdf", "x.pdf"]);
  });

  it("starts text and status from the front, figures and dates at the far end", () => {
    expect(initialSortDir("invoice")).toBe(1);
    expect(initialSortDir("society")).toBe(1);
    expect(initialSortDir("status")).toBe(1);
    expect(initialSortDir("total")).toBe(-1);
    expect(initialSortDir("period")).toBe(-1);
    expect(initialSortDir("uploaded")).toBe(-1);
  });
});

describe("intakeMatches — a partial invoice number finds its row", () => {
  const r = { ...row({ invoiceNumber: "FT/2026-27/055", society: "Aditya Mega City", periodKey: "2026-07" }), periodLabel: "July 2026" };
  it("matches any fragment of the file name or invoice number", () => {
    expect(intakeMatches(r, "80850044")).toBe(true);
    expect(intakeMatches(r, "inv8085")).toBe(true);
    expect(intakeMatches(r, "27/055")).toBe(true);
    expect(intakeMatches(r, "055")).toBe(true);
  });
  it("matches words in any order across society and month", () => {
    expect(intakeMatches(r, "july aditya")).toBe(true);
    expect(intakeMatches(r, "2026-07 mega")).toBe(true);
    expect(intakeMatches(r, "aditya august")).toBe(false);
  });
  it("an empty query matches everything", () => {
    expect(intakeMatches(r, "   ")).toBe(true);
  });
});
