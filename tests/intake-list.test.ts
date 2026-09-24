import { describe, expect, it } from "vitest";
import {
  compareIntakes,
  initialSortDir,
  intakeMatches,
  intakeViewOf,
  submittedDisplayStatus,
  type IntakeListRow,
} from "@/lib/intake-list";

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
    expect(intakeViewOf("could_not_read")).toBe("failed");
    expect(intakeViewOf("refused_duplicate")).toBe("duplicate");
    expect(intakeViewOf("ready")).toBe("ready");
    // The bare "submitted" fallback (a missing calculation link) reads as
    // awaiting release — the state a row in that position is almost always
    // genuinely in.
    expect(intakeViewOf("submitted")).toBe("awaiting_release");
  });
  it("gives a discarded row no chip at all", () => {
    expect(intakeViewOf("discarded")).toBeNull();
  });
  it("gives a submitted month's real status its own filter chip (2026-09-24, user-asked)", () => {
    // First fixed to show the right text; the user then asked why awaiting
    // release and released still shared one FILTER once the text was right
    // — each of the four now has its own chip, not one shared "Submitted".
    expect(intakeViewOf("submitted_sent_back")).toBe("sent_back");
    expect(intakeViewOf("submitted_awaiting_release")).toBe("awaiting_release");
    expect(intakeViewOf("submitted_released")).toBe("released");
    expect(intakeViewOf("submitted_superseded")).toBe("superseded");
  });
  it("gives a non-service invoice's filed row its own chip, not Awaiting release (2026-09-24)", () => {
    expect(intakeViewOf("submitted_filed_document")).toBe("filed");
  });
});

describe("submittedDisplayStatus", () => {
  it("names 'awaiting release' for a calculation still sitting at CalculationStatus.submitted — the exact collision that shipped once", () => {
    // CalculationStatus's own "awaiting release" value IS the literal string
    // "submitted", which is also the intake's own terminal status — a naive
    // `submitted_${calcStatus}` template collides into "submitted_submitted"
    // and matches nothing. This is the live bug found on stage 2026-09-24.
    expect(submittedDisplayStatus("submitted")).toBe("submitted_awaiting_release");
    expect(submittedDisplayStatus("submitted")).not.toBe("submitted_submitted");
  });
  it("maps every other real calculation status", () => {
    expect(submittedDisplayStatus("released")).toBe("submitted_released");
    expect(submittedDisplayStatus("sent_back")).toBe("submitted_sent_back");
    expect(submittedDisplayStatus("superseded")).toBe("submitted_superseded");
  });
  it("falls back to the bare status for a missing link or a pre-submission shape", () => {
    expect(submittedDisplayStatus(null)).toBe("submitted");
    expect(submittedDisplayStatus(undefined)).toBe("submitted");
    expect(submittedDisplayStatus("held")).toBe("submitted");
    expect(submittedDisplayStatus("calculated")).toBe("submitted");
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

  it("within the submitted family, ranks what still needs a person ahead of what's done (2026-09-24)", () => {
    const rows = ["submitted_released", "submitted_sent_back", "submitted_superseded", "submitted_awaiting_release"].map((status, i) =>
      row({ status, fileName: `${i}.pdf` }),
    );
    expect(rows.sort(compareIntakes("status", 1)).map((r) => r.status)).toEqual([
      "submitted_sent_back",
      "submitted_awaiting_release",
      "submitted_released",
      "submitted_superseded",
    ]);
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

import { DEFAULT_INTAKE_FILTERS, intakeFiltersQuery, intakeListReturnHref, parseIntakeFilters } from "@/lib/intake-list";

describe("intake list filters in the URL", () => {
  it("round-trips every filter through the query string", () => {
    const f = { view: "review" as const, q: "80850044", society: "soc-ace-city", month: "2026-07", sort: "total" as const, dir: 1 as const };
    const qs = intakeFiltersQuery(f);
    expect(parseIntakeFilters(Object.fromEntries(new URLSearchParams(qs.slice(1))))).toEqual(f);
  });
  it("leaves the defaults out so the plain list is a plain URL", () => {
    expect(intakeFiltersQuery(DEFAULT_INTAKE_FILTERS)).toBe("");
  });
  it("ignores an unknown view or sort rather than trusting it", () => {
    expect(parseIntakeFilters({ view: "nope", sort: "evil" })).toEqual(DEFAULT_INTAKE_FILTERS);
  });
  it("returns only to the intake list, never to an arbitrary stored URL", () => {
    expect(intakeListReturnHref("/admin/billing/intake?view=review")).toBe("/admin/billing/intake?view=review");
    expect(intakeListReturnHref("https://evil.example/")).toBe("/admin/billing/intake");
    expect(intakeListReturnHref(null)).toBe("/admin/billing/intake");
  });
});
