import { describe, expect, it } from "vitest";
import { checkBatchReview, refuseDispute } from "@/lib/onlooker";

const onlooker = { id: "p-onlooker", societyId: "soc-1" };
const batch = { id: "b1", state: "awaiting_review", societyId: "soc-1", onlookerId: "p-onlooker" };

describe("TC-035-4 — only the named onlooker approves (FEAT-035-AC-4)", () => {
  it("allows the named onlooker", () => {
    expect(checkBatchReview(onlooker, batch).ok).toBe(true);
  });

  it("refuses another account of the same society — viewing is not approving", () => {
    const r = checkBatchReview({ id: "p-other", societyId: "soc-1" }, batch);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("not-onlooker");
  });

  it("refuses the society's office-bearer too, when they are not the named onlooker", () => {
    // This is the assertion that pins the rule down: batch approval is not a
    // GATE-04 binding act, so standing authority does not substitute for
    // being named.
    const r = checkBatchReview({ id: "p-bearer", societyId: "soc-1" }, batch);
    expect(r.ok === false && r.reason).toBe("not-onlooker");
  });

  it("refuses another society's onlooker (INV-05), and says so rather than naming ours", () => {
    const r = checkBatchReview({ id: "p-onlooker", societyId: "soc-2" }, batch);
    expect(r.ok === false && r.reason).toBe("wrong-society");
  });

  it("refuses a signed-out viewer", () => {
    expect(checkBatchReview(null, batch).ok).toBe(false);
  });

  it("refuses reviewing a day that was already reviewed", () => {
    const r = checkBatchReview(onlooker, { ...batch, state: "approved" });
    expect(r.ok === false && r.reason).toBe("not-awaiting-review");
  });

  it("refuses reviewing a batch the field team has not submitted yet", () => {
    const r = checkBatchReview(onlooker, { ...batch, state: "draft" });
    expect(r.ok === false && r.reason).toBe("not-awaiting-review");
  });
});

describe("TC-035-3b — disputing carries evidence, approving does not", () => {
  const good = { evidencePhotoKeys: ["k1"], location: "Tower B, 3rd floor lobby", note: "Two fittings not working." };

  it("accepts a dispute with photo, location and a note", () => {
    expect(refuseDispute(good)).toBeNull();
  });

  it("refuses a dispute with no photo", () => {
    expect(refuseDispute({ ...good, evidencePhotoKeys: [] })).toContain("photo");
  });

  it("refuses a dispute with no location — it has to be findable tomorrow", () => {
    expect(refuseDispute({ ...good, location: "  " })).toContain("where");
  });

  it("refuses a dispute with no explanation", () => {
    expect(refuseDispute({ ...good, note: "" })).toContain("what is wrong");
  });
});
