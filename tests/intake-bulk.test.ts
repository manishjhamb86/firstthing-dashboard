import { describe, expect, it } from "vitest";
import { bulkActionsFor } from "@/lib/intake-bulk";

const row = (status: string, hasSociety = true, hasPeriod = true) => ({ status, hasSociety, hasPeriod });

describe("bulkActionsFor", () => {
  it("a needs-review row with society and month can be filed, not submitted", () => {
    expect(bulkActionsFor(row("needs_review"))).toEqual(["file"]);
  });
  it("a row without a confirmed month cannot be filed (INV-04)", () => {
    expect(bulkActionsFor(row("needs_review", true, false))).toEqual([]);
    expect(bulkActionsFor(row("needs_review", false, true))).toEqual([]);
  });
  it("a ready row can be submitted or filed", () => {
    expect(bulkActionsFor(row("ready"))).toEqual(["submit", "file"]);
  });
  it("a filed invoice and a month awaiting release can be released", () => {
    expect(bulkActionsFor(row("submitted_filed_document"))).toEqual(["release"]);
    expect(bulkActionsFor(row("submitted_awaiting_release"))).toEqual(["release"]);
  });
  it("released, duplicate, unread and failed rows take no bulk action", () => {
    for (const s of ["submitted_released", "submitted_filed_released", "refused_duplicate", "uploaded", "could_not_read"])
      expect(bulkActionsFor(row(s))).toEqual([]);
  });
});
